/**
 * ENG-533. These drive the REAL key module the hook calls — delete
 * `freezeAttempt`/`retireAttemptKey` from use-send-payment.ts and the
 * screen-level cases in __tests__/screens/send-confirmation.spec.tsx fail;
 * change the rule here and these fail.
 *
 * The rule has exactly three ways to be wrong, and all three cost money:
 *
 *  - a key that does NOT survive the repeat (the original bug: a per-mount
 *    uuid, minted afresh by the back-navigation that IS the retry) makes a
 *    resent payment look like a second one, and the customer pays twice;
 *  - a key that survives a definitive FAILURE makes the backend replay the
 *    recorded failure, and the customer can never succeed;
 *  - a key that survives the repeat while the INPUT does not gets the repeat
 *    answered with IdempotencyKeyReuseError rather than a replay, which the
 *    screen would read as a failure — and the customer pays twice anyway.
 */
// The store has to be visible to the cold-reload cases below, so it lives in
// the test rather than in the package's own jest mock. `mock`-prefixed so
// jest's hoisting of `jest.mock` above the imports is allowed to reference it.
const mockAsyncStorageStore = new Map<string, string>()
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockAsyncStorageStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockAsyncStorageStore.set(key, value)
    }),
    removeItem: jest.fn(async (key: string) => {
      mockAsyncStorageStore.delete(key)
    }),
  },
}))

import { WalletCurrency } from "@app/graphql/generated"
import {
  createAmountLightningPaymentDetails,
  createLnurlPaymentDetails,
  createNoAmountLightningPaymentDetails,
} from "@app/screens/send-bitcoin-screen/payment-details/lightning"
import { createIntraledgerPaymentDetails } from "@app/screens/send-bitcoin-screen/payment-details/intraledger"
import {
  ConvertMoneyAmount,
  SendPaymentMutationParams,
} from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { IDEMPOTENT_SEND_INPUTS } from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { SendWireInput } from "@app/screens/send-bitcoin-screen/payment-details/send-wire-input"
import {
  attemptFingerprint,
  attemptFingerprintOf,
  attemptKey,
  freezeAttempt,
  frozenSendInvoice,
  resetSendAttemptKeys,
  retireAttemptKey,
} from "@app/screens/send-bitcoin-screen/send-attempt-key"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { PaymentType } from "@galoymoney/client"
import { LnUrlPayServiceResponse } from "lnurl-pay/dist/types/types"

import { createSendPaymentMocks } from "../payment-details/helpers"

const attempt = {
  walletId: "usd-wallet",
  paymentType: "lightning",
  destination: "lnbc1someinvoice",
  unitOfAccountAmount: 250,
  unitOfAccountCurrency: "USD",
  memo: "rent",
}

// A minimal stand-in for what a payment detail hands `freezeAttempt` — the
// mutation input as data. The cases that care about the input reaching the
// server build it from the real detail factories instead.
const wireInputFor = (paymentRequest: string): SendWireInput => ({
  inputType: IDEMPOTENT_SEND_INPUTS.lnInvoice,
  input: { walletId: attempt.walletId, paymentRequest, memo: attempt.memo },
})

beforeEach(() => {
  mockAsyncStorageStore.clear()
  resetSendAttemptKeys()
})

describe("the key identifies the attempt, not the screen", () => {
  it("reproduces the same key for the same attempt", () => {
    // The retry a user can actually perform here unmounts the confirm screen,
    // so nothing that lives on the mount can carry the key across it. Derived
    // from the attempt, a freshly built fingerprint reproduces it exactly.
    const first = attemptKey(attemptFingerprint(attempt))
    const afterGoingBackAndForward = attemptKey(attemptFingerprint({ ...attempt }))

    expect(afterGoingBackAndForward).toBe(first)
  })

  it("is a v5 uuid", () => {
    expect(attemptKey(attemptFingerprint(attempt))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  // Each of these is a change the user made on purpose, meaning a genuinely
  // different payment. Sharing a key would have the backend answer the new one
  // with the old one's outcome.
  const differentPayments: [string, Partial<typeof attempt>][] = [
    ["a different wallet", { walletId: "btc-wallet" }],
    ["a different destination", { destination: "lnbc1anotherinvoice" }],
    ["a different amount", { unitOfAccountAmount: 251 }],
    ["a different currency", { unitOfAccountCurrency: "BTC" }],
    ["a different memo", { memo: "not rent" }],
    ["a different payment type", { paymentType: "intraledger" }],
  ]

  differentPayments.forEach(([label, override]) => {
    it(`mints a different key for ${label}`, () => {
      expect(attemptKey(attemptFingerprint({ ...attempt, ...override }))).not.toBe(
        attemptKey(attemptFingerprint(attempt)),
      )
    })
  })

  it("cannot be fooled by fields that run together", () => {
    // Concatenating the fields with no separator would make these two the same
    // string, and two different payments would then share a key.
    const runTogether = attemptKey(
      attemptFingerprint({
        ...attempt,
        walletId: `${attempt.walletId}${attempt.paymentType}`,
        paymentType: "",
      }),
    )
    expect(runTogether).not.toBe(attemptKey(attemptFingerprint(attempt)))
  })
})

// What the hook actually feeds the fingerprint, driven through the real
// payment-detail builders. Two of those fields move on their own in
// production, and a fingerprint that moves on its own is no fingerprint at
// all: the retry it exists to make recognisable is exactly the pass that
// changes them.
describe("the fingerprint of a payment detail", () => {
  const PAYMENT_REQUEST = "lnbc1payeeminted"
  const usdWallet = { currency: WalletCurrency.Usd, id: "usd-wallet" } as const

  // Sats in, cents out, at whatever the price happens to be this tick.
  const priceOf =
    (centsPerSat: number): ConvertMoneyAmount =>
    (moneyAmount, currency) => ({
      amount:
        currency === WalletCurrency.Btc
          ? moneyAmount.amount
          : Math.round(moneyAmount.amount * centsPerSat),
      currency,
      currencyCode: currency,
    })

  const lnurlParams = { min: 1, max: 100000 } as unknown as LnUrlPayServiceResponse

  it("does not move when the realtime price does", () => {
    // The settlement amount of a USD/USDT send is a price-derived estimate
    // (`settlementAmountIsEstimated`), and the details screen re-derives it on
    // every realtime-price tick — which is the screen sitting mounted
    // underneath this one, so the back-navigation that IS the retry hands back
    // a detail whose settlement amount has moved by a cent. Keyed on that, the
    // repeat gets a different uuid and the backend books a second payment.
    const detail = createNoAmountLightningPaymentDetails({
      paymentRequest: PAYMENT_REQUEST,
      unitOfAccountAmount: toBtcMoneyAmount(1000),
      convertMoneyAmount: priceOf(0.1),
      sendingWalletDescriptor: usdWallet,
    })
    const afterPriceTick = detail.setConvertMoneyAmount(priceOf(0.099))

    // The estimate really did move, so this case cannot pass vacuously.
    expect(afterPriceTick.settlementAmount.amount).not.toBe(
      detail.settlementAmount.amount,
    )
    expect(attemptKey(attemptFingerprintOf(afterPriceTick))).toBe(
      attemptKey(attemptFingerprintOf(detail)),
    )
  })

  it("does not move when an amount-carrying invoice is repriced either", () => {
    // The worst shape: `lnInvoicePaymentSend`'s input carries no amount at all,
    // so two byte-identical requests would get different keys purely because
    // BTC moved.
    const detail = createAmountLightningPaymentDetails({
      paymentRequest: PAYMENT_REQUEST,
      paymentRequestAmount: toBtcMoneyAmount(1000),
      convertMoneyAmount: priceOf(0.1),
      sendingWalletDescriptor: usdWallet,
    })
    const afterPriceTick = detail.setConvertMoneyAmount(priceOf(0.099))

    expect(afterPriceTick.settlementAmount.amount).not.toBe(
      detail.settlementAmount.amount,
    )
    expect(attemptKey(attemptFingerprintOf(afterPriceTick))).toBe(
      attemptKey(attemptFingerprintOf(detail)),
    )
  })

  it("survives an LNURL invoice being re-minted", () => {
    // An LNURL detail's `paymentRequest` is minted fresh on every pass forward
    // through the details screen (IBEX caps those invoices at 60s), and that
    // pass is the retry. Keyed on the bolt11, an LNURL send could never carry
    // the same key twice — zero protection on a path the backend does accept
    // the key for.
    //
    // Dropping the bolt11 from the IDENTITY is only safe because the SEND is
    // frozen alongside the key: the repeat goes out with bolt11-A, so the
    // server's own `ln|${paymentRequest}` fingerprint matches too. See
    // "the send is frozen with the key" below — without it this key survives
    // the retry while the input does not, and the backend answers
    // IdempotencyKeyReuseError instead of replaying.
    const detail = createLnurlPaymentDetails({
      lnurl: "someone@flashapp.me",
      lnurlParams,
      paymentRequest: "lnbc1firstmint",
      paymentRequestAmount: toBtcMoneyAmount(1000),
      unitOfAccountAmount: toBtcMoneyAmount(1000),
      convertMoneyAmount: priceOf(0.1),
      sendingWalletDescriptor: usdWallet,
    })
    if (detail.paymentType !== PaymentType.Lnurl) throw new Error("not an lnurl detail")

    const reminted = detail.setInvoice({
      paymentRequest: "lnbc1secondmint",
      paymentRequestAmount: toBtcMoneyAmount(1000),
    })

    expect(reminted.paymentRequest).not.toBe(detail.paymentRequest)
    expect(attemptKey(attemptFingerprintOf(reminted))).toBe(
      attemptKey(attemptFingerprintOf(detail)),
    )
  })

  it("gives a deliberate repeat of an identical send a fresh key once the first one resolved", () => {
    // The fingerprint is purely content-derived, so a Flashcard reload of the
    // same amount to the same LNURL re-derives the SAME string every time.
    // That is correct while an attempt is unresolved — it is what makes a lost
    // response recognisable — and catastrophic afterwards: the backend would
    // return the first payment's success and the second reload would never
    // leave the wallet, with the screen showing success either way.
    //
    // retireAttemptKey is what separates them, and the hook calls it on ANY
    // server-supplied status, not only Failure.
    const reload = () =>
      createLnurlPaymentDetails({
        lnurl: "flashcard@flashapp.me",
        lnurlParams,
        paymentRequest: "lnbc1firstmint",
        paymentRequestAmount: toBtcMoneyAmount(2000),
        unitOfAccountAmount: toBtcMoneyAmount(2000),
        convertMoneyAmount: priceOf(0.1),
        sendingWalletDescriptor: usdWallet,
      })

    const fingerprint = attemptFingerprintOf(reload())
    const first = attemptKey(fingerprint)

    // Unresolved: a repeat must carry the same key.
    expect(attemptKey(attemptFingerprintOf(reload()))).toBe(first)

    // Server answered — whatever it said, the outcome is known.
    retireAttemptKey(fingerprint)

    expect(attemptKey(attemptFingerprintOf(reload()))).not.toBe(first)
  })

  it("still separates two different sends to the same lightning address", () => {
    // The other half of the LNURL rule: dropping the bolt11 from the identity
    // must not make a second, genuinely different payment share the first's
    // key.
    const send = (sats: number) =>
      createLnurlPaymentDetails({
        lnurl: "someone@flashapp.me",
        lnurlParams,
        paymentRequest: "lnbc1firstmint",
        paymentRequestAmount: toBtcMoneyAmount(sats),
        unitOfAccountAmount: toBtcMoneyAmount(sats),
        convertMoneyAmount: priceOf(0.1),
        sendingWalletDescriptor: usdWallet,
      })

    expect(attemptKey(attemptFingerprintOf(send(1001)))).not.toBe(
      attemptKey(attemptFingerprintOf(send(1000))),
    )
  })

  it("keys a payee-minted invoice on the invoice itself", () => {
    // For the invoice types the bolt11 is the payee's, fixed for the life of
    // the attempt, and more specific than the destination — two invoices from
    // the same payee are two payments.
    const detail = (paymentRequest: string) =>
      createAmountLightningPaymentDetails({
        paymentRequest,
        paymentRequestAmount: toBtcMoneyAmount(1000),
        convertMoneyAmount: priceOf(0.1),
        sendingWalletDescriptor: usdWallet,
      })

    expect(attemptKey(attemptFingerprintOf(detail("lnbc1second")))).not.toBe(
      attemptKey(attemptFingerprintOf(detail("lnbc1first"))),
    )
  })
})

describe("retiring a key", () => {
  it("issues a fresh key after a definitive failure", () => {
    const fingerprint = attemptFingerprint(attempt)
    const failed = attemptKey(fingerprint)

    retireAttemptKey(fingerprint)

    // Reusing `failed` would make the backend replay the recorded failure and
    // the customer could never succeed.
    expect(attemptKey(fingerprint)).not.toBe(failed)
  })

  it("keeps the replacement stable so the NEXT attempt is retryable too", () => {
    const fingerprint = attemptFingerprint(attempt)
    retireAttemptKey(fingerprint)

    // The second attempt has to survive a lost response exactly as the first
    // one did, or the fix only works once.
    expect(attemptKey(fingerprint)).toBe(attemptKey(fingerprint))
  })

  it("retires only the attempt it was told about", () => {
    const other = attemptFingerprint({ ...attempt, unitOfAccountAmount: 999 })
    const before = attemptKey(other)

    retireAttemptKey(attemptFingerprint(attempt))

    expect(attemptKey(other)).toBe(before)
  })
})

describe("module state never hands back a spent key", () => {
  it("still refuses the retired key after a session full of other attempts", () => {
    const oldest = attemptFingerprint({ ...attempt, destination: "invoice-0" })
    const spent = attemptKey(oldest)
    retireAttemptKey(oldest)
    const replacement = attemptKey(oldest)

    for (let i = 1; i <= 200; i += 1) {
      retireAttemptKey(attemptFingerprint({ ...attempt, destination: `invoice-${i}` }))
    }

    // An eviction cap made this fail: dropping the insertion-oldest entry sent
    // that attempt back to generation 0, i.e. handed it the exact uuid the
    // server had already answered with FAILURE. There is nothing harmless
    // about forgetting a spent key — the backend replays the recorded failure
    // and the customer can never succeed. Absence has to keep meaning "never
    // seen", so the map does not forget.
    expect(attemptKey(oldest)).not.toBe(spent)
    // ...and the replacement is still reproducible, which is what makes the
    // NEXT lost response recoverable.
    expect(attemptKey(oldest)).toBe(replacement)
  })
})

// The client's key and the server's fingerprint have to move together, and
// they are built from deliberately DIFFERENT things: ours from what survives a
// retry, the server's from the wire input. Freezing the send is what reconciles
// them — without it the key survives the retry while the input does not, the
// backend answers IdempotencyKeyReuseError rather than replaying, and the
// screen reads that as an ordinary failure and lets the money leave twice.
describe("the send is frozen with the key", () => {
  const usdWallet = { currency: WalletCurrency.Usd, id: "usd-wallet" } as const

  const priceOf =
    (centsPerSat: number): ConvertMoneyAmount =>
    (moneyAmount, currency) => ({
      amount:
        currency === WalletCurrency.Btc
          ? moneyAmount.amount
          : Math.round(moneyAmount.amount * centsPerSat),
      currency,
      currencyCode: currency,
    })

  const lnurlParams = { min: 1, max: 100000 } as unknown as LnUrlPayServiceResponse

  // The request fingerprints lnflash/flash builds, verbatim. Pinned here so a
  // change on EITHER side breaks a test rather than a payment:
  //   ln|${paymentRequest}                              src/app/payments/send-lightning.ts
  //   ln-noamount|${paymentRequest}|${amount}           src/app/payments/send-lightning.ts
  //   ln-noamount-usd|${paymentRequest}|${amount}       src/graphql/public/root/mutation/ln-noamount-usd-invoice-payment-send.ts
  //   intraledger|${recipientWalletId}|${amount}        src/app/payments/send-intraledger.ts
  const serverRequestFingerprint = {
    lnInvoice: (input: { paymentRequest: string }) => `ln|${input.paymentRequest}`,
    lnNoAmountInvoice: (input: { paymentRequest: string; amount: number }) =>
      `ln-noamount|${input.paymentRequest}|${input.amount}`,
    lnNoAmountUsdInvoice: (input: { paymentRequest: string; amount: number }) =>
      `ln-noamount-usd|${input.paymentRequest}|${input.amount}`,
    intraLedger: (input: { recipientWalletId: string; amount: number }) =>
      `intraledger|${input.recipientWalletId}|${input.amount}`,
  }

  // A flashcard reload: LNURL, USD wallet. `createLnurlPaymentDetails`
  // delegates the send to `createAmountLightningPaymentDetails`, so this is
  // `lnInvoicePaymentSend` and the server keys on the bolt11 alone.
  const flashcardReload = (paymentRequest: string) =>
    createLnurlPaymentDetails({
      lnurl: "flashcard@flashapp.me",
      lnurlParams,
      paymentRequest,
      paymentRequestAmount: toBtcMoneyAmount(2000),
      unitOfAccountAmount: toBtcMoneyAmount(2000),
      convertMoneyAmount: priceOf(0.1),
      sendingWalletDescriptor: usdWallet,
    })

  // One Confirm, driven exactly as useSendPayment drives it: freeze the
  // detail's wire input against the attempt, then send THIS detail's mutation
  // with whatever came back frozen. The mutation is always the rebuilt one —
  // it is the input, not the closure, that has to survive the retry, because a
  // closure cannot survive a force-quit.
  const sendOnce = async (
    detail: ReturnType<typeof flashcardReload>,
    mocks: SendPaymentMutationParams,
  ) => {
    if (!detail.canSendPayment) throw new Error("Cannot send payment")
    const fingerprint = attemptFingerprintOf(detail)
    const frozen = freezeAttempt(fingerprint, detail.sendPaymentWireInput)
    await detail.sendPaymentMutation({
      ...mocks,
      idempotencyKey: frozen.idempotencyKey,
      frozenInput: frozen.frozenInput,
    })
    return frozen.idempotencyKey
  }

  const inputsSent = (mutation: jest.Mock) =>
    mutation.mock.calls.map(([args]) => args.variables.input)

  it("resends the ORIGINAL bolt11 when LNURL re-mints under the retry", async () => {
    // The concrete failure this exists for: the response to the first send is
    // lost, the user backs out, the details screen mints bolt11-B, and the app
    // resends key K against a different bolt11. `withPaymentIdempotency` then
    // returns IdempotencyKeyReuseError — not the original result — and the
    // screen frees the button for a second, fresh-keyed payment.
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnInvoicePaymentSend as jest.Mock
    mutation.mockResolvedValue({
      data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    const firstKey = await sendOnce(flashcardReload("lnbc1firstmint"), mocks)
    const retryKey = await sendOnce(flashcardReload("lnbc1secondmint"), mocks)

    expect(retryKey).toBe(firstKey)

    const [first, retry] = inputsSent(mutation)
    expect(first.paymentRequest).toBe("lnbc1firstmint")
    // The rebuilt detail carries bolt11-B; the frozen send does not.
    expect(retry.paymentRequest).toBe("lnbc1firstmint")
    expect(serverRequestFingerprint.lnInvoice(retry)).toBe(
      serverRequestFingerprint.lnInvoice(first),
    )
  })

  it("resends the ORIGINAL settlement amount when the price ticks under the retry", async () => {
    // The same class on the amount: a USD/USDT settlement amount is a
    // price-derived estimate, and the details screen re-derives it on every
    // realtime tick. `ln-noamount-usd|${paymentRequest}|${amount}` includes it,
    // so a one-cent move is a different payment as far as the server is
    // concerned.
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    const build = (convert: ConvertMoneyAmount) =>
      createNoAmountLightningPaymentDetails({
        paymentRequest: "lnbc1payeeminted",
        unitOfAccountAmount: toBtcMoneyAmount(1000),
        convertMoneyAmount: convert,
        sendingWalletDescriptor: usdWallet,
      })

    const first = build(priceOf(0.1))
    const repriced = build(priceOf(0.099))
    // The estimate really did move, so this cannot pass vacuously.
    expect(repriced.settlementAmount.amount).not.toBe(first.settlementAmount.amount)

    await sendOnce(first as ReturnType<typeof flashcardReload>, mocks)
    await sendOnce(repriced as ReturnType<typeof flashcardReload>, mocks)

    const [sent, retry] = inputsSent(mutation)
    expect(retry.amount).toBe(sent.amount)
    expect(serverRequestFingerprint.lnNoAmountUsdInvoice(retry)).toBe(
      serverRequestFingerprint.lnNoAmountUsdInvoice(sent),
    )
  })

  it("stops freezing once the server has answered", async () => {
    // The frozen input must not outlive the attempt: a deliberate second
    // reload of the same amount to the same address is a NEW payment, and
    // resending the first one's bolt11 would ask the backend to replay the
    // first payment's success while the second never leaves the wallet.
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnInvoicePaymentSend as jest.Mock
    mutation.mockResolvedValue({
      data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    const firstKey = await sendOnce(flashcardReload("lnbc1firstmint"), mocks)
    retireAttemptKey(attemptFingerprintOf(flashcardReload("lnbc1secondmint")))
    const laterKey = await sendOnce(flashcardReload("lnbc1secondmint"), mocks)

    expect(laterKey).not.toBe(firstKey)
    const [, later] = inputsSent(mutation)
    expect(later.paymentRequest).toBe("lnbc1secondmint")
  })

  it("does not hand one attempt another attempt's frozen input", () => {
    const one = attemptFingerprint(attempt)
    const other = attemptFingerprint({ ...attempt, unitOfAccountAmount: 999 })
    const inputOne = wireInputFor("lnbc1one")
    const inputOther = wireInputFor("lnbc1other")

    expect(freezeAttempt(one, inputOne).frozenInput).toBe(inputOne)
    expect(freezeAttempt(other, inputOther).frozenInput).toBe(inputOther)
    expect(freezeAttempt(one, wireInputFor("lnbc1reminted")).frozenInput).toBe(inputOne)
  })

  it("pairs the frozen input with the key attemptKey would derive", () => {
    const fingerprint = attemptFingerprint(attempt)
    expect(freezeAttempt(fingerprint, wireInputFor("lnbc1one")).idempotencyKey).toBe(
      attemptKey(fingerprint),
    )
  })

  it("keys an attempt with nothing to freeze, and freezes nothing", () => {
    // The onchain sends: their resolvers do not accept an idempotency key at
    // all, so there is no input to freeze. They must still get a key rather
    // than throwing on the way to a send that works today.
    const fingerprint = attemptFingerprint({ ...attempt, paymentType: "onchain" })

    const frozen = freezeAttempt(fingerprint, undefined)

    expect(frozen.idempotencyKey).toBe(attemptKey(fingerprint))
    expect(frozen.frozenInput).toBeUndefined()
    // ...and nothing was frozen, so a later attempt with a real input still can be.
    const input = wireInputFor("lnbc1later")
    expect(freezeAttempt(fingerprint, input).frozenInput).toBe(input)
  })
})

// The server caches definitive outcomes — FAILURE included — for 24h
// (IDEMPOTENCY_TTL_SECS, lnflash/flash src/app/payments/idempotency.ts). An
// in-memory-only generation map therefore has the same failure mode as an
// eviction cap, just triggered by a process restart instead of by size.
describe("retired keys outlive the process", () => {
  const fingerprint = attemptFingerprint(attempt)

  // The module as a freshly launched app sees it: nothing in memory, whatever
  // the last run wrote still on disk.
  const coldModule = () => {
    let mod: typeof import("@app/screens/send-bitcoin-screen/send-attempt-key")
    jest.isolateModules(() => {
      mod = require("@app/screens/send-bitcoin-screen/send-attempt-key")
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return mod!
  }

  const flushWrites = () =>
    new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

  it("still refuses the retired key after a force-quit", async () => {
    // The user sends $10, gets a definitive FAILURE, force-quits — the normal
    // reaction to a failed payment — reopens and repeats the identical send.
    // Forgetting the retirement re-derives the generation-0 uuid the server
    // has already answered with FAILURE, and they are locked out of that exact
    // payment for the rest of the 24 hours with nothing on screen to explain it.
    const spent = attemptKey(fingerprint)
    retireAttemptKey(fingerprint)
    const replacement = attemptKey(fingerprint)
    expect(replacement).not.toBe(spent)
    await flushWrites()

    const relaunched = coldModule()
    await relaunched.hydrateSendAttemptKeys()

    expect(relaunched.attemptKey(fingerprint)).not.toBe(spent)
    // ...and it is the SAME replacement, so a lost response on the second
    // attempt is still recoverable.
    expect(relaunched.attemptKey(fingerprint)).toBe(replacement)
  })

  it("does not resurrect a retirement the server has already forgotten", async () => {
    // Past the backend's own 24h window the cached FAILURE is gone, so holding
    // the attempt at generation 1 forever would be inventing a restriction the
    // server does not have — and would grow the store without bound.
    const spent = attemptKey(fingerprint)
    retireAttemptKey(fingerprint)
    await flushWrites()

    const dayLater = Date.now() + 24 * 60 * 60 * 1000 + 1000
    jest.spyOn(Date, "now").mockReturnValue(dayLater)

    const relaunched = coldModule()
    await relaunched.hydrateSendAttemptKeys()

    expect(relaunched.attemptKey(fingerprint)).toBe(spent)
    jest.restoreAllMocks()
  })

  it("survives a store that cannot be read", async () => {
    // A corrupt or unreadable store must degrade to today's behaviour, never
    // stop a payment.
    mockAsyncStorageStore.set("send-attempt-generations.v1", "{not json")

    const relaunched = coldModule()
    await expect(relaunched.hydrateSendAttemptKeys()).resolves.toBeUndefined()
    expect(relaunched.attemptKey(fingerprint)).toBe(attemptKey(fingerprint))
  })

  // The other half of the attempt, and the half a closure could never carry.
  // A generation that survives a force-quit while the frozen INPUT does not is
  // the single worst combination available: the same key is re-derived for a
  // REBUILT input, which is exactly what the backend answers with
  // IdempotencyKeyReuseError — nothing settles, the history shows a failure,
  // and that exact payment is impossible for 24h.
  describe("the frozen input outlives the process too", () => {
    const usdWallet = { currency: WalletCurrency.Usd, id: "usd-wallet" } as const

    const priceOf =
      (centsPerSat: number): ConvertMoneyAmount =>
      (moneyAmount, currency) => ({
        amount:
          currency === WalletCurrency.Btc
            ? moneyAmount.amount
            : Math.round(moneyAmount.amount * centsPerSat),
        currency,
        currencyCode: currency,
      })

    const lnurlParams = { min: 1, max: 100000 } as unknown as LnUrlPayServiceResponse

    it("replays the ORIGINAL bolt11 after a force-quit", async () => {
      // A flashcard reload: LNURL, USD wallet, and a bolt11 the details screen
      // re-mints on every pass forward (IBEX caps these at 60s). The server
      // keys this one on `ln|${paymentRequest}` alone, so sending the re-minted
      // invoice under the re-derived key is answered with
      // IdempotencyKeyReuseError rather than the original outcome.
      const reload = (paymentRequest: string) =>
        createLnurlPaymentDetails({
          lnurl: "flashcard@flashapp.me",
          lnurlParams,
          paymentRequest,
          paymentRequestAmount: toBtcMoneyAmount(2000),
          unitOfAccountAmount: toBtcMoneyAmount(2000),
          convertMoneyAmount: priceOf(0.1),
          sendingWalletDescriptor: usdWallet,
        })

      const sent = reload("lnbc1firstmint")
      const fingerprint = attemptFingerprintOf(sent)
      const firstKey = freezeAttempt(
        fingerprint,
        sent.sendPaymentWireInput,
      ).idempotencyKey
      // The response never arrives, so nothing is retired — then the user
      // force-quits, which is the normal reaction to a payment that looks
      // failed.
      await flushWrites()

      const relaunched = coldModule()
      await relaunched.hydrateSendAttemptKeys()

      // Back on the send screen: a freshly minted invoice for what the user
      // means as the same payment.
      const rebuilt = reload("lnbc1secondmint")
      expect(rebuilt.paymentRequest).not.toBe(sent.paymentRequest)
      expect(attemptFingerprintOf(rebuilt)).toBe(fingerprint)

      const replay = relaunched.freezeAttempt(
        attemptFingerprintOf(rebuilt),
        rebuilt.sendPaymentWireInput,
      )

      expect(replay.idempotencyKey).toBe(firstKey)
      // The rebuilt detail's input is NOT what goes out.
      expect(replay.frozenInput?.input.paymentRequest).toBe("lnbc1firstmint")

      // ...and driven through the rebuilt detail's own mutation — the only one
      // a relaunched process has — that is what reaches the wire.
      const mocks = createSendPaymentMocks()
      const mutation = mocks.lnInvoicePaymentSend as jest.Mock
      mutation.mockResolvedValue({
        data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
      })
      if (!rebuilt.canSendPayment) throw new Error("Cannot send payment")
      await rebuilt.sendPaymentMutation({
        ...mocks,
        idempotencyKey: replay.idempotencyKey,
        frozenInput: replay.frozenInput,
      })

      const [input] = mutation.mock.calls.map(([args]) => args.variables.input)
      expect(input.paymentRequest).toBe("lnbc1firstmint")
      expect(input.idempotencyKey).toBe(firstKey)
    })

    it("replays the ORIGINAL settlement amount after a force-quit", async () => {
      // The finding's own case: a JMD amount authored to a Flash handle from a
      // USD wallet. The server keys it on
      // `intraledger|${recipientWalletId}|${amount}`, and that amount is
      // price-derived — so a relaunch that remembered the key but not the
      // amount sends a repriced input under it and is refused.
      const send = (convert: ConvertMoneyAmount) =>
        createIntraledgerPaymentDetails({
          handle: "someone",
          recipientWalletId: "recipient-wallet",
          unitOfAccountAmount: toBtcMoneyAmount(1000),
          convertMoneyAmount: convert,
          sendingWalletDescriptor: usdWallet,
        })

      const sent = send(priceOf(0.1))
      const fingerprint = attemptFingerprintOf(sent)
      const firstKey = freezeAttempt(
        fingerprint,
        sent.sendPaymentWireInput,
      ).idempotencyKey
      await flushWrites()

      const relaunched = coldModule()
      await relaunched.hydrateSendAttemptKeys()

      const rebuilt = send(priceOf(0.099))
      // The estimate really did move, so this cannot pass vacuously.
      expect(rebuilt.settlementAmount.amount).not.toBe(sent.settlementAmount.amount)
      expect(attemptFingerprintOf(rebuilt)).toBe(fingerprint)

      const replay = relaunched.freezeAttempt(
        attemptFingerprintOf(rebuilt),
        rebuilt.sendPaymentWireInput,
      )

      expect(replay.idempotencyKey).toBe(firstKey)

      const mocks = createSendPaymentMocks()
      const mutation = mocks.intraLedgerUsdPaymentSend as jest.Mock
      mutation.mockResolvedValue({
        data: { intraLedgerUsdPaymentSend: { status: "SUCCESS", errors: [] } },
      })
      if (!rebuilt.canSendPayment) throw new Error("Cannot send payment")
      await rebuilt.sendPaymentMutation({
        ...mocks,
        idempotencyKey: replay.idempotencyKey,
        frozenInput: replay.frozenInput,
      })

      const [input] = mutation.mock.calls.map(([args]) => args.variables.input)
      expect(input.amount).toBe(sent.settlementAmount.amount)
      expect(input.idempotencyKey).toBe(firstKey)
    })

    it("forgets the frozen input once the attempt resolved", async () => {
      // A resolved attempt is over: the next identical send is a deliberate
      // second payment, and replaying the first one's bolt11 would ask the
      // backend to return the first payment's outcome for it.
      const fingerprint = attemptFingerprint(attempt)
      freezeAttempt(fingerprint, wireInputFor("lnbc1firstmint"))
      retireAttemptKey(fingerprint)
      await flushWrites()

      const relaunched = coldModule()
      await relaunched.hydrateSendAttemptKeys()

      const later = wireInputFor("lnbc1secondmint")
      expect(relaunched.freezeAttempt(fingerprint, later).frozenInput).toBe(later)
    })

    it("does not honour a frozen input that outlived its retirement", async () => {
      // The two stores are written through separately and neither write is
      // awaited, so a process can die between them and come back with a frozen
      // input whose key the generation has already spent. Replaying that pair
      // asks the server to answer with an outcome the client has already seen
      // — the failure `retireAttemptKey` exists to prevent — so the generation
      // is the authority and the orphan is dropped.
      const fingerprint = attemptFingerprint(attempt)
      const spent = attemptKey(fingerprint)
      freezeAttempt(fingerprint, wireInputFor("lnbc1firstmint"))
      await flushWrites()
      const beforeRetirement = mockAsyncStorageStore.get("send-attempt-frozen.v1") ?? ""
      expect(beforeRetirement).toContain(spent)

      retireAttemptKey(fingerprint)
      await flushWrites()
      // The torn write: the generation landed, the frozen deletion did not.
      mockAsyncStorageStore.set("send-attempt-frozen.v1", beforeRetirement)

      const relaunched = coldModule()
      await relaunched.hydrateSendAttemptKeys()

      const fresh = wireInputFor("lnbc1secondmint")
      const next = relaunched.freezeAttempt(fingerprint, fresh)
      expect(next.idempotencyKey).not.toBe(spent)
      expect(next.frozenInput).toBe(fresh)
    })

    it("does not replay an input the server has already forgotten", async () => {
      // Past the backend's 24h window there is no cached result to match, so a
      // frozen input is no longer replayable — it is just a stale invoice.
      const fingerprint = attemptFingerprint(attempt)
      freezeAttempt(fingerprint, wireInputFor("lnbc1firstmint"))
      await flushWrites()

      jest.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60 * 1000 + 1000)

      const relaunched = coldModule()
      await relaunched.hydrateSendAttemptKeys()

      const fresh = wireInputFor("lnbc1secondmint")
      expect(relaunched.freezeAttempt(fingerprint, fresh).frozenInput).toBe(fresh)
      jest.restoreAllMocks()
    })

    it("ignores a frozen entry it cannot vouch for", async () => {
      // Written by a build that shaped the entry differently, or corrupted
      // outright. Degrading to "nothing frozen" is today's behaviour; putting
      // a malformed input on the wire is a send the server can only reject.
      mockAsyncStorageStore.set(
        "send-attempt-frozen.v1",
        JSON.stringify({
          "some-digest": {
            key: "a-key",
            input: { inputType: "NotARealInput", input: { walletId: "usd-wallet" } },
            expiresAt: Date.now() + 60_000,
          },
        }),
      )

      const relaunched = coldModule()
      await relaunched.hydrateSendAttemptKeys()

      const fingerprint = attemptFingerprint(attempt)
      const fresh = wireInputFor("lnbc1freshmint")
      expect(relaunched.freezeAttempt(fingerprint, fresh).frozenInput).toBe(fresh)
    })

    it("still restores the retirements when the frozen store is corrupt", async () => {
      // The two stores must fail independently: a frozen entry we cannot read
      // is a lost replay, but a retirement we do not read back is a spent key
      // handed out again, and the backend replays its recorded failure until
      // its own TTL runs out.
      const fingerprint = attemptFingerprint(attempt)
      const spent = attemptKey(fingerprint)
      retireAttemptKey(fingerprint)
      await flushWrites()
      mockAsyncStorageStore.set("send-attempt-frozen.v1", "{not json")

      const relaunched = coldModule()
      await relaunched.hydrateSendAttemptKeys()

      expect(relaunched.attemptKey(fingerprint)).not.toBe(spent)
    })

    it("surfaces the frozen bolt11 to the expiry guard", async () => {
      // What the confirm screen reads to judge the invoice that will actually
      // be transmitted rather than the one it is holding (ENG-555).
      const fingerprint = attemptFingerprint(attempt)
      expect(frozenSendInvoice(fingerprint)).toBeUndefined()

      freezeAttempt(fingerprint, wireInputFor("lnbc1firstmint"))
      expect(frozenSendInvoice(fingerprint)).toBe("lnbc1firstmint")

      retireAttemptKey(fingerprint)
      expect(frozenSendInvoice(fingerprint)).toBeUndefined()
    })
  })

  it("keeps the fingerprint itself off the filesystem", async () => {
    // The fingerprint concatenates a wallet id, a bolt11 or lightning address
    // and the user's own memo. The store only needs an opaque handle.
    retireAttemptKey(fingerprint)
    await flushWrites()

    const written = mockAsyncStorageStore.get("send-attempt-generations.v1") ?? ""
    expect(written).not.toBe("")
    expect(written).not.toContain(attempt.destination)
    expect(written).not.toContain(attempt.memo)
    expect(written).not.toContain(attempt.walletId)
  })
})
