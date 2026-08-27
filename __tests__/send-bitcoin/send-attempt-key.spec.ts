/**
 * ENG-533. These drive the REAL key module the hook calls — delete
 * `attemptKey`/`retireAttemptKey` from use-send-payment.ts and the
 * screen-level cases in __tests__/screens/send-confirmation.spec.tsx fail;
 * change the rule here and these fail.
 *
 * The rule has exactly two ways to be wrong, and both cost money:
 *
 *  - a key that does NOT survive the repeat (the original bug: a per-mount
 *    uuid, minted afresh by the back-navigation that IS the retry) makes a
 *    resent payment look like a second one, and the customer pays twice;
 *  - a key that survives a definitive FAILURE makes the backend replay the
 *    recorded failure, and the customer can never succeed.
 */
import { WalletCurrency } from "@app/graphql/generated"
import {
  createAmountLightningPaymentDetails,
  createLnurlPaymentDetails,
  createNoAmountLightningPaymentDetails,
} from "@app/screens/send-bitcoin-screen/payment-details/lightning"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import {
  attemptFingerprint,
  attemptFingerprintOf,
  attemptKey,
  resetSendAttemptKeys,
  retireAttemptKey,
} from "@app/screens/send-bitcoin-screen/send-attempt-key"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { PaymentType } from "@galoymoney/client"
import { LnUrlPayServiceResponse } from "lnurl-pay/dist/types/types"

const attempt = {
  walletId: "usd-wallet",
  paymentType: "lightning",
  destination: "lnbc1someinvoice",
  unitOfAccountAmount: 250,
  unitOfAccountCurrency: "USD",
  memo: "rent",
}

beforeEach(resetSendAttemptKeys)

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
