/**
 * ENG-616: the Cashu card top-up engine, against a mint that really signs and
 * a card that stores proofs like the applet. What it pins:
 *   - nothing is paid before the quote and the blinding data are saved;
 *   - the mint's quote state, not the wallet's answer, decides "paid", and a
 *     record that was ever sent for payment is dropped only once the mint
 *     still holds it unpaid well after it expired;
 *   - a paid quote is minted without the card, before the mint stops issuing
 *     it, and a quote near its expiry is never paid;
 *   - a lost mint answer is recovered by NUT-09 restore, never a second mint;
 *   - every proof is DLEQ-checked and checked to rebuild on the card before
 *     anything is written to it;
 *   - a resumed load never writes a proof the card already holds, nor one the
 *     mint has already seen spent;
 *   - spent slots are never room and never cleared;
 *   - a card's unfinished top-ups hold its slots and its unit.
 */
import * as Keychain from "react-native-keychain"

import { Amount, MintOperationError, hashToCurve } from "@cashu/cashu-ts"

import { toHex } from "../../app/utils/cashu-card"
import { signMintQuote } from "../../app/utils/cashu-card-topup/nut20"
import { buildCardP2PKSecret } from "../../app/utils/cashu-card-outputs"
import {
  EXPIRY_GRACE_MS,
  MIN_PAY_WINDOW_MS,
  PAY_WINDOW_MS,
  PayArgs,
  PayOutcome,
  TopUpDeps,
  TopUpError,
  TopUpRecord,
  advanceTopUps,
  cancelTopUp,
  cardCommitments,
  createTopUpStore,
  loadTopUp,
  mintTopUp,
  payTopUp,
  payWindowMs,
  prepareTopUp,
  proofStatesForLoad,
  unfinishedTopUps,
} from "../../app/utils/cashu-card-topup"
import { FakeCard, FakeMint, createFakeCard, createFakeMint } from "../helpers/fake-cashu"

const CARD = "02" + "ab".repeat(32)
const OTHER_CARD = "03" + "cd".repeat(32)
const WALLET = "btc-wallet-id"
const EMPTY_CARD = { empty: 32 }

let clock: number
let mint: FakeMint
let card: FakeCard
let pay: jest.Mock<Promise<PayOutcome>, [PayArgs]>
let deps: TopUpDeps
let ids: number

const settlesOnPay = (outcome: PayOutcome = { kind: "paid" }) =>
  pay.mockImplementation(async ({ paymentRequest }) => {
    const [id] =
      [...mint.quotes.entries()].find(([, q]) => q.request === paymentRequest) ?? []
    if (id && outcome.kind === "paid") mint.settle(id)
    return outcome
  })

const prepare = (amount = 1000, over: Partial<Parameters<typeof prepareTopUp>[1]> = {}) =>
  prepareTopUp(deps, {
    cardPubkey: CARD,
    unit: "sat",
    amount,
    walletId: WALLET,
    card: EMPTY_CARD,
    ...over,
  })

/** A top-up through payment and minting, ready to load. */
const minted = async (amount = 1000) => {
  settlesOnPay()
  const record = await prepare(amount)
  await payTopUp(deps, record.id)
  return (await mintTopUp(deps, record.id)).record
}

/** The engine's clock, in ms, `ms` past a quote's expiry (which is in unix seconds). */
const pastExpiry = (record: TopUpRecord, ms: number) =>
  (record.quote.expiry as number) * 1000 + ms

/** How the mint knows a card proof: Y = hash_to_curve(secret). */
const yOf = (nonce: string) =>
  toHex(
    hashToCurve(new TextEncoder().encode(buildCardP2PKSecret(nonce, CARD))).toBytes(true),
  )

const nonceAt = (slot: number) => toHex(card.slots[slot].slice(13, 45))

/** A load against the fake card, asking the mint first as the app does. */
const loadOnCard = async (id: string) =>
  loadTopUp(deps, {
    id,
    transceive: card.transceive,
    card: { maxSlots: 32 },
    mintStates: await proofStatesForLoad(deps, id),
  })

/** The first load's tap is lost after `landed` LOAD_PROOFs reach the card. */
const cutLoadAfter = async (id: string, landed: number) => {
  const answer = card.transceive.getMockImplementation()!
  let loads = 0
  card.transceive.mockImplementation(async (apdu) => {
    if (apdu[1] === 0x30 && loads === landed) throw new Error("Tag was lost")
    const response = await answer(apdu)
    if (apdu[1] === 0x30) loads += 1
    return response
  })
  await expect(loadOnCard(id)).rejects.toThrow("Tag was lost")
  card.transceive.mockImplementation(answer)
  card.transceive.mockClear()
}

beforeEach(async () => {
  await Keychain.resetInternetCredentials({ server: "flashcard-v2-topups" })
  jest.clearAllMocks()
  clock = 1_000
  mint = createFakeMint({ now: () => clock })
  card = createFakeCard()
  pay = jest.fn(async (_args: PayArgs) => ({ kind: "paid" } as PayOutcome))
  ids = 0
  deps = {
    mint,
    store: createTopUpStore(() => clock),
    pay,
    now: () => clock,
    newId: () => {
      ids += 1
      return `id-${ids}`
    },
  }
})

describe("prepareTopUp", () => {
  it("quotes the amount locked to a key only this app holds, and saves it with its outputs before anything is paid", async () => {
    const record = await prepare(1000)

    expect(mint.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: "sat",
        amount: 1000,
        pubkey: expect.stringMatching(/^0[23][0-9a-f]{64}$/),
      }),
    )
    expect(pay).not.toHaveBeenCalled()
    expect(await deps.store.get(record.id)).toEqual(record)
    expect(record).toMatchObject({
      state: "quoted",
      unit: "sat",
      amount: 1000,
      keysetId: mint.keysetId,
    })
    expect(record.lockKey).toMatch(/^[0-9a-f]{64}$/)
    // When the quote arrived, on the phone's clock, and its life, off the invoice.
    expect(record.quote).toMatchObject({
      requestedAt: clock,
      quotedAt: clock,
      lifeMs: mint.ttlSeconds.sat * 1000,
    })
    // 1000 = 512+256+128+64+32+8: one output per power of two, each a card secret.
    expect(record.outputs.map((o) => o.amount)).toEqual([512, 256, 128, 64, 32, 8])
    record.outputs.forEach((output) => {
      const { nonce } = JSON.parse(output.secret)[1]
      expect(output.secret).toBe(buildCardP2PKSecret(nonce, CARD))
    })
    expect(record.payment).toEqual({
      walletId: WALLET,
      idempotencyKey: expect.any(String),
      dispatched: false,
      everDispatched: false,
    })
  })

  it("refuses an amount out of range, or one the card has no room for, before asking the mint", async () => {
    await expect(prepare(0)).rejects.toMatchObject({ reason: "amount" })
    await expect(prepare(1_000_001)).rejects.toMatchObject({ reason: "amount" })
    await expect(prepare(2.5)).rejects.toMatchObject({ reason: "amount" })
    // 1023 needs ten slots; the card has nine empty.
    await expect(prepare(1023, { card: { empty: 9 } })).rejects.toMatchObject({
      reason: "slots",
    })
    expect(mint.createQuote).not.toHaveBeenCalled()
    await expect(prepare(1023, { card: { empty: 10 } })).resolves.toBeTruthy()
  })

  it("never counts spent slots as room: a spent slot is owed until it settles, and is never cleared", async () => {
    // Nine empty and twenty spent: the old rule (empty + spent) said yes.
    const spentCard = { empty: 9, spent: 20 }
    await expect(prepare(1023, { card: spentCard })).rejects.toMatchObject({
      reason: "slots",
    })
    expect(mint.createQuote).not.toHaveBeenCalled()
  })

  const wrongQuotes: [string, Record<string, unknown>][] = [
    ["another amount", { amount: 999 }],
    ["another unit", { unit: "usd" }],
    ["a quote already paid", { state: "PAID" }],
    ["a quote locked to another key", { pubkey: "02" + "11".repeat(32) }],
    // Its age could then be told only against the mint's clock.
    ["an invoice that cannot be read", { request: "lnbc1notaninvoice" }],
    ["a quote that expires before its invoice was issued", { expiry: 0 }],
  ]
  wrongQuotes.forEach(([name, wrong]) => {
    it(`refuses ${name} and saves nothing`, async () => {
      const real = (mint.createQuote as jest.Mock).getMockImplementation()!
      ;(mint.createQuote as jest.Mock).mockImplementationOnce(async (args) => ({
        ...(await real(args)),
        ...wrong,
      }))
      await expect(prepare(1000)).rejects.toMatchObject({ reason: "quote" })
      expect(await deps.store.list()).toEqual([])
    })
  })
})

describe("a card's unfinished top-ups hold its slots and its unit", () => {
  it("counts the slots of a top-up paid for and not loaded, so a second one cannot be paid into no room", async () => {
    // 1023 sats: ten slots, minted and not on the card.
    await minted(1023)
    // The card as last read: twelve empty, which the first top-up will take ten of.
    await expect(prepare(1023, { card: { empty: 12 } })).rejects.toMatchObject({
      reason: "slots",
    })
    expect(mint.createQuote).toHaveBeenCalledTimes(1)
    // Two slots are still free.
    await expect(prepare(3, { card: { empty: 12 } })).resolves.toBeTruthy()
  })

  it("counts a quote whose payment may be out, and not one never sent or refused", async () => {
    const out = await prepare(1023)
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, out.id)
    const refused = await prepare(1023)
    pay.mockResolvedValueOnce({ kind: "failed", message: "insufficient balance" })
    await payTopUp(deps, refused.id)
    await prepare(1023)

    expect(cardCommitments(await deps.store.list(), CARD.toUpperCase())).toEqual({
      slots: 10,
      units: ["sat"],
    })
  })

  it("refuses a unit other than the card's, or than an unfinished top-up's, before asking the mint", async () => {
    await expect(
      prepare(100, { unit: "usd", card: { empty: 32, unit: "sat" } }),
    ).rejects.toMatchObject({ reason: "unit" })

    // An empty card, with a USD top-up minted and not loaded (the flag was on).
    const usd = await minted(100)
    await deps.store.update(usd.id, (r) => ({ ...r, unit: "usd" }))
    await expect(prepare(100, { unit: "sat" })).rejects.toMatchObject({
      reason: "unit",
    })
    expect(mint.createQuote).toHaveBeenCalledTimes(1)
    expect(mint.activeKeyset).toHaveBeenCalledTimes(1)
  })
})

describe("payTopUp", () => {
  it("marks the payment dispatched before the wallet is asked, then records the invoice paid", async () => {
    const record = await prepare()
    let savedDuringPay: TopUpRecord["payment"] | undefined
    pay.mockImplementation(async () => {
      savedDuringPay = (await deps.store.get(record.id))?.payment
      return { kind: "paid" }
    })

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(savedDuringPay).toMatchObject({ dispatched: true, everDispatched: true })
    expect(pay).toHaveBeenCalledWith({
      walletId: WALLET,
      paymentRequest: record.quote.request,
      idempotencyKey: record.payment.idempotencyKey,
      isRetry: false,
    })
    expect(result).toEqual({ status: "paid" })
    expect(after.state).toBe("paid")
  })

  it("never pays an invoice the mint already holds as paid", async () => {
    const record = await prepare()
    mint.settle(record.quote.id)

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(pay).not.toHaveBeenCalled()
    expect(result).toEqual({ status: "paid" })
    expect(after.state).toBe("paid")
  })

  it("a first dispatch refused before it ran takes a fresh key; the record still counts as once sent", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "failed", message: "insufficient balance" })

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "failed", message: "insufficient balance" })
    expect(after.state).toBe("quoted")
    expect(after.payment.dispatched).toBe(false)
    expect(after.payment.everDispatched).toBe(true)
    expect(after.payment.idempotencyKey).not.toBe(record.payment.idempotencyKey)
  })

  it("an unknown outcome keeps the key, and the retry goes out as a retry of it", async () => {
    const record = await prepare()
    pay.mockRejectedValueOnce(new Error("Network request failed"))

    const first = await payTopUp(deps, record.id)
    expect(first.result).toEqual({ status: "unknown", message: "Network request failed" })
    expect(first.record.payment).toMatchObject({
      dispatched: true,
      idempotencyKey: record.payment.idempotencyKey,
    })

    await payTopUp(deps, record.id)
    expect(pay).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: record.payment.idempotencyKey,
        isRetry: true,
      }),
    )
  })

  it("a retry refused before it ran says nothing about the dispatch whose answer was lost: same key, still unknown", async () => {
    const record = await prepare()
    pay.mockRejectedValueOnce(new Error("Network request failed"))
    await payTopUp(deps, record.id)
    // The server is still executing the first dispatch: the retry is refused.
    pay.mockResolvedValueOnce({ kind: "failed", message: "busy" })

    const retry = await payTopUp(deps, record.id)

    expect(retry.result).toEqual({ status: "unknown", message: "busy" })
    expect(retry.record.payment).toMatchObject({
      dispatched: true,
      everDispatched: true,
      idempotencyKey: record.payment.idempotencyKey,
    })
    await payTopUp(deps, record.id)
    expect(pay).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: record.payment.idempotencyKey,
        isRetry: true,
      }),
    )
  })

  it("a retry answered with IBEX's failure, which the server caches under the key, retires the key: the next Pay is a first dispatch", async () => {
    const record = await prepare()
    pay.mockRejectedValueOnce(new Error("Network request failed"))
    await payTopUp(deps, record.id)
    // The first dispatch ran and failed at IBEX (a route failure); the
    // server replays that cached FAILURE, with no error, to every retry.
    pay.mockResolvedValueOnce({ kind: "failed", definitive: true })

    const retry = await payTopUp(deps, record.id)

    expect(pay).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: record.payment.idempotencyKey,
        isRetry: true,
      }),
    )
    expect(retry.result).toEqual({ status: "failed" })
    expect(retry.record.payment).toMatchObject({
      dispatched: false,
      everDispatched: true,
    })
    expect(retry.record.payment.idempotencyKey).not.toBe(record.payment.idempotencyKey)

    await payTopUp(deps, record.id)
    expect(pay).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: retry.record.payment.idempotencyKey,
        isRetry: false,
      }),
    )
  })

  it("never pays a fresh quote whose whole life is shorter than the least pay window, even quoted again", async () => {
    mint.ttlSeconds.sat = MIN_PAY_WINDOW_MS / 2_000
    const record = await prepare()

    const { result } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "expired" })
    expect(mint.createQuote).toHaveBeenCalledTimes(2)
    expect(pay).not.toHaveBeenCalled()
  })

  it("quotes again, and pays the new invoice under a new key, when a quote never sent is too close to its expiry", async () => {
    const record = await prepare()
    clock = pastExpiry(record, -PAY_WINDOW_MS + 1)

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "paid" })
    expect(mint.createQuote).toHaveBeenCalledTimes(2)
    expect(after.quote.id).not.toBe(record.quote.id)
    expect(after.lockKey).not.toBe(record.lockKey)
    expect(after.outputs).toEqual(record.outputs)
    expect(pay).toHaveBeenCalledTimes(1)
    expect(pay).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentRequest: after.quote.request,
        idempotencyKey: after.payment.idempotencyKey,
      }),
    )
    expect(after.payment.idempotencyKey).not.toBe(record.payment.idempotencyKey)
  })

  it("never pays a quote once sent when too little of its life is left, and never quotes it again", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)
    clock = pastExpiry(record, -PAY_WINDOW_MS + 1)

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "expired" })
    expect(pay).toHaveBeenCalledTimes(1)
    expect(mint.createQuote).toHaveBeenCalledTimes(1)
    expect(after.quote.id).toBe(record.quote.id)
    expect(after.lockKey).toBe(record.lockKey)
  })

  it("the same holds after a refusal: an expired quote once sent is left to the mint", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "failed", message: "insufficient balance" })
    await payTopUp(deps, record.id)
    clock = pastExpiry(record, 1)

    await expect(payTopUp(deps, record.id)).resolves.toMatchObject({
      result: { status: "expired" },
    })
    expect(pay).toHaveBeenCalledTimes(1)
  })

  it("sizes the pay window to the quote: a quarter of its life, between the least window and two minutes", () => {
    // A sat quote on phoenixd's hour-long invoice.
    expect(payWindowMs(3_600_000)).toBe(PAY_WINDOW_MS)
    expect(payWindowMs(240_000)).toBe(60_000)
    // A usd quote on a 60 s Flash invoice: paid only in its first 20 s.
    expect(payWindowMs(60_000)).toBe(MIN_PAY_WINDOW_MS)
    expect(MIN_PAY_WINDOW_MS).toBe(40_000)
  })
})

describe("a usd top-up, whose quote lives 60 s (IBEX's cap on the Flash invoice behind it)", () => {
  const USD_CARD = { empty: 32, unit: "usd" as const }
  const prepareUsd = (amount = 500) => prepare(amount, { unit: "usd", card: USD_CARD })

  it("pays a fresh quote and mints it inside its life, under the usd keyset", async () => {
    settlesOnPay()
    const record = await prepareUsd()
    expect(record.quote.lifeMs).toBe(60_000)

    await expect(payTopUp(deps, record.id)).resolves.toMatchObject({
      result: { status: "paid" },
    })
    expect(mint.createQuote).toHaveBeenCalledTimes(1)
    clock += 5_000
    const { record: after } = await mintTopUp(deps, record.id)

    expect(after.state).toBe("minted")
    expect(after.proofs?.every((proof) => proof.keysetId === mint.usdKeysetId)).toBe(true)
    expect(after.proofs?.reduce((sum, proof) => sum + proof.amount, 0)).toBe(500)
  })

  it("retries under the same key after an unknown answer while the window is open, and mints", async () => {
    const record = await prepareUsd()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)
    // 15 s in, 45 s left: more than the 40 s window.
    clock += 15_000
    settlesOnPay()

    await expect(payTopUp(deps, record.id)).resolves.toMatchObject({
      result: { status: "paid" },
    })
    expect(pay).toHaveBeenCalledTimes(2)
    expect(pay).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paymentRequest: record.quote.request,
        idempotencyKey: record.payment.idempotencyKey,
        isRetry: true,
      }),
    )
    expect(mint.createQuote).toHaveBeenCalledTimes(1)
    await expect(mintTopUp(deps, record.id)).resolves.toMatchObject({ status: "minted" })
  })

  it("quotes again once a quote never sent is past its first 20 s, and pays the new one", async () => {
    settlesOnPay()
    const record = await prepareUsd()
    clock += 21_000

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "paid" })
    expect(mint.createQuote).toHaveBeenCalledTimes(2)
    expect(pay).toHaveBeenCalledTimes(1)
    expect(pay).toHaveBeenCalledWith(
      expect.objectContaining({ paymentRequest: after.quote.request }),
    )
    await expect(mintTopUp(deps, record.id)).resolves.toMatchObject({ status: "minted" })
  })

  it("never retries a sent quote past its first 20 s", async () => {
    const record = await prepareUsd()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)
    clock += 21_000

    await expect(payTopUp(deps, record.id)).resolves.toMatchObject({
      result: { status: "expired" },
    })
    expect(pay).toHaveBeenCalledTimes(1)
    expect(mint.createQuote).toHaveBeenCalledTimes(1)
  })

  it("counts the time the quote took to arrive against paying it", async () => {
    settlesOnPay()
    // The mint takes 10 s to answer: the invoice is 10 s old when its quote arrives.
    const real = (mint.createQuote as jest.Mock).getMockImplementation()!
    ;(mint.createQuote as jest.Mock).mockImplementationOnce(async (args) => {
      const quote = await real(args)
      clock += 10_000
      return quote
    })
    const record = await prepareUsd()
    // 11 s after the quote arrived, 21 s after its invoice was issued.
    clock += 11_000

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "paid" })
    expect(mint.createQuote).toHaveBeenCalledTimes(2)
    expect(after.quote.request).not.toBe(record.quote.request)
    expect(pay).toHaveBeenCalledTimes(1)
    expect(pay).toHaveBeenCalledWith(
      expect.objectContaining({ paymentRequest: after.quote.request }),
    )
  })
})

describe("mintTopUp", () => {
  it("waits while the mint has not seen the payment", async () => {
    const record = await prepare()
    const { status } = await mintTopUp(deps, record.id)
    expect(status).toBe("waiting")
    expect(mint.mint).not.toHaveBeenCalled()
  })

  it("waits while a mint call for the quote is running (PENDING), without a restore", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    mint.quotes.get(record.quote.id)!.state = "PENDING"

    await expect(mintTopUp(deps, record.id)).resolves.toMatchObject({ status: "waiting" })
    expect(mint.mint).not.toHaveBeenCalled()
    expect(mint.restore).not.toHaveBeenCalled()
  })

  it("mints with the quote's NUT-20 signature, checks every proof, saves them and drops the lock key", async () => {
    const record = await minted(1000)

    expect(record.state).toBe("minted")
    expect(record.lockKey).toBeUndefined()
    expect(record.proofs?.map((p) => p.amount)).toEqual([512, 256, 128, 64, 32, 8])
    record.proofs?.forEach((proof, i) => {
      expect(proof.keysetId).toBe(mint.keysetId)
      expect(buildCardP2PKSecret(proof.nonce, CARD)).toBe(record.outputs[i].secret)
      expect(proof.C).toMatch(/^0[23][0-9a-f]{64}$/)
    })
    expect(mint.mint).toHaveBeenCalledTimes(1)
  })

  it("mints once when asked twice at once (the screen and the card-free pass)", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)

    const [a, b] = await Promise.all([
      mintTopUp(deps, record.id),
      mintTopUp(deps, record.id),
    ])

    expect(a.status).toBe("minted")
    expect(b.status).toBe("minted")
    expect(mint.mint).toHaveBeenCalledTimes(1)
  })

  it("recovers the signatures with NUT-09 when a mint's answer was lost, instead of minting again", async () => {
    settlesOnPay()
    const record = await prepare(1000)
    await payTopUp(deps, record.id)
    // The mint signs, and the answer never arrives.
    const signOnce = (mint.mint as jest.Mock).getMockImplementation()
    ;(mint.mint as jest.Mock).mockImplementationOnce(async (args) => {
      await signOnce?.(args)
      throw new Error("Network request failed")
    })

    const { status, record: after } = await mintTopUp(deps, record.id)

    expect(status).toBe("minted")
    expect(mint.restore).toHaveBeenCalledTimes(1)
    expect(mint.mint).toHaveBeenCalledTimes(1)
    expect(after.proofs).toHaveLength(6)
  })

  it("a mint failure that did not issue the quote is not papered over", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    ;(mint.mint as jest.Mock).mockRejectedValueOnce(new Error("503"))

    await expect(mintTopUp(deps, record.id)).rejects.toThrow("503")
    expect((await deps.store.get(record.id))?.state).toBe("paid")
    expect(mint.restore).not.toHaveBeenCalled()
  })

  it("a paid quote past its expiry is refused by the mint, as Nutshell does, and the engine says so", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    clock = pastExpiry(record, 1_000)

    await expect(mintTopUp(deps, record.id)).rejects.toMatchObject({ reason: "expired" })
    expect(mint.quotes.get(record.quote.id)?.state).toBe("PAID")
    const after = await deps.store.get(record.id)
    expect(after?.state).toBe("paid")
    expect(after?.lockKey).toBe(record.lockKey)
  })

  it("reads Nutshell 0.20.3's form of the refusal (code 11000, same detail) the same way", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    ;(mint.mint as jest.Mock).mockRejectedValueOnce(
      new MintOperationError(11000, "quote expired"),
    )

    await expect(mintTopUp(deps, record.id)).rejects.toMatchObject({ reason: "expired" })
  })

  it("any other refusal from the mint is its own answer, never read as the quote's expiry", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    clock = pastExpiry(record, 1_000)
    ;(mint.mint as jest.Mock).mockRejectedValueOnce(
      new MintOperationError(11000, "transaction error"),
    )

    const err = await mintTopUp(deps, record.id).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MintOperationError)
    expect((await deps.store.get(record.id))?.mintRefused).toBeUndefined()
  })

  it("a call that got no answer is read as the quote's expiry only when its age and the phone's clock both say so", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    clock = pastExpiry(record, 1_000)
    ;(mint.mint as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"))

    await expect(mintTopUp(deps, record.id)).rejects.toMatchObject({ reason: "expired" })
  })

  it("resumes an ISSUED quote by restore alone (the app died after the mint signed)", async () => {
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    // The mint call went out and signed; the app died before the answer.
    const outputs = record.outputs.map((o) => ({
      id: record.keysetId,
      amount: Amount.from(o.amount),
      B_: o.B_,
    }))
    await mint.mint({
      quote: record.quote.id,
      outputs,
      signature: signMintQuote(record.lockKey!, record.quote.id, outputs),
    })
    ;(mint.mint as jest.Mock).mockClear()

    const { status, record: after } = await mintTopUp(deps, record.id)

    expect(status).toBe("minted")
    expect(mint.mint).not.toHaveBeenCalled()
    expect(mint.restore).toHaveBeenCalledTimes(1)
    expect(after.proofs?.map((p) => p.amount)).toEqual([512, 256, 128, 64, 32, 8])
  })

  it("refuses a signature whose DLEQ proof does not verify, and keeps nothing", async () => {
    settlesOnPay()
    const record = await prepare(8)
    await payTopUp(deps, record.id)
    const real = (mint.mint as jest.Mock).getMockImplementation()
    ;(mint.mint as jest.Mock).mockImplementationOnce(async (args) => {
      const signatures = await real?.(args)
      return signatures.map((s: { dleq: { e: string; s: string } }) => ({
        ...s,
        dleq: { ...s.dleq, s: "11".repeat(32) },
      }))
    })

    await expect(mintTopUp(deps, record.id)).rejects.toMatchObject({ reason: "dleq" })
    const after = await deps.store.get(record.id)
    expect(after?.state).toBe("paid")
    expect(after?.proofs).toBeUndefined()
  })
  it("refuses a signature that comes without a DLEQ proof", async () => {
    settlesOnPay()
    const record = await prepare(8)
    await payTopUp(deps, record.id)
    const real = (mint.mint as jest.Mock).getMockImplementation()
    ;(mint.mint as jest.Mock).mockImplementationOnce(async (args) => {
      const signatures = await real?.(args)
      return signatures.map(({ dleq: _dleq, ...s }: { dleq: unknown }) => s)
    })

    await expect(mintTopUp(deps, record.id)).rejects.toMatchObject({ reason: "dleq" })
    expect((await deps.store.get(record.id))?.proofs).toBeUndefined()
  })
})

describe("advanceTopUps: minting without the card", () => {
  it("mints a payment that landed after the user left, card or no card, while the mint still issues it", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "pending" })
    await payTopUp(deps, record.id)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 1 })

    // The Lightning payment settles; the app is still open, the card is not near.
    mint.settle(record.quote.id)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })

    expect((await deps.store.get(record.id))?.state).toBe("minted")
    expect(card.transceive).not.toHaveBeenCalled()
    // The next morning, past the quote's expiry: the proofs are already saved.
    clock = pastExpiry(record, 12 * 3_600_000)
    await expect(loadOnCard(record.id)).resolves.toMatchObject({ state: "loaded" })
  })

  it("a paid quote left until after its expiry can no longer be minted: saved as paid and refused, and no later pass asks again", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "pending" })
    await payTopUp(deps, record.id)
    mint.settle(record.quote.id)
    clock = pastExpiry(record, 1_000)

    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    // The mint holds the money: the record says paid, never "expired unpaid".
    expect(await deps.store.get(record.id)).toMatchObject({
      state: "paid",
      mintRefused: "expired",
      lockKey: record.lockKey,
    })
    expect(mint.mint).toHaveBeenCalledTimes(1)

    // Every later pass (each foreground) leaves it alone: no POST for it.
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(mint.mint).toHaveBeenCalledTimes(1)
    // Finish asks the mint once more, and hears the same; Dismiss is refused.
    await expect(mintTopUp(deps, record.id)).rejects.toMatchObject({ reason: "expired" })
    expect(mint.mint).toHaveBeenCalledTimes(2)
    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })
    expect(await deps.store.get(record.id)).toMatchObject({ state: "paid" })
  })

  it("saves a sent quote the mint holds as paid as paid before minting it, so a failed mint call leaves it paid", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "pending" })
    await payTopUp(deps, record.id)
    mint.settle(record.quote.id)
    ;(mint.mint as jest.Mock).mockRejectedValueOnce(new Error("503"))

    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 1 })
    const after = await deps.store.get(record.id)
    expect(after?.state).toBe("paid")
    expect(after?.mintRefused).toBeUndefined()

    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect((await deps.store.get(record.id))?.state).toBe("minted")
  })

  it("drops a quote the mint still holds unpaid past its expiry and the grace, whether it was sent or not", async () => {
    const sent = await prepare(8)
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, sent.id)
    const neverSent = await prepare(16)

    clock = pastExpiry(sent, EXPIRY_GRACE_MS)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 1 })
    expect(await deps.store.list()).toHaveLength(2)

    clock = pastExpiry(sent, EXPIRY_GRACE_MS + 1)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(await deps.store.list()).toEqual([])
    expect(neverSent.quote.expiry).toBe(sent.quote.expiry)
  })

  it("keeps asking while a payment may still land or a mint call failed in passing, and never drops a paid one", async () => {
    const sent = await prepare(8)
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, sent.id)
    settlesOnPay()
    const paid = await prepare(16)
    await payTopUp(deps, paid.id)
    ;(mint.mint as jest.Mock).mockRejectedValue(new Error("503"))

    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 2 })

    clock = pastExpiry(sent, EXPIRY_GRACE_MS + 1)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect((await deps.store.list()).map((r) => r.id)).toEqual([paid.id])
  })

  it("stops asking about a refusal the mint will repeat, on this pass and every later one", async () => {
    settlesOnPay()
    const record = await prepare(8)
    await payTopUp(deps, record.id)
    const real = (mint.mint as jest.Mock).getMockImplementation()
    ;(mint.mint as jest.Mock).mockImplementation(async (args) => {
      const signatures = await real?.(args)
      return signatures.map(({ dleq: _dleq, ...s }: { dleq: unknown }) => s)
    })

    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(await deps.store.get(record.id)).toMatchObject({
      state: "paid",
      mintRefused: "dleq",
    })
    // The quote is ISSUED now: a pass that asked again would restore.
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(mint.mint).toHaveBeenCalledTimes(1)
    expect(mint.restore).not.toHaveBeenCalled()
  })
})

describe("a phone clock that is not the mint's: a quote is judged by its age on the phone's own clock", () => {
  const HOUR = 3_600_000
  /** The phone's clock `offset` ms from the mint's (`clock`). */
  const phoneAt = (offset: number) => {
    deps = { ...deps, now: () => clock + offset }
  }

  it("2 h fast: pays a fresh quote as it is, keeps it while the payment is pending, and mints it when it lands", async () => {
    phoneAt(2 * HOUR)
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "pending" })

    await expect(payTopUp(deps, record.id)).resolves.toMatchObject({
      result: { status: "pending" },
    })
    // Not quoted again: the quote is minutes old, whatever the phone says the time is.
    expect(mint.createQuote).toHaveBeenCalledTimes(1)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 1 })
    expect(await deps.store.get(record.id)).toMatchObject({ state: "quoted" })

    mint.settle(record.quote.id)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect((await deps.store.get(record.id))?.state).toBe("minted")
  })

  it("2 h fast: a mint call that fails in passing is asked again, never read as the quote's expiry", async () => {
    phoneAt(2 * HOUR)
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    ;(mint.mint as jest.Mock).mockRejectedValueOnce(new Error("503"))

    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 1 })
    expect((await deps.store.get(record.id))?.mintRefused).toBeUndefined()
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect((await deps.store.get(record.id))?.state).toBe("minted")
  })

  it("2 h fast: drops a sent quote the mint holds unpaid, and lets Dismiss drop it, only once it is really past its life and the grace", async () => {
    phoneAt(2 * HOUR)
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)

    clock = pastExpiry(record, EXPIRY_GRACE_MS)
    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 1 })
    expect(await deps.store.list()).toHaveLength(1)

    clock = pastExpiry(record, EXPIRY_GRACE_MS + 1)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(await deps.store.list()).toEqual([])
  })

  it("30 min slow: quotes again rather than pay an invoice with less than the window left", async () => {
    phoneAt(-30 * 60_000)
    const record = await prepare()
    // The mint's clock is inside the invoice's last two minutes; the phone's
    // reads thirty-two minutes left.
    clock = pastExpiry(record, -PAY_WINDOW_MS + 1)

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "paid" })
    expect(mint.createQuote).toHaveBeenCalledTimes(2)
    expect(after.quote.request).not.toBe(record.quote.request)
    expect(pay).toHaveBeenCalledTimes(1)
    expect(pay).toHaveBeenCalledWith(
      expect.objectContaining({ paymentRequest: after.quote.request }),
    )
  })

  it("30 min slow: never retries a sent quote with less than the window left", async () => {
    phoneAt(-30 * 60_000)
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)
    clock = pastExpiry(record, -PAY_WINDOW_MS + 1)

    await expect(payTopUp(deps, record.id)).resolves.toMatchObject({
      result: { status: "expired" },
    })
    expect(pay).toHaveBeenCalledTimes(1)
  })

  it("30 min slow: keeps a sent quote the mint holds unpaid until the phone's own clock is past its expiry too, never earlier", async () => {
    phoneAt(-30 * 60_000)
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)

    clock = pastExpiry(record, EXPIRY_GRACE_MS + 1)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 1 })
    expect(await deps.store.list()).toHaveLength(1)

    clock = pastExpiry(record, EXPIRY_GRACE_MS + 30 * 60_000 + 1)
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(await deps.store.list()).toEqual([])
  })

  it("30 min slow: a paid quote the mint refuses as expired is asked about once, and Finish says why", async () => {
    phoneAt(-30 * 60_000)
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "pending" })
    await payTopUp(deps, record.id)
    // The payment settles while the app is away, and the app comes back a
    // second after the quote's expiry, which the phone's clock reads as half
    // an hour off.
    mint.settle(record.quote.id)
    clock = pastExpiry(record, 1_000)

    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(await deps.store.get(record.id)).toMatchObject({
      state: "paid",
      mintRefused: "expired",
    })
    await expect(advanceTopUps(deps)).resolves.toEqual({ waiting: 0 })
    expect(mint.mint).toHaveBeenCalledTimes(1)
    await expect(mintTopUp(deps, record.id)).rejects.toMatchObject({ reason: "expired" })
    expect(mint.mint).toHaveBeenCalledTimes(2)
  })

  it("slow when the quote arrived and set right since: a call that got no answer is not read as the quote's expiry", async () => {
    phoneAt(-30 * 60_000)
    settlesOnPay()
    const record = await prepare()
    await payTopUp(deps, record.id)
    // Set right a minute before the expiry. The quote's age reads 29 min past
    // its life; the phone's clock, now the mint's, does not.
    phoneAt(0)
    clock = pastExpiry(record, -60_000)
    ;(mint.mint as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"))

    await expect(mintTopUp(deps, record.id)).rejects.toThrow("Network request failed")
    expect((await deps.store.get(record.id))?.mintRefused).toBeUndefined()
    await expect(mintTopUp(deps, record.id)).resolves.toMatchObject({ status: "minted" })
  })

  it("a clock set back since the quote arrived hides the quote's age: a sent quote is not retried on it", async () => {
    clock = HOUR
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)
    phoneAt(-10 * 60_000)

    await expect(payTopUp(deps, record.id)).resolves.toMatchObject({
      result: { status: "expired" },
    })
    expect(pay).toHaveBeenCalledTimes(1)
  })
})

describe("loadTopUp", () => {
  it("writes every proof onto the card, saving that loading started before the first write", async () => {
    const record = await minted(1000)
    // What the store said at the first LOAD_PROOF.
    const seenAtFirstLoad: (boolean | undefined)[] = []
    const answer = card.transceive.getMockImplementation()
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === 0x30 && seenAtFirstLoad.length === 0) {
        seenAtFirstLoad.push((await deps.store.get(record.id))?.loadStarted)
      }
      return answer!(apdu)
    })

    const after = await loadOnCard(record.id)

    expect(seenAtFirstLoad).toEqual([true])
    expect(after.state).toBe("loaded")
    expect(card.unspentNonces()).toEqual(record.proofs?.map((p) => p.nonce))
    // A first load reads no inventory: GET_SLOT_STATUS, then six LOAD_PROOFs.
    expect(card.ins()).toEqual([0x14, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30])
    // And asks the mint nothing: none of its proofs can be spent yet.
    expect(mint.proofStates).not.toHaveBeenCalled()
  })

  it("a resumed load skips what the card already holds, spent or not, and loads the rest once", async () => {
    const record = await minted(1000)
    // The first tap: the third LOAD_PROOF lands on the card and its answer is lost.
    const answer = card.transceive.getMockImplementation()!
    let loads = 0
    card.transceive.mockImplementation(async (apdu) => {
      const response = await answer(apdu)
      if (apdu[1] === 0x30 && (loads += 1) === 3) throw new Error("Tag was lost")
      return response
    })
    await expect(loadOnCard(record.id)).rejects.toThrow("Tag was lost")
    expect(card.unspentNonces()).toHaveLength(3)
    // One of those three is spent at a till before the holder taps again.
    card.slots[1][0] = 2
    card.transceive.mockImplementation(answer)
    card.transceive.mockClear()

    const after = await loadOnCard(record.id)

    expect(after.state).toBe("loaded")
    expect(card.ins().filter((ins) => ins === 0x30)).toHaveLength(3)
    const onCard = card.slots
      .filter((slot) => slot[0] !== 0)
      .map((slot) => toHex(slot.slice(13, 45)))
    expect(onCard).toHaveLength(6)
    expect(new Set(onCard)).toEqual(new Set(record.proofs?.map((p) => p.nonce)))
  })

  it("never writes back a proof the mint has seen spent, once its slot was cleared since (the phantom)", async () => {
    // 7 sats: 4 + 2 + 1. The tap is cut after the 4 lands.
    const record = await minted(7)
    await cutLoadAfter(record.id, 1)
    const four = nonceAt(0)
    expect(record.proofs?.[0]).toMatchObject({ amount: 4, nonce: four })
    // The 4 is spent at a till and settles at the mint; some other tool then
    // runs CLEAR_SPENT, and its slot is gone.
    card.slots[0][0] = 2
    mint.proofStatesByY.set(yOf(four), "SPENT")
    card.slots[0] = new Array(card.slots[0].length).fill(0)

    const after = await loadOnCard(record.id)

    expect(after.state).toBe("loaded")
    expect(mint.proofStates).toHaveBeenCalledWith(record.proofs?.map((p) => yOf(p.nonce)))
    expect(card.unspentNonces()).toEqual(record.proofs?.slice(1).map((p) => p.nonce))
  })

  it("holds a proof the mint has as PENDING for a later load, and loads the rest", async () => {
    const record = await minted(7)
    await cutLoadAfter(record.id, 1)
    const four = nonceAt(0)
    card.slots[0] = new Array(card.slots[0].length).fill(0)
    mint.proofStatesByY.set(yOf(four), "PENDING")

    const held = await loadOnCard(record.id)

    expect(held.state).toBe("minted")
    expect(card.unspentNonces()).toEqual(record.proofs?.slice(1).map((p) => p.nonce))
    // The spend settles: the next load finds everything accounted for.
    mint.proofStatesByY.set(yOf(four), "SPENT")
    card.transceive.mockClear()
    await expect(loadOnCard(record.id)).resolves.toMatchObject({ state: "loaded" })
    expect(card.ins()).not.toContain(0x30)
  })

  it("a resumed load without the mint's word on each proof touches nothing", async () => {
    const record = await minted(7)
    await cutLoadAfter(record.id, 1)

    await expect(
      loadTopUp(deps, {
        id: record.id,
        transceive: card.transceive,
        card: { maxSlots: 32 },
      }),
    ).rejects.toMatchObject({ reason: "state" })
    expect(card.transceive).not.toHaveBeenCalled()
  })

  it("never clears a spent slot: with too few empty ones it refuses before writing, and an unsettled burn stays readable", async () => {
    const record = await minted(1000)
    // 28 spent slots and 4 empty: six proofs do not fit. Slot 0 is a burn
    // whose signature never left the card, UNSPENT at the mint: only its
    // slot can recover it.
    card.slots.forEach((slot, i) => {
      if (i < 28) {
        slot[0] = 2
        slot[13] = i + 1
      }
    })
    const before = card.slots.map((slot) => [...slot])

    await expect(loadOnCard(record.id)).rejects.toMatchObject({ reason: "slots" })

    expect(card.ins()).not.toContain(0x31)
    expect(card.ins()).not.toContain(0x30)
    expect(card.slots).toEqual(before)
    // Nothing was written, so the next load is still a first one.
    expect(await deps.store.get(record.id)).toMatchObject({
      state: "minted",
      loadStarted: false,
    })
  })

  it("refuses before writing anything when the card cannot take the proofs", async () => {
    const record = await minted(1000)
    card.slots.forEach((slot, i) => {
      if (i < 30) slot[0] = 1
    })

    await expect(loadOnCard(record.id)).rejects.toMatchObject({ reason: "slots" })
    expect(card.ins()).not.toContain(0x30)
    expect(card.ins()).not.toContain(0x31)
  })

  it("will not load a top-up that is not minted", async () => {
    const record = await prepare()
    await expect(loadOnCard(record.id)).rejects.toBeInstanceOf(TopUpError)
    expect(card.transceive).not.toHaveBeenCalled()
  })
})

describe("cancelTopUp", () => {
  it("drops a top-up that was never sent for payment", async () => {
    const record = await prepare()
    await cancelTopUp(deps, record.id)
    expect(await deps.store.list()).toEqual([])
  })

  it("keeps a dispatched payment that may still land", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)

    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })
    expect(await deps.store.get(record.id)).toBeTruthy()
  })

  it("keeps a record read as refused, whose invoice then settles, and mints it", async () => {
    const record = await prepare()
    // The answer read as a refusal was wrong: the payment lands after all.
    pay.mockResolvedValueOnce({ kind: "failed", message: "An unexpected error occurred" })
    await payTopUp(deps, record.id)

    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })
    mint.settle(record.quote.id)
    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })
    await advanceTopUps(deps)

    const after = await deps.store.get(record.id)
    expect(after?.state).toBe("minted")
    expect(after?.proofs).toHaveLength(6)
  })

  it("drops a dispatched payment only once its invoice expired unpaid at the mint, past the grace", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)

    clock = pastExpiry(record, EXPIRY_GRACE_MS)
    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })

    clock = pastExpiry(record, EXPIRY_GRACE_MS + 1)
    await cancelTopUp(deps, record.id)
    expect(await deps.store.list()).toEqual([])
  })

  it("never drops an expired quote the mint holds as paid, and saves it as paid", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)
    mint.settle(record.quote.id)
    clock = pastExpiry(record, EXPIRY_GRACE_MS + 1)

    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })
    expect(await deps.store.get(record.id)).toMatchObject({ state: "paid" })
  })

  it("never drops a paid top-up", async () => {
    const record = await minted()
    await expect(cancelTopUp(deps, record.id)).rejects.toMatchObject({ reason: "state" })
  })
})

describe("unfinishedTopUps", () => {
  it("lists a card's top-ups that still need a payment, a mint or a tap, oldest first", async () => {
    const first = await prepare(8)
    await prepareTopUp(deps, {
      cardPubkey: OTHER_CARD,
      unit: "sat",
      amount: 8,
      walletId: WALLET,
      card: EMPTY_CARD,
    })
    const done = await minted(16)
    await loadOnCard(done.id)

    const unfinished = await unfinishedTopUps(deps, CARD.toUpperCase())
    expect(unfinished.map((r) => r.id)).toEqual([first.id])
  })
})
