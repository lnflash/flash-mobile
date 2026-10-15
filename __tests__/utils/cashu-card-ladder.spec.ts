/* eslint-disable no-bitwise -- card bytes are read and written by hand here. */
/**
 * ENG-702: how far a card's pieces are from ENG-700's shape, and the tidy that
 * brings them back. What it pins:
 *   - a card at `targetPieces` of its balance is never below target, and one
 *     with a gap in its ladder, or a spare gone, is;
 *   - a tidy's change always comes to its inputs less the fee, in powers of
 *     two, within the openings and slots free, and only ever lowers the
 *     card's deficit;
 *   - the fewest inputs that reach the shape win, and a card that cannot
 *     reach it in one tidy (one large piece) gets a partial tidy within 8;
 *   - each reason a tidy is not offered.
 */
import { CardProofSlot, MAX_SLOTS } from "../../app/utils/cashu-card"
import { coversEveryAmount, targetPieces } from "../../app/utils/cashu-card-shape"
import {
  TidyPiece,
  belowTarget,
  inputFee,
  planTidy,
  shapeDeficit,
} from "../../app/utils/cashu-card-topup/ladder"

const KEYSET = "00aabbccddeeff00"
const OTHER_KEYSET = "00ffeeddccbbaa00"
/** secp256k1's generator, compressed: a C that is a point. */
const C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"

const sum = (pieces: readonly number[]) => pieces.reduce((a, b) => a + b, 0)
const isPow2 = (n: number) => n >= 1 && (n & (n - 1)) === 0

/** A card's pieces as GET_PIECES reads them, one slot each, in slot order. */
const piecesOf = (
  amounts: readonly number[],
  over: Partial<CardProofSlot> = {},
): TidyPiece[] =>
  amounts.map((amount, slot) => ({
    slot,
    keysetId: KEYSET,
    amount,
    nonce: (slot + 1).toString(16).padStart(64, "0"),
    C,
    date: 0,
    ...over,
  }))

const ROOMY = { freeOpenings: 8, freeSlots: 64, feePpk: 0 }

/** The card after a tidy: what it kept, and the change. */
const after = (
  card: readonly TidyPiece[],
  plan: Extract<ReturnType<typeof planTidy>, { kind: "tidy" }>,
) => {
  const burned = new Set(plan.inputs.map((piece) => piece.slot))
  return [
    ...card.filter((piece) => !burned.has(piece.slot)).map((piece) => piece.amount),
    ...plan.outputs,
  ]
}

/** A deterministic stream of numbers in [0, 1), for card shapes a till could leave. */
const seeded = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

describe("belowTarget", () => {
  it("is false for ENG-700's shape of every balance from 1 to 2,000", () => {
    for (let balance = 1; balance <= 2000; balance += 1) {
      expect(belowTarget(targetPieces(balance))).toBe(false)
    }
  })

  it("is false for an empty card", () => {
    expect(belowTarget([])).toBe(false)
    expect(shapeDeficit([])).toBe(0)
  })

  it("finds a gap in the ladder: [4, 8] pays neither 1 nor 3", () => {
    expect(coversEveryAmount([4, 8])).toBe(false)
    expect(belowTarget([4, 8])).toBe(true)
  })

  it("finds one large piece below its target: [1, 512]", () => {
    expect(belowTarget([1, 512])).toBe(true)
  })

  it("finds a spare gone on a card that still pays every amount", () => {
    // 9 as [1, 2, 2, 4] pays 1..9 exactly, but the target holds three 1s
    // ([1, 1, 1, 2, 4]): the next bill of 1 after one would have no change.
    expect(coversEveryAmount([1, 2, 2, 4])).toBe(true)
    expect(belowTarget([1, 2, 2, 4])).toBe(true)
  })

  it("holds the boundary: a piece of exactly one more than the pieces below it is no gap", () => {
    // 4 = 1 + (1 + 2): the ladder 1, 2, 4 is 7's target.
    expect(belowTarget([1, 2, 4])).toBe(false)
    // 4 > 1 + (1 + 1): 3 cannot be paid.
    expect(belowTarget([1, 1, 4])).toBe(true)
  })

  it("is the order of the pieces' no concern", () => {
    expect(belowTarget([4, 2, 1])).toBe(false)
    expect(shapeDeficit([8, 4])).toBe(shapeDeficit([4, 8]))
  })
})

describe("planTidy", () => {
  it("takes the fewest of the largest pieces that bring the card back to its shape", () => {
    // 60 as a top-up shaped it, after a till took 1 and 2 offline: 57.
    const card = piecesOf([1, 2, 2, 4, 4, 4, 8, 8, 8, 16])
    expect(belowTarget(card.map((piece) => piece.amount))).toBe(true)

    const plan = planTidy(card, ROOMY)

    expect(plan).toMatchObject({ kind: "tidy", keysetId: KEYSET, fee: 0, complete: true })
    if (plan.kind !== "tidy") return
    // The 16 alone, as ENG-700's shape of 16, largest first.
    expect(plan.inputs.map((piece) => piece.amount)).toEqual([16])
    expect(plan.outputs).toEqual([8, 4, 2, 1, 1])
    expect(sum(plan.outputs)).toBe(16)
    expect(belowTarget(after(card, plan))).toBe(false)
  })

  it("keeps the balance: the change comes to the inputs less the fee", () => {
    const card = piecesOf([1, 2, 2, 4, 4, 4, 8, 8, 8, 16])
    for (const feePpk of [0, 100, 1000]) {
      for (let freeOpenings = 1; freeOpenings <= 8; freeOpenings += 1) {
        const plan = planTidy(card, { ...ROOMY, feePpk, freeOpenings })
        if (plan.kind === "tidy") {
          expect(plan.fee).toBe(inputFee(plan.inputs.length, feePpk))
          expect(sum(plan.outputs)).toBe(
            sum(plan.inputs.map((piece) => piece.amount)) - plan.fee,
          )
        }
      }
    }
  })

  it("never offers a tidy whose fee is as much as the smallest piece it makes", () => {
    const card = piecesOf([1, 2, 2, 4, 4, 4, 8, 8, 8, 16])
    // 100 ppk on one input is a fee of 1, and the change has a 1 in it.
    expect(planTidy(card, { ...ROOMY, feePpk: 100 })).toEqual({
      kind: "skip",
      reason: "fee",
    })
  })

  it("makes a partial tidy of [1, 512] within the card's 8 openings, and a second finishes it", () => {
    const card = piecesOf([1, 512])
    const first = planTidy(card, ROOMY)

    expect(first).toMatchObject({ kind: "tidy", complete: false })
    if (first.kind !== "tidy") return
    expect(first.outputs.length).toBeLessThanOrEqual(8)
    expect(first.outputs.every(isPow2)).toBe(true)
    expect(sum(first.outputs)).toBe(512)
    const middle = after(card, first)
    expect(shapeDeficit(middle)).toBeLessThan(shapeDeficit([1, 512]))

    // The next online read offers the rest.
    const next = piecesOf(middle)
    const second = planTidy(next, ROOMY)
    expect(second).toMatchObject({ kind: "tidy", complete: true })
    if (second.kind !== "tidy") return
    expect(second.outputs.length).toBeLessThanOrEqual(8)
    expect(belowTarget(after(next, second))).toBe(false)
  })

  it("only ever lowers the deficit, in powers of two, within the room, on card shapes a till could leave", () => {
    const random = seeded(702)
    for (let trial = 0; trial < 150; trial += 1) {
      const count = 1 + Math.floor(random() * 12)
      const amounts = Array.from({ length: count }, () => 2 ** Math.floor(random() * 9))
      const freeOpenings = 1 + Math.floor(random() * 8)
      const freeSlots = 1 + Math.floor(random() * 10)
      const card = piecesOf(amounts)
      const plan = planTidy(card, { freeOpenings, freeSlots, feePpk: 0 })
      if (plan.kind === "tidy") {
        expect(plan.outputs.every(isPow2)).toBe(true)
        expect(plan.outputs.length).toBeLessThanOrEqual(Math.min(freeOpenings, freeSlots))
        expect(sum(plan.outputs)).toBe(sum(plan.inputs.map((piece) => piece.amount)))
        expect(shapeDeficit(after(card, plan))).toBeLessThan(shapeDeficit(amounts))
        expect(plan.complete).toBe(!belowTarget(after(card, plan)))
      } else if (!belowTarget(amounts)) {
        expect(plan.reason).toBe("at-target")
      }
    }
  })

  it("offers nothing for a card at its shape", () => {
    expect(planTidy(piecesOf(targetPieces(60)), ROOMY)).toEqual({
      kind: "skip",
      reason: "at-target",
    })
  })

  it("says the slots are short when they, not the card, stop the tidy", () => {
    const card = piecesOf([1, 2, 2, 4, 4, 4, 8, 8, 8, 16])
    expect(planTidy(card, { ...ROOMY, freeSlots: 0 })).toEqual({
      kind: "skip",
      reason: "slots",
    })
    // One new piece is the 512 again: one slot brings [1, 512] no closer.
    expect(planTidy(piecesOf([1, 512]), { ...ROOMY, freeSlots: 1 })).toEqual({
      kind: "skip",
      reason: "slots",
    })
  })

  it("says the openings are short when a till's change holds them", () => {
    const card = piecesOf([1, 2, 2, 4, 4, 4, 8, 8, 8, 16])
    expect(planTidy(card, { ...ROOMY, freeOpenings: 0 })).toEqual({
      kind: "skip",
      reason: "openings",
    })
    expect(planTidy(piecesOf([1, 512]), { ...ROOMY, freeOpenings: 1 })).toEqual({
      kind: "skip",
      reason: "openings",
    })
  })

  it("says no progress when no tidy of the card's pieces brings it closer", () => {
    // [2, 2] wants [1, 1, 2]; at 2,000 ppk the fee eats every input whole.
    expect(belowTarget([2, 2])).toBe(true)
    expect(planTidy(piecesOf([2, 2]), { ...ROOMY, feePpk: 2000 })).toEqual({
      kind: "skip",
      reason: "no-progress",
    })
  })

  it("plans over one keyset's undated pieces only: BEGIN refuses mixed dates", () => {
    const card = [
      ...piecesOf([1, 2, 2, 4, 4, 4, 8, 8, 8, 16]),
      { ...piecesOf([64])[0], slot: 20, date: 1_700_000_000 },
      { ...piecesOf([32])[0], slot: 21, keysetId: OTHER_KEYSET },
    ]
    const plan = planTidy(card, ROOMY)
    expect(plan.kind).toBe("tidy")
    if (plan.kind !== "tidy") return
    expect(
      plan.inputs.every((piece) => piece.keysetId === KEYSET && piece.date === 0),
    ).toBe(true)
    expect(plan.inputs.map((piece) => piece.slot)).toEqual([9])
  })

  it("never names more than the card's 128 slots", () => {
    const plan = planTidy(piecesOf(new Array(MAX_SLOTS).fill(2)), ROOMY)
    if (plan.kind === "tidy") expect(plan.inputs.length).toBeLessThanOrEqual(MAX_SLOTS)
  })
})
