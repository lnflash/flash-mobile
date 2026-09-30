/**
 * ENG-616: the Cashu card top-up engine, against a mint that really signs and
 * a card that stores proofs like the applet. What it pins:
 *   - nothing is paid before the quote and the blinding data are saved;
 *   - the mint's quote state, not the wallet's answer, decides "paid";
 *   - a lost mint answer is recovered by NUT-09 restore, never a second mint;
 *   - every proof is DLEQ-checked and checked to rebuild on the card before
 *     anything is written to it;
 *   - a resumed load never writes a proof the card already holds.
 */
import * as Keychain from "react-native-keychain"

import { Amount, signMintQuote } from "@cashu/cashu-ts"

import { toHex } from "../../app/utils/cashu-card"
import { buildCardP2PKSecret } from "../../app/utils/cashu-card-outputs"
import {
  PayArgs,
  PayOutcome,
  TopUpDeps,
  TopUpError,
  cancelTopUp,
  createTopUpStore,
  loadTopUp,
  mintTopUp,
  payTopUp,
  prepareTopUp,
  unfinishedTopUps,
} from "../../app/utils/cashu-card-topup"
import { FakeCard, FakeMint, createFakeCard, createFakeMint } from "../helpers/fake-cashu"

const CARD = "02" + "ab".repeat(32)
const OTHER_CARD = "03" + "cd".repeat(32)
const WALLET = "btc-wallet-id"
const EMPTY_CARD = { empty: 32, spent: 0 }

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

beforeEach(async () => {
  await Keychain.resetInternetCredentials({ server: "flashcard-v2-topups" })
  jest.clearAllMocks()
  mint = createFakeMint()
  card = createFakeCard()
  pay = jest.fn(async (_args: PayArgs) => ({ kind: "paid" } as PayOutcome))
  ids = 0
  deps = {
    mint,
    store: createTopUpStore(() => 1_000),
    pay,
    now: () => 1_000,
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
      wentKeyless: false,
    })
  })

  it("refuses an amount out of range, or one the card has no room for, before asking the mint", async () => {
    await expect(prepare(0)).rejects.toMatchObject({ reason: "amount" })
    await expect(prepare(1_000_001)).rejects.toMatchObject({ reason: "amount" })
    await expect(prepare(2.5)).rejects.toMatchObject({ reason: "amount" })
    // 1023 needs ten slots; the card has five empty and four spent.
    await expect(prepare(1023, { card: { empty: 5, spent: 4 } })).rejects.toMatchObject({
      reason: "slots",
    })
    expect(mint.createQuote).not.toHaveBeenCalled()
    // Spent slots count: CLEAR_SPENT frees them at load time.
    await expect(prepare(1023, { card: { empty: 5, spent: 5 } })).resolves.toBeTruthy()
  })

  it("refuses a quote for anything other than what was asked, and saves nothing", async () => {
    ;(mint.createQuote as jest.Mock).mockResolvedValueOnce({
      quote: "q",
      request: "lnbc",
      unit: "sat",
      amount: 999,
      state: "UNPAID",
      expiry: null,
    })
    await expect(prepare(1000)).rejects.toMatchObject({ reason: "quote" })
    expect(await deps.store.list()).toEqual([])
  })
})

describe("payTopUp", () => {
  it("marks the payment dispatched before the wallet is asked, then records the invoice paid", async () => {
    const record = await prepare()
    let savedDuringPay: boolean | undefined
    pay.mockImplementation(async () => {
      savedDuringPay = (await deps.store.get(record.id))?.payment.dispatched
      return { kind: "paid" }
    })

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(savedDuringPay).toBe(true)
    expect(pay).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: WALLET,
        paymentRequest: record.quote.request,
        idempotencyKey: record.payment.idempotencyKey,
        isRetry: false,
      }),
    )
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

  it("a failed payment takes a fresh key for the next attempt; nothing left the wallet", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "failed", message: "insufficient balance" })

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "failed", message: "insufficient balance" })
    expect(after.state).toBe("quoted")
    expect(after.payment.dispatched).toBe(false)
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

  it("remembers a dispatch that went out without the key", async () => {
    const record = await prepare()
    pay.mockImplementationOnce(async ({ onKeylessDispatch }) => {
      onKeylessDispatch()
      return { kind: "pending" }
    })

    const { result, record: after } = await payTopUp(deps, record.id)

    expect(result).toEqual({ status: "pending" })
    expect(after.state).toBe("quoted")
    expect(after.payment.wentKeyless).toBe(true)
  })
})

describe("mintTopUp", () => {
  it("waits while the mint has not seen the payment", async () => {
    const record = await prepare()
    const { status } = await mintTopUp(deps, record.id)
    expect(status).toBe("waiting")
    expect(mint.mint).not.toHaveBeenCalled()
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

    const after = await loadTopUp(deps, {
      id: record.id,
      transceive: card.transceive,
      card: { maxSlots: 32 },
    })

    expect(seenAtFirstLoad).toEqual([true])
    expect(after.state).toBe("loaded")
    expect(card.unspentNonces()).toEqual(record.proofs?.map((p) => p.nonce))
    // A first load reads no inventory: GET_SLOT_STATUS, then six LOAD_PROOFs.
    expect(card.ins()).toEqual([0x14, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30])
  })

  it("a resumed load skips what the card already holds, spent or not, and loads the rest once", async () => {
    const record = await minted(1000)
    const answer = card.transceive.getMockImplementation()!
    // The first tap: the third LOAD_PROOF lands on the card and its answer is lost.
    let loads = 0
    card.transceive.mockImplementation(async (apdu) => {
      const response = await answer(apdu)
      if (apdu[1] === 0x30 && (loads += 1) === 3) throw new Error("Tag was lost")
      return response
    })
    await expect(
      loadTopUp(deps, {
        id: record.id,
        transceive: card.transceive,
        card: { maxSlots: 32 },
      }),
    ).rejects.toThrow("Tag was lost")
    expect(card.unspentNonces()).toHaveLength(3)
    // One of those three is spent at a till before the holder taps again.
    card.slots[1][0] = 2
    card.transceive.mockImplementation(answer)
    card.transceive.mockClear()

    const after = await loadTopUp(deps, {
      id: record.id,
      transceive: card.transceive,
      card: { maxSlots: 32 },
    })

    expect(after.state).toBe("loaded")
    expect(card.ins().filter((ins) => ins === 0x30)).toHaveLength(3)
    const onCard = card.slots
      .filter((slot) => slot[0] !== 0)
      .map((slot) => toHex(slot.slice(13, 45)))
    expect(onCard).toHaveLength(6)
    expect(new Set(onCard)).toEqual(new Set(record.proofs?.map((p) => p.nonce)))
  })

  it("frees spent slots with CLEAR_SPENT only when the empty ones cannot take the proofs", async () => {
    const record = await minted(1000)
    // 28 slots used by old spent proofs, 4 empty: six proofs need CLEAR_SPENT.
    card.slots.forEach((slot, i) => {
      if (i < 28) slot[0] = 2
    })

    const after = await loadTopUp(deps, {
      id: record.id,
      transceive: card.transceive,
      card: { maxSlots: 32 },
    })

    expect(after.state).toBe("loaded")
    expect(card.ins().slice(0, 2)).toEqual([0x14, 0x31])
    expect(card.unspentNonces()).toHaveLength(6)
  })

  it("refuses before writing anything when the card cannot take the proofs even after CLEAR_SPENT", async () => {
    const record = await minted(1000)
    card.slots.forEach((slot, i) => {
      if (i < 30) slot[0] = 1
    })

    await expect(
      loadTopUp(deps, {
        id: record.id,
        transceive: card.transceive,
        card: { maxSlots: 32 },
      }),
    ).rejects.toMatchObject({ reason: "slots" })
    expect(card.ins()).not.toContain(0x30)
    expect(card.ins()).not.toContain(0x31)
  })

  it("will not load a top-up that is not minted", async () => {
    const record = await prepare()
    await expect(
      loadTopUp(deps, {
        id: record.id,
        transceive: card.transceive,
        card: { maxSlots: 32 },
      }),
    ).rejects.toBeInstanceOf(TopUpError)
    expect(card.transceive).not.toHaveBeenCalled()
  })
})

describe("cancelTopUp", () => {
  it("drops a top-up that was never paid", async () => {
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

  it("drops a dispatched payment once its invoice expired unpaid at the mint", async () => {
    const record = await prepare()
    pay.mockResolvedValueOnce({ kind: "unknown" })
    await payTopUp(deps, record.id)
    deps.now = () => (record.quote.expiry! + 1) * 1000

    await cancelTopUp(deps, record.id)
    expect(await deps.store.list()).toEqual([])
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
    await loadTopUp(deps, {
      id: done.id,
      transceive: card.transceive,
      card: { maxSlots: 32 },
    })

    const unfinished = await unfinishedTopUps(deps, CARD.toUpperCase())
    expect(unfinished.map((r) => r.id)).toEqual([first.id])
  })
})
