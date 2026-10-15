/* eslint-disable no-bitwise -- card bytes are read and written by hand here. */
/**
 * ENG-702: the card tidy, against a mint that really signs (and checks the
 * SIG_ALL witness) and a card that keeps its change openings as the applet
 * does. What it pins:
 *   - one tap reshapes the card: the burned pieces' value comes back as the
 *     card's own change, shaped, with only the fee leaving the card;
 *   - the record is saved before SPEND_ALL_BEGIN, and with the change's
 *     blinded messages before SIGN, the one command that burns;
 *   - a lost SIGN answer is recovered by SPEND_ALL_AGAIN on the next tap, a
 *     lost swap answer by NUT-09 restore with no second swap, a load cut part
 *     way resumes without loading a piece twice;
 *   - a till that charged in between leaves the tidy `needs-card`, kept with
 *     the signature the card gave;
 *   - SIGN's signature (or SPEND_ALL_AGAIN's) is saved before anything else
 *     and swapped as the card gave it: the mint decides, and its refusal
 *     leaves the tidy `needs-card`;
 *   - a new tidy plans in the keyset whose fee was asked, never in another
 *     the tap's own read favours;
 *   - the card-free pass and a tap never send the same swap twice;
 *   - so does any outcome no retry can change: a piece the mint spent for
 *     another payment, or a card with no openings for the change; a network
 *     failure leaves it `signed` for the next tap;
 *   - a refusal before SIGN burns nothing and keeps no record;
 *   - a card short of slots is sent nothing after GET_CHANGE;
 *   - the slots a tidy will take count against a top-up (`cardCommitments`).
 */
import * as Keychain from "react-native-keychain"

import { MintOperationError, getPubKeyFromPrivKey } from "@cashu/cashu-ts"

import { INS, Transceiver, toHex, verifyCardPin } from "../../app/utils/cashu-card"
import { allowLoad, ownerSigner } from "../../app/utils/cashu-card-owner"
import {
  buildCardP2PKSecret,
  cardSlotFromProof,
  makeCanonicalCardOutput,
  randomBytes,
} from "../../app/utils/cashu-card-outputs"
import { CardSpendError } from "../../app/utils/cashu-card-spend"
import {
  RunTidyArgs,
  TidyDeps,
  TidyRecord,
  TopUpError,
  advanceTidies,
  belowTarget,
  cardCommitments,
  createTopUpStore,
  isFinalMintRefusal,
  prepareTopUp,
  proofY,
  runTidy,
  unfinishedTidies,
} from "../../app/utils/cashu-card-topup"
import { signMintQuote } from "../../app/utils/cashu-card-topup/nut20"
import {
  FAKE_OWNER_KEY,
  FakeCard,
  FakeMint,
  createFakeCard,
  createFakeMint,
} from "../helpers/fake-cashu"

let clock: number
let mint: FakeMint
let card: FakeCard
let deps: TidyDeps
let ids: number

const sum = (amounts: readonly number[]) => amounts.reduce((a, b) => a + b, 0)
const u32 = (n: number) => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
]
const bytes = (hex: string) => (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))

/** Pieces the mint really signed, written into the card's slots in order, as a top-up leaves them. */
const putOnCard = async (amounts: number[]) => {
  const lockKey = randomBytes(32)
  const quote = await mint.createQuote({
    unit: "sat",
    amount: sum(amounts),
    pubkey: toHex(getPubKeyFromPrivKey(lockKey)),
  })
  mint.settle(quote.quote)
  const outputs = amounts.map((amount) =>
    makeCanonicalCardOutput(amount, mint.keysetId, card.pubkey),
  )
  const messages = outputs.map((output) => output.blindedMessage)
  const signatures = await mint.mint({
    quote: quote.quote,
    outputs: messages,
    signature: signMintQuote(toHex(lockKey), quote.quote, messages),
  })
  const keyset = await mint.keyset(mint.keysetId)
  outputs.forEach((output, i) => {
    const piece = cardSlotFromProof(output.toProof(signatures[i], keyset), card.pubkey)
    const slot = card.slots.findIndex((s) => s[0] === 0)
    card.slots[slot] = [
      1,
      ...bytes(piece.keysetId),
      ...u32(piece.amount),
      ...bytes(piece.nonce),
      ...bytes(piece.C),
      ...u32(0),
    ]
  })
  jest.clearAllMocks()
}

const unspentAmounts = () =>
  card.slots
    .filter((slot) => slot[0] === 1)
    .map((slot) => (slot[9] << 24) | (slot[10] << 16) | (slot[11] << 8) | slot[12])

const args = (over: Partial<RunTidyArgs> = {}): RunTidyArgs => ({
  transceive: card.transceive,
  card: { pubkey: card.pubkey, maxSlots: card.slots.length },
  keysetId: mint.keysetId,
  feePpk: 0,
  openForLoading: (transceive: Transceiver) =>
    allowLoad(transceive, ownerSigner(FAKE_OWNER_KEY)),
  ...over,
})

/** Lose the card's answer to the first APDU with `ins` after it ran on the card. */
const loseAnswerTo = (ins: number) => {
  const answer = card.transceive.getMockImplementation()!
  let lost = false
  card.transceive.mockImplementation(async (apdu) => {
    const response = await answer(apdu)
    if (apdu[1] === ins && !lost) {
      lost = true
      throw new Error("Tag was lost")
    }
    return response
  })
  return () => card.transceive.mockImplementation(answer)
}

/** Every answer the card gave, by command: [INS, status word]. */
const answersLog = () => {
  const answer = card.transceive.getMockImplementation()!
  const log: [number, number][] = []
  card.transceive.mockImplementation(async (apdu) => {
    const response = await answer(apdu)
    log.push([
      apdu[1],
      (response[response.length - 2] << 8) | response[response.length - 1],
    ])
    return response
  })
  return log
}

/** Resolves once `ready` holds, checked every few ms. */
const waitUntil = async (ready: () => boolean) => {
  for (let i = 0; i < 200 && !ready(); i += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 5)
    })
  }
  if (!ready()) throw new Error("waited too long")
}

// 57: what a till leaves of a card shaped for 60 after taking 1 and 2 offline.
const AFTER_A_TILL = [1, 2, 2, 4, 4, 4, 8, 8, 8, 16]

beforeEach(async () => {
  await Keychain.resetInternetCredentials({ server: "flashcard-v2-topups" })
  await Keychain.resetInternetCredentials({ server: "flashcard-v2-tidy-archive" })
  jest.clearAllMocks()
  clock = 1_000
  mint = createFakeMint({ now: () => clock })
  card = createFakeCard(32)
  ids = 0
  deps = {
    mint,
    store: createTopUpStore(() => clock),
    now: () => clock,
    newId: () => {
      ids += 1
      return `tidy-${ids}`
    },
  }
})

describe("runTidy", () => {
  it("reshapes the card in one tap: its own change, swapped and loaded, only the fee leaving it", async () => {
    await putOnCard(AFTER_A_TILL)
    const before = unspentAmounts()

    const result = await runTidy(deps, args())

    expect(result.status).toBe("tidied")
    const now = unspentAmounts()
    expect(sum(now)).toBe(sum(before))
    expect(belowTarget(now)).toBe(false)
    // The 16 went; its change is the card's own, 8 + 4 + 2 + 1 + 1.
    expect(now.filter((amount) => amount === 16)).toEqual([])
    // Every piece came back with the mint's DLEQ proof beside it.
    expect(card.dleqs.size).toBe(5)
    // No SPEND_ALL_OUTPUTS: every output is the card's change, so the day's
    // count rises only by the fee (0 here), and SIGN took zero outputs.
    expect(card.ins()).not.toContain(0x23)
    expect(card.spentToday()).toBe(0)
    // The burned slot was freed once the mint settled it.
    expect(card.slots.filter((slot) => slot[0] === 2)).toHaveLength(0)
    expect(card.openings()).toEqual([])
    expect(await unfinishedTidies(deps, card.pubkey)).toEqual([])
    expect(card.ins()).toEqual([
      // Ten pieces, three to a page.
      ...new Array(4).fill(INS.GET_PIECES),
      INS.GET_CHANGE,
      INS.SPEND_ALL_BEGIN,
      ...new Array(5).fill(INS.SPEND_ALL_CHANGE),
      INS.SPEND_ALL_SIGN,
      // Five openings, three to a page.
      INS.GET_CHANGE,
      INS.GET_CHANGE,
      INS.GET_NONCE,
      INS.ALLOW_LOAD,
      INS.GET_SLOT_STATUS,
      ...new Array(5).fill(INS.LOAD_PROOF),
      // The reclaim of the burned 16.
      INS.GET_SLOT_STATUS,
      INS.GET_PROOF,
      INS.CLEAR_SPENT,
    ])
    // The swap carried the card's one witness, which the mint checked.
    expect(mint.swap).toHaveBeenCalledTimes(1)
  })

  it("rebuilds every new piece's secret as the card does", async () => {
    await putOnCard(AFTER_A_TILL)
    const swap = mint.swap as jest.Mock
    await runTidy(deps, args())
    const [, outputs] = swap.mock.calls[0]
    expect(outputs).toHaveLength(5)
    // The card's openings (nonce, r) made the B_s the mint signed: each piece
    // on the card now is known to the mint by its rebuilt secret's Y.
    const loaded = card.slots
      .filter((slot) => slot[0] === 1)
      .map((slot) => toHex(slot.slice(13, 45)))
    const states = await mint.proofStates(
      loaded.map((nonce) => proofY(nonce, card.pubkey)),
    )
    expect(states.every((state) => state === "UNSPENT")).toBe(true)
    expect(buildCardP2PKSecret(loaded[0], card.pubkey)).toContain('"sigflag","SIG_ALL"')
  })

  it("saves the record before SPEND_ALL_BEGIN, and the change's blinded messages before SIGN", async () => {
    await putOnCard(AFTER_A_TILL)
    const answer = card.transceive.getMockImplementation()!
    const seen: Record<number, TidyRecord[]> = {}
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.SPEND_ALL_BEGIN || apdu[1] === INS.SPEND_ALL_SIGN) {
        seen[apdu[1]] = await deps.store.tidies.list()
      }
      return answer(apdu)
    })

    await runTidy(deps, args())

    expect(seen[INS.SPEND_ALL_BEGIN]).toEqual([
      expect.objectContaining({
        state: "planned",
        inputs: [expect.objectContaining({ amount: 16 })],
        outputs: [8, 4, 2, 1, 1].map((amount) => ({ amount })),
      }),
    ])
    expect(seen[INS.SPEND_ALL_SIGN][0].state).toBe("planned")
    expect(
      seen[INS.SPEND_ALL_SIGN][0].outputs.every((output) =>
        /^0[23][0-9a-f]{64}$/.test(output.B_ ?? ""),
      ),
    ).toBe(true)
  })

  it("recovers a lost SIGN answer with SPEND_ALL_AGAIN on the next tap", async () => {
    await putOnCard(AFTER_A_TILL)
    const restore = loseAnswerTo(INS.SPEND_ALL_SIGN)
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    restore()
    // The card burned the 16; the record stays planned, its change saved.
    const [planned] = await deps.store.tidies.list()
    expect(planned.state).toBe("planned")
    expect(mint.swap).not.toHaveBeenCalled()
    card.transceive.mockClear()

    const result = await runTidy(deps, args())

    expect(result.status).toBe("tidied")
    expect(card.ins()).toContain(INS.SPEND_ALL_AGAIN)
    expect(card.ins()).not.toContain(INS.SPEND_ALL_BEGIN)
    expect(mint.swap).toHaveBeenCalledTimes(1)
    expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
    expect(belowTarget(unspentAmounts())).toBe(false)
  })

  it("drops a planned tidy the card never signed: nothing was burned", async () => {
    await putOnCard(AFTER_A_TILL)
    // Lifted before SIGN reached the card.
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.SPEND_ALL_SIGN) throw new Error("Tag was lost")
      return answer(apdu)
    })
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    card.transceive.mockImplementation(answer)

    await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "abandoned" })
    expect(await unfinishedTidies(deps, card.pubkey)).toEqual([])
    expect(card.slots.filter((slot) => slot[0] === 2)).toHaveLength(0)
    expect(unspentAmounts()).toEqual(AFTER_A_TILL)
  })

  it("recovers a lost swap answer by NUT-09 restore, with no second swap", async () => {
    await putOnCard(AFTER_A_TILL)
    const realSwap = (mint.swap as jest.Mock).getMockImplementation()!
    ;(mint.swap as jest.Mock).mockImplementationOnce(async (...call) => {
      await realSwap(...call)
      throw new Error("Network request failed")
    })

    const result = await runTidy(deps, args())

    expect(result.status).toBe("tidied")
    expect(mint.swap).toHaveBeenCalledTimes(1)
    expect(mint.restore).toHaveBeenCalled()
    expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
  })

  it("swaps a signed tidy without the card, its inputs' states asked first, and loads it on the next tap", async () => {
    await putOnCard(AFTER_A_TILL)
    // The tap ends after SIGN and GET_CHANGE: the grant never reaches the card.
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.GET_NONCE) throw new Error("Tag was lost")
      return answer(apdu)
    })
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    card.transceive.mockImplementation(answer)
    expect((await deps.store.tidies.list())[0]).toMatchObject({ state: "signed" })

    await advanceTidies(deps)

    const [swapped] = await deps.store.tidies.list()
    expect(swapped.state).toBe("swapped")
    expect(swapped.proofs).toHaveLength(5)
    // Every input still UNSPENT: the swap was never made, so nothing to restore.
    expect(mint.proofStates).toHaveBeenCalled()
    expect(mint.restore).not.toHaveBeenCalled()
    expect(mint.swap).toHaveBeenCalledTimes(1)

    await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })
    expect(mint.swap).toHaveBeenCalledTimes(1)
    expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
  })

  it("resumes a load cut after 2 of 4 pieces: 4 LOAD_PROOFs accepted in all", async () => {
    // 9 as [1, 8]: the 8 comes back as [4, 2, 1, 1].
    await putOnCard([1, 8])
    const log = answersLog()
    const answer = card.transceive.getMockImplementation()!
    let loads = 0
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.LOAD_PROOF && loads === 2) throw new Error("Tag was lost")
      if (apdu[1] === INS.LOAD_PROOF) loads += 1
      return answer(apdu)
    })
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    card.transceive.mockImplementation(answer)
    expect((await deps.store.tidies.list())[0]).toMatchObject({
      state: "swapped",
      loadStarted: true,
    })

    await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })

    const loadAnswers = log.filter(([ins]) => ins === INS.LOAD_PROOF)
    expect(loadAnswers).toEqual(new Array(4).fill([INS.LOAD_PROOF, 0x9000]))
    expect(unspentAmounts().sort((a, b) => a - b)).toEqual([1, 1, 1, 2, 4])
  })

  it("leaves a tidy `needs-card` when a till charged the card before its lost signature was asked for", async () => {
    await putOnCard(AFTER_A_TILL)
    const restore = loseAnswerTo(INS.SPEND_ALL_SIGN)
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    restore()
    // A till: SPEND_ALL_BEGIN on the 1, then SIGN: the card's last signature is the till's.
    const one = card.slots.findIndex((slot) => slot[0] === 1 && slot[12] === 1)
    await card.transceive([0xb0, 0x22, 0, 0, 1, one, 4])
    await card.transceive([0xb0, 0x24, 0, 0, 0x40])

    await expect(runTidy(deps, args())).rejects.toMatchObject({
      name: "TidyError",
      reason: "needs-card",
    })
    const [kept] = await unfinishedTidies(deps, card.pubkey)
    expect(kept.state).toBe("needs-card")
    // The till's signature, as the card gave it again, kept for the human.
    expect(kept.signature).toMatch(/^[0-9a-f]{128}$/)
    // Kept for a human, never dropped, and its change no longer holds slots.
    expect(cardCommitments([], card.pubkey, [kept]).slots).toBe(0)
  })

  describe("a SIGN that never reached the card, then a till that spent the tidy's piece at the mint", () => {
    /**
     * Lifted before SIGN ran: nothing burned, the record planned with its
     * change. Then a till: SPEND_ALL_BEGIN on the tidy's 16 (which gives the
     * tidy's drafts up), SIGN, and its swap at the mint.
     */
    const tillTakesThe16 = async (): Promise<TidyRecord> => {
      await putOnCard(AFTER_A_TILL)
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        if (apdu[1] === INS.SPEND_ALL_SIGN) throw new Error("Tag was lost")
        return answer(apdu)
      })
      await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
      card.transceive.mockImplementation(answer)
      const [planned] = await deps.store.tidies.list()
      expect(planned.state).toBe("planned")
      const [input] = planned.inputs
      await card.transceive([0xb0, 0x22, 0, 0, 1, input.slot, 4])
      await card.transceive([0xb0, 0x24, 0, 0, 0x40])
      mint.proofStatesByY.set(proofY(input.nonce, card.pubkey), "SPENT")
      card.transceive.mockClear()
      return planned
    }

    const expectKeptForAHuman = async (planned: TidyRecord) => {
      const records = await deps.store.tidies.list()
      expect(records).toEqual([
        expect.objectContaining({
          id: planned.id,
          state: "needs-card",
          signature: expect.stringMatching(/^[0-9a-f]{128}$/),
        }),
      ])
      // No longer owed: its change holds no slots, the swap was never sent.
      expect(cardCommitments([], card.pubkey, records).slots).toBe(0)
      expect(mint.swap).not.toHaveBeenCalled()
      // Neither the card-free pass nor the next tap takes it up again.
      await advanceTidies(deps)
      expect(mint.swap).not.toHaveBeenCalled()
      expect((await deps.store.tidies.list())[0].state).toBe("needs-card")
      expect(await unfinishedTidies(deps, card.pubkey)).toEqual([
        expect.objectContaining({ id: planned.id, state: "needs-card" }),
      ])
      await expect(deps.store.tidies.archive(planned.id)).resolves.toBe(true)
    }

    it("the next tap: AGAIN gives the till's signature, the card holds no openings, `needs-card`", async () => {
      const planned = await tillTakesThe16()

      await expect(runTidy(deps, args())).rejects.toMatchObject({
        name: "TidyError",
        reason: "needs-card",
      })

      expect(card.ins()).toContain(INS.SPEND_ALL_AGAIN)
      expect(card.ins()).not.toContain(INS.ALLOW_LOAD)
      await expectKeptForAHuman(planned)
    })

    it("the card-free pass, after a tap cut once AGAIN's signature was saved: `needs-card`", async () => {
      const planned = await tillTakesThe16()
      loseAnswerTo(INS.GET_CHANGE)
      await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
      expect((await deps.store.tidies.list())[0].state).toBe("signed")

      await advanceTidies(deps)

      // Restore and the states, then given up: never a swap.
      expect(mint.restore).toHaveBeenCalledTimes(1)
      expect(mint.proofStates).toHaveBeenCalledTimes(1)
      await expectKeptForAHuman(planned)
    })
  })

  it("saves SIGN's signature before GET_CHANGE and swaps it as the card gave it: the tidy finishes", async () => {
    await putOnCard(AFTER_A_TILL)
    const answer = card.transceive.getMockImplementation()!
    // The store as each GET_CHANGE after SIGN found it: the first is SIGN's record.
    const afterSign: TidyRecord[][] = []
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.GET_CHANGE && card.ins().includes(INS.SPEND_ALL_SIGN)) {
        afterSign.push(await deps.store.tidies.list())
      }
      return answer(apdu)
    })

    const result = await runTidy(deps, args())

    if (result.status !== "tidied") throw new Error(`not tidied: ${result.status}`)
    expect(result.record.signature).toMatch(/^[0-9a-f]{128}$/)
    expect(afterSign[0][0]).toMatchObject({
      state: "signed",
      signature: result.record.signature,
    })
    // No second signature asked for: SPEND_ALL_AGAIN gives the same one.
    expect(card.ins()).not.toContain(INS.SPEND_ALL_AGAIN)
    expect(mint.swap).toHaveBeenCalledTimes(1)
    expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
    expect(belowTarget(unspentAmounts())).toBe(false)
  })

  it("carries SPEND_ALL_AGAIN's answer to the mint as the card gave it, after a lost SIGN answer", async () => {
    await putOnCard(AFTER_A_TILL)
    const restore = loseAnswerTo(INS.SPEND_ALL_SIGN)
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    restore()
    await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })
    expect(card.ins()).toContain(INS.SPEND_ALL_AGAIN)
    expect(mint.swap).toHaveBeenCalledTimes(1)
    expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
  })

  it("leaves a tidy `needs-card` when the mint refuses its swap: the identical swap would be refused again", async () => {
    await putOnCard(AFTER_A_TILL)
    // A keyset rotated to inactive: the keyset is inside the signed message,
    // so no retry of this swap can pass, whatever the phone's check says.
    ;(mint.swap as jest.Mock).mockRejectedValueOnce(
      new MintOperationError(12002, "keyset inactive"),
    )

    await expect(runTidy(deps, args())).rejects.toMatchObject({
      name: "TidyError",
      reason: "needs-card",
    })

    const [kept] = await deps.store.tidies.list()
    expect(kept.state).toBe("needs-card")
    expect(kept.signature).toMatch(/^[0-9a-f]{128}$/)
    expect(cardCommitments([], card.pubkey, [kept]).slots).toBe(0)
    // Not polled again: the card-free pass leaves it, keeps no poll armed for
    // it, and it can be dismissed.
    await expect(advanceTidies(deps)).resolves.toEqual({ waiting: 0 })
    expect(mint.swap).toHaveBeenCalledTimes(1)
    await expect(deps.store.tidies.archive(kept.id)).resolves.toBe(true)
  })

  const itLeavesSignedOn = (code: number, detail: string) =>
    it(`leaves a tidy \`signed\` on the mint's passing refusal ${code}, and finishes it on the next tap`, async () => {
      await putOnCard(AFTER_A_TILL)
      // Nutshell answers any server exception with a 400 and code 0, and
      // pending pieces with 11002/11004: the transaction rolled back, every
      // input is still UNSPENT, and the identical swap passes moments later.
      ;(mint.swap as jest.Mock).mockRejectedValueOnce(
        new MintOperationError(code, detail),
      )

      await expect(runTidy(deps, args())).rejects.toThrow(detail)

      const [saved] = await deps.store.tidies.list()
      expect(saved.state).toBe("signed")
      await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })
      expect(mint.swap).toHaveBeenCalledTimes(2)
      expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
    })

  itLeavesSignedOn(0, "database is locked")
  itLeavesSignedOn(11002, "Proofs are pending.")
  itLeavesSignedOn(11004, "Outputs are pending.")

  it("finishes a tidy whose lost swap commits at the mint while it is being asked about", async () => {
    await putOnCard(AFTER_A_TILL)
    // The swap's answer is lost while the mint is still inside its
    // transaction; the transaction commits (inputs SPENT, outputs signed, in
    // one step) just as the phone asks about the inputs. Asked in the other
    // order (restore, then states), "nothing restored" and "SPENT" describe
    // two different moments, and a tidy the mint signed is given up.
    const swap = (mint.swap as jest.Mock).getMockImplementation()!
    const states = (mint.proofStates as jest.Mock).getMockImplementation()!
    let inFlight: Parameters<typeof swap> | undefined
    ;(mint.swap as jest.Mock).mockImplementationOnce(async (...call) => {
      inFlight = call as Parameters<typeof swap>
      throw new Error("Network request failed")
    })
    ;(mint.proofStates as jest.Mock).mockImplementation(async (Ys: string[]) => {
      if (inFlight) {
        const commit = inFlight
        inFlight = undefined
        await swap(...commit)
      }
      return states(Ys)
    })

    await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })
    expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
    expect((await deps.store.tidies.list()).every((t) => t.state !== "needs-card")).toBe(
      true,
    )
  })

  it("leaves a tidy `signed` when the swap is cut by the network, and finishes it on the next tap", async () => {
    await putOnCard(AFTER_A_TILL)
    // Never reached the mint: no MintOperationError, every input UNSPENT.
    ;(mint.swap as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"))

    await expect(runTidy(deps, args())).rejects.toThrow("Network request failed")

    const [saved] = await deps.store.tidies.list()
    expect(saved.state).toBe("signed")
    expect(saved.signature).toMatch(/^[0-9a-f]{128}$/)
    await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })
    expect(mint.swap).toHaveBeenCalledTimes(2)
    expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
  })

  it("counts a signed tidy the card-free pass could not swap as still waiting, so the minter asks again, and none once swapped", async () => {
    await putOnCard(AFTER_A_TILL)
    // Cut by the network in the tap and again in the first card-free pass.
    ;(mint.swap as jest.Mock)
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockRejectedValueOnce(new Error("Network request failed"))
    await expect(runTidy(deps, args())).rejects.toThrow("Network request failed")

    await expect(advanceTidies(deps)).resolves.toEqual({ waiting: 1 })
    expect((await deps.store.tidies.list())[0].state).toBe("signed")

    await expect(advanceTidies(deps)).resolves.toEqual({ waiting: 0 })
    expect((await deps.store.tidies.list())[0].state).not.toBe("signed")
    expect(mint.swap).toHaveBeenCalledTimes(3)
  })

  it("leaves a tidy `needs-card` when the mint spent its piece for something else while its swap was cut", async () => {
    await putOnCard(AFTER_A_TILL)
    // The swap's answer is lost, and by then the mint has the 16 SPENT for
    // another payment, with none of the tidy's change signed.
    ;(mint.swap as jest.Mock).mockImplementationOnce(async (inputs) => {
      const [kept] = await deps.store.tidies.list()
      expect(inputs).toHaveLength(1)
      mint.proofStatesByY.set(proofY(kept.inputs[0].nonce, card.pubkey), "SPENT")
      throw new Error("Network request failed")
    })

    await expect(runTidy(deps, args())).rejects.toMatchObject({
      name: "TidyError",
      reason: "needs-card",
    })

    const [kept] = await deps.store.tidies.list()
    expect(kept.state).toBe("needs-card")
    expect(cardCommitments([], card.pubkey, [kept]).slots).toBe(0)
    await advanceTidies(deps)
    expect(mint.swap).toHaveBeenCalledTimes(1)
    await expect(deps.store.tidies.archive(kept.id)).resolves.toBe(true)
  })

  it("keeps the signature when the card signed something else and the mint refuses it: `needs-card`", async () => {
    await putOnCard(AFTER_A_TILL)
    // The card burns the 16 and answers SIGN with a signature over another message.
    const other = new Array(64).fill(0).map((_, i) => (i * 7 + 3) & 0xff)
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      const response = await answer(apdu)
      // SIGN and AGAIN alike: the card's last signature is the other one.
      return apdu[1] === INS.SPEND_ALL_SIGN || apdu[1] === INS.SPEND_ALL_AGAIN
        ? [...other, 0x90, 0x00]
        : response
    })

    await expect(runTidy(deps, args())).rejects.toMatchObject({
      name: "TidyError",
      reason: "needs-card",
    })

    const [kept] = await unfinishedTidies(deps, card.pubkey)
    expect(kept).toMatchObject({ state: "needs-card", signature: toHex(other) })
    // The mint was asked, refused, and spent nothing.
    expect(mint.swap).toHaveBeenCalledTimes(1)
    const states = await mint.proofStates(
      kept.inputs.map((input) => proofY(input.nonce, card.pubkey)),
    )
    expect(states).toEqual(["UNSPENT"])
    expect(card.ins()).not.toContain(INS.SPEND_ALL_AGAIN)

    // Not retried as owed: the card-free pass and the next tap leave it be.
    await advanceTidies(deps)
    expect(mint.swap).toHaveBeenCalledTimes(1)
    expect((await deps.store.tidies.list())[0].state).toBe("needs-card")
  })

  it("moves a dismissed `needs-card` tidy to the archive, signature and all, and the list back to format 2", async () => {
    await putOnCard(AFTER_A_TILL)
    const other = new Array(64).fill(0x11)
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      const response = await answer(apdu)
      // SIGN and AGAIN alike: the card's last signature is the other one.
      return apdu[1] === INS.SPEND_ALL_SIGN || apdu[1] === INS.SPEND_ALL_AGAIN
        ? [...other, 0x90, 0x00]
        : response
    })
    await expect(runTidy(deps, args())).rejects.toMatchObject({ reason: "needs-card" })
    const [kept] = await deps.store.tidies.list()

    await expect(deps.store.tidies.archive(kept.id)).resolves.toBe(true)

    expect(await deps.store.tidies.list()).toEqual([])
    expect(await unfinishedTidies(deps, card.pubkey)).toEqual([])
    expect(await deps.store.tidies.archived()).toEqual([
      expect.objectContaining({
        id: kept.id,
        state: "needs-card",
        signature: toHex(other),
      }),
    ])
    const saved = await Keychain.getInternetCredentials("flashcard-v2-topups")
    expect(saved && JSON.parse(saved.password).format).toBe(2)
  })

  it("burns nothing and keeps nothing when the card wants its PIN (allowance 0), and goes through with it", async () => {
    card = createFakeCard(32, { pin: "1234" })
    await putOnCard(AFTER_A_TILL)

    const refused = runTidy(deps, args())
    await expect(refused).rejects.toBeInstanceOf(CardSpendError)
    await expect(refused).rejects.toMatchObject({ reason: "pin-needed" })
    expect(card.slots.filter((slot) => slot[0] === 2)).toHaveLength(0)
    expect(await unfinishedTidies(deps, card.pubkey)).toEqual([])

    const verifyPin = (transceive: Transceiver) =>
      verifyCardPin(transceive, "1234", { sealed: false, cardPubkey: card.pubkey })
    await expect(runTidy(deps, args({ verifyPin }))).resolves.toMatchObject({
      status: "tidied",
    })
  })

  it("needs no PIN where the no-PIN allowance covers what leaves the card: the fee", async () => {
    card = createFakeCard(32, { pin: "1234", limits: { allowance: 10 } })
    await putOnCard(AFTER_A_TILL)
    await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })
    expect(card.nopinSpent()).toBe(0)
  })

  it("never tidies at a fee as large as the smallest piece it would make", async () => {
    // 1,000 ppk: the one input costs 1, and [1, 8]'s change would need a 1.
    mint.inputFeePpk.set(mint.keysetId, 1000)
    await putOnCard([1, 8])
    await expect(runTidy(deps, args({ feePpk: 1000 }))).resolves.toEqual({
      status: "skipped",
      reason: "fee",
    })
    expect(card.ins()).toEqual([INS.GET_PIECES, INS.GET_CHANGE])
  })

  it("sends nothing after GET_CHANGE to a card short of slots", async () => {
    card = createFakeCard(2)
    await putOnCard([1, 8])

    await expect(runTidy(deps, args())).resolves.toEqual({
      status: "skipped",
      reason: "slots",
    })
    expect(card.ins()).toEqual([INS.GET_PIECES, INS.GET_CHANGE])
    expect(await deps.store.tidies.list()).toEqual([])
  })

  it("leaves a card at its shape alone", async () => {
    await putOnCard([1, 1, 2, 4, 8])
    await expect(runTidy(deps, args())).resolves.toEqual({
      status: "skipped",
      reason: "at-target",
    })
  })

  describe("the keyset whose fee was asked before the tap", () => {
    const OTHER = "00ffeeddccbbaa99"
    const GENERATOR = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
    /** Pieces of another keyset, as an older top-up left them (never sent to the mint here). */
    const putOtherOnCard = (amounts: number[]) =>
      amounts.forEach((amount) => {
        const slot = card.slots.findIndex((s) => s[0] === 0)
        card.slots[slot] = [
          1,
          ...bytes(OTHER),
          ...u32(amount),
          ...Array.from(randomBytes(32)),
          ...bytes(GENERATOR),
          ...u32(0),
        ]
      })

    it("plans in that keyset alone, though the tap's read now holds more value in another", async () => {
      await putOnCard(AFTER_A_TILL)
      // The read the owner was offered favoured the mint's keyset; since, the
      // card took a top-up in another, which now holds the most value.
      putOtherOnCard([64, 64])

      const result = await runTidy(deps, args())

      if (result.status !== "tidied") throw new Error(`not tidied: ${result.status}`)
      expect(result.record.keysetId).toBe(mint.keysetId)
      expect(mint.swap).toHaveBeenCalledTimes(1)
      const [inputs, outputs] = (mint.swap as jest.Mock).mock.calls[0]
      expect(inputs.every((p: { id: string }) => p.id === mint.keysetId)).toBe(true)
      expect(outputs.every((o: { id: string }) => o.id === mint.keysetId)).toBe(true)
      expect(unspentAmounts().filter((a) => a === 64)).toEqual([64, 64])
    })

    it("sends no SPEND_ALL_BEGIN when the card holds none of that keyset's pieces any more", async () => {
      await putOnCard(AFTER_A_TILL)

      await expect(runTidy(deps, args({ keysetId: OTHER }))).resolves.toEqual({
        status: "skipped",
        reason: "at-target",
      })
      expect(card.ins()).not.toContain(INS.SPEND_ALL_BEGIN)
      expect(card.ins()).not.toContain(INS.SPEND_ALL_SIGN)
      expect(await deps.store.tidies.list()).toEqual([])
    })

    it("starts no new tidy, and sends the card nothing, with no keyset asked about", async () => {
      await putOnCard(AFTER_A_TILL)

      await expect(runTidy(deps, args({ keysetId: undefined }))).resolves.toEqual({
        status: "skipped",
        reason: "at-target",
      })
      expect(card.ins()).toEqual([])
      expect(await deps.store.tidies.list()).toEqual([])
    })
  })

  describe("the card-free pass beside a tap", () => {
    it("leaves a tidy the tap is swapping alone: one swap", async () => {
      await putOnCard(AFTER_A_TILL)
      const realSwap = (mint.swap as jest.Mock).getMockImplementation()!
      // The minter's poll lands while the tap's swap is in flight.
      ;(mint.swap as jest.Mock).mockImplementationOnce(async (...call) => {
        await advanceTidies(deps)
        return realSwap(...call)
      })

      await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })

      expect(mint.swap).toHaveBeenCalledTimes(1)
      expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
    })

    it("leaves it alone from the `signed` save on, before the tap sends the swap", async () => {
      await putOnCard(AFTER_A_TILL)
      const answer = card.transceive.getMockImplementation()!
      // The poll lands between SIGN's save and the swap: at the grant.
      let polled = false
      card.transceive.mockImplementation(async (apdu) => {
        if (apdu[1] === INS.GET_NONCE && !polled) {
          polled = true
          expect((await deps.store.tidies.list())[0]).toMatchObject({ state: "signed" })
          await advanceTidies(deps)
        }
        return answer(apdu)
      })

      await expect(runTidy(deps, args())).resolves.toMatchObject({ status: "tidied" })

      expect(polled).toBe(true)
      expect(mint.swap).toHaveBeenCalledTimes(1)
      expect(mint.restore).not.toHaveBeenCalled()
    })

    it("a tap on a tidy the pass is swapping waits for the pass's answer: one swap", async () => {
      await putOnCard(AFTER_A_TILL)
      // A tap cut after SIGN and GET_CHANGE leaves the tidy `signed`.
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        if (apdu[1] === INS.GET_NONCE) throw new Error("Tag was lost")
        return answer(apdu)
      })
      await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
      card.transceive.mockImplementation(answer)

      // The pass's swap is held at the mint until the next tap has begun.
      const realSwap = (mint.swap as jest.Mock).getMockImplementation()!
      let release: () => void = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      ;(mint.swap as jest.Mock).mockImplementationOnce(async (...call) => {
        await held
        return realSwap(...call)
      })
      const pass = advanceTidies(deps)
      await waitUntil(() => (mint.swap as jest.Mock).mock.calls.length === 1)

      const tap = runTidy(deps, args())
      await new Promise((resolve) => {
        setTimeout(resolve, 20)
      })
      release()

      await expect(tap).resolves.toMatchObject({ status: "tidied" })
      await pass
      expect(mint.swap).toHaveBeenCalledTimes(1)
      expect(sum(unspentAmounts())).toBe(sum(AFTER_A_TILL))
    })
  })
})

describe("cardCommitments", () => {
  const tidy = (state: TidyRecord["state"], outputs = 4): TidyRecord => ({
    kind: "tidy",
    version: 1,
    id: `t-${state}`,
    cardPubkey: "02" + "ab".repeat(32),
    mintUrl: "https://mint.test",
    keysetId: "00aabbccddeeff00",
    fee: 0,
    inputs: [],
    outputs: new Array(outputs).fill({ amount: 1 }),
    loadStarted: false,
    state,
    createdAt: 1,
    updatedAt: 1,
  })

  it("counts the change of every tidy still owed against the card's slots", () => {
    const pubkey = "02" + "ab".repeat(32)
    for (const state of ["planned", "signed", "swapped"] as const) {
      expect(cardCommitments([], pubkey, [tidy(state)]).slots).toBe(4)
    }
    for (const state of ["loaded", "abandoned", "needs-card"] as const) {
      expect(cardCommitments([], pubkey, [tidy(state)]).slots).toBe(0)
    }
    expect(cardCommitments([], "03" + "cd".repeat(32), [tidy("planned")]).slots).toBe(0)
  })

  it("refuses a top-up the card's unfinished tidy leaves no room for", async () => {
    await deps.store.tidies.put({ ...tidy("signed", 30), cardPubkey: card.pubkey })
    await expect(
      prepareTopUp(
        { ...deps, pay: jest.fn() },
        {
          cardPubkey: card.pubkey,
          unit: "sat",
          amount: 7,
          walletId: "w",
          card: { empty: 32, hasOwner: true },
        },
      ),
    ).rejects.toEqual(expect.any(TopUpError))
    expect(mint.createQuote).not.toHaveBeenCalled()
  })
})

describe("runTidy progress (ENG-706)", () => {
  type Progress = Parameters<NonNullable<RunTidyArgs["onProgress"]>>[0]

  /** The progress a tap reports, as short labels: `making 2/5`. */
  const progressLog = () => {
    const log: string[] = []
    const onProgress = (p: Progress) =>
      log.push("done" in p ? `${p.stage} ${p.done}/${p.total}` : p.stage)
    return { log, onProgress }
  }
  const counted = (stage: string, total: number, from = 0) =>
    Array.from({ length: total - from + 1 }, (_, i) => `${stage} ${from + i}/${total}`)

  it("reports reading, each piece made, the mint, each piece loaded and done on a fresh tidy", async () => {
    await putOnCard(AFTER_A_TILL)
    const { log, onProgress } = progressLog()

    await expect(runTidy(deps, args({ onProgress }))).resolves.toMatchObject({
      status: "tidied",
    })

    expect(log).toEqual([
      "reading",
      ...counted("making", 5),
      "mint",
      ...counted("loading", 5),
      "done",
    ])
  })

  /** The fresh tidy of AFTER_A_TILL, command by command, as the first runTidy spec pins it. */
  const FRESH_TIDY = [
    ...new Array(4).fill(INS.GET_PIECES),
    INS.GET_CHANGE,
    INS.SPEND_ALL_BEGIN,
    ...new Array(5).fill(INS.SPEND_ALL_CHANGE),
    INS.SPEND_ALL_SIGN,
    INS.GET_CHANGE,
    INS.GET_CHANGE,
    INS.GET_NONCE,
    INS.ALLOW_LOAD,
    INS.GET_SLOT_STATUS,
    ...new Array(5).fill(INS.LOAD_PROOF),
    INS.GET_SLOT_STATUS,
    INS.GET_PROOF,
    INS.CLEAR_SPENT,
  ]

  it("sends the card the same commands with a progress callback as without one", async () => {
    await putOnCard(AFTER_A_TILL)
    const { log, onProgress } = progressLog()

    await runTidy(deps, args({ onProgress }))

    expect(log.length).toBeGreaterThan(0)
    expect(card.ins()).toEqual(FRESH_TIDY)
  })

  it("finishes the tidy when the progress callback throws: progress is cosmetic", async () => {
    await putOnCard(AFTER_A_TILL)
    const onProgress = jest.fn(() => {
      throw new Error("a UI bug")
    })

    const result = await runTidy(deps, args({ onProgress }))

    expect(result.status).toBe("tidied")
    expect(onProgress).toHaveBeenCalled()
    expect(card.ins()).toEqual(FRESH_TIDY)
  })

  it("reports only the mint, the load and done when a swapped tidy is finished", async () => {
    await putOnCard(AFTER_A_TILL)
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.GET_NONCE) throw new Error("Tag was lost")
      return answer(apdu)
    })
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    card.transceive.mockImplementation(answer)
    await advanceTidies(deps)
    const { log, onProgress } = progressLog()

    await expect(runTidy(deps, args({ onProgress }))).resolves.toMatchObject({
      status: "tidied",
    })

    expect(log).toEqual(["mint", ...counted("loading", 5), "done"])
  })

  it("counts only the pieces still to load when a cut load resumes", async () => {
    await putOnCard([1, 8])
    const answer = card.transceive.getMockImplementation()!
    let loads = 0
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.LOAD_PROOF && loads === 2) throw new Error("Tag was lost")
      if (apdu[1] === INS.LOAD_PROOF) loads += 1
      return answer(apdu)
    })
    const first = progressLog()
    await expect(runTidy(deps, args({ onProgress: first.onProgress }))).rejects.toThrow(
      "Tag was lost",
    )
    card.transceive.mockImplementation(answer)
    expect(first.log).toEqual([
      "reading",
      ...counted("making", 4),
      "mint",
      ...counted("loading", 4).slice(0, 3),
    ])
    const { log, onProgress } = progressLog()

    await expect(runTidy(deps, args({ onProgress }))).resolves.toMatchObject({
      status: "tidied",
    })

    expect(log).toEqual(["mint", ...counted("loading", 2), "done"])
  })

  it("reports reading, then the mint and the load, with no pieces made, when a planned tidy is recovered", async () => {
    await putOnCard(AFTER_A_TILL)
    const restore = loseAnswerTo(INS.SPEND_ALL_SIGN)
    await expect(runTidy(deps, args())).rejects.toThrow("Tag was lost")
    restore()
    const { log, onProgress } = progressLog()

    await expect(runTidy(deps, args({ onProgress }))).resolves.toMatchObject({
      status: "tidied",
    })

    expect(log).toEqual(["reading", "mint", ...counted("loading", 5), "done"])
  })

  it("reports only reading for a card at its shape", async () => {
    await putOnCard([1, 1, 2, 4, 8])
    const { log, onProgress } = progressLog()

    await expect(runTidy(deps, args({ onProgress }))).resolves.toEqual({
      status: "skipped",
      reason: "at-target",
    })

    expect(log).toEqual(["reading"])
  })

  it("never reports done on a tidy left unfinished", async () => {
    await putOnCard([1, 8])
    const answer = card.transceive.getMockImplementation()!
    let loads = 0
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.LOAD_PROOF && loads === 2) throw new Error("Tag was lost")
      if (apdu[1] === INS.LOAD_PROOF) loads += 1
      return answer(apdu)
    })
    const { log, onProgress } = progressLog()
    await expect(runTidy(deps, args({ onProgress }))).rejects.toThrow("Tag was lost")
    expect(log[log.length - 1]).toBe("loading 2/4")
    expect(log).not.toContain("done")
  })
})

describe("isFinalMintRefusal", () => {
  it("gives up only on refusals the signed swap decides", () => {
    for (const code of [
      10001, 11005, 11006, 11007, 11008, 11009, 11010, 12000, 12001, 12002,
    ]) {
      expect(isFinalMintRefusal(new MintOperationError(code, "refused"))).toBe(true)
    }
  })

  it("retries a server exception, pending pieces, the codes Nutshell gives two meanings, and anything that is not the mint's refusal", () => {
    for (const code of [0, 11001, 11002, 11003, 11004, 20000]) {
      expect(isFinalMintRefusal(new MintOperationError(code, "maybe"))).toBe(false)
    }
    expect(isFinalMintRefusal(new Error("Network request failed"))).toBe(false)
    expect(isFinalMintRefusal(undefined)).toBe(false)
  })
})
