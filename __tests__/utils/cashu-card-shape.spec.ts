/**
 * ENG-700: the shape of the value on a Cashu card. What it pins:
 *   - `targetPieces` sums to the balance and pays every amount from 1 to it
 *     exactly, checked by the greedy test and, independently, by subset sums;
 *   - the canonical vectors flash-pos (ENG-701) copies are what the function
 *     gives, and the file is exactly what its generator writes;
 *   - short of slots the shape degrades in order, never below the fewest
 *     pieces, and pays no fewer amounts as slots grow;
 *   - a top-up's pieces fill the gaps of what the card holds, always sum to
 *     the amount and fit the slots, and never pay fewer amounts than the
 *     amount shaped alone.
 */
import { readFileSync } from "fs"

import { MAX_SLOTS } from "../../app/utils/cashu-card"
import { splitPow2 } from "../../app/utils/cashu-card-outputs"
import {
  SPARE_PIECES,
  coversEveryAmount,
  exactReach,
  targetPieces,
  topUpPieces,
} from "../../app/utils/cashu-card-shape"
import {
  CARD_SHAPE_VECTORS_PATH,
  CardShapeVector,
  cardShapeVectorsText,
} from "../../scripts/card-shape-vectors"

const sum = (pieces: readonly number[]) => pieces.reduce((a, b) => a + b, 0)
const sorted = (pieces: readonly number[]) => [...pieces].sort((a, b) => a - b)
const isPow2 = (n: number) => {
  let power = 1
  while (power < n) power *= 2
  return power === n
}

/** Every amount 1..sum has an exact subset: a subset-sum table, not the greedy test. */
const everyAmountPays = (pieces: readonly number[]): boolean => {
  const total = sum(pieces)
  const reachable = new Uint8Array(total + 1)
  reachable[0] = 1
  for (const piece of pieces) {
    for (let amount = total; amount >= piece; amount -= 1) {
      if (reachable[amount - piece]) reachable[amount] = 1
    }
  }
  return reachable.every((ok) => ok === 1)
}

/** Sorted ascending, every piece is at most 1 + the sum of the smaller ones. */
const ladderInvariant = (pieces: readonly number[]): boolean => {
  let below = 0
  return sorted(pieces).every((piece) => {
    const ok = piece <= below + 1
    below += piece
    return ok
  })
}

/** A seeded PRNG (Park-Miller): the random cases are the same on every run. */
const seeded = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
}

describe("exactReach and coversEveryAmount", () => {
  it("reach the largest R that every amount up to pays exactly", () => {
    expect(exactReach([])).toBe(0)
    expect(exactReach([2])).toBe(0)
    expect(exactReach([32, 16, 8, 4])).toBe(0)
    expect(exactReach([1, 1, 2, 4, 4, 8, 8, 32])).toBe(28)
    expect(exactReach([4, 2, 1])).toBe(7)
    expect(coversEveryAmount([1, 2, 4])).toBe(true)
    expect(coversEveryAmount([1, 2, 4, 16])).toBe(false)
    expect(coversEveryAmount([])).toBe(true)
  })
})

describe("targetPieces", () => {
  const LARGE = [4095, 65_535, 100_000, 524_287, 999_999, 1_000_000]

  it("sums to the balance, covers every amount, in powers of two, within the card's slots", () => {
    for (let balance = 1; balance <= 2000; balance += 1) {
      const pieces = targetPieces(balance)
      expect(sum(pieces)).toBe(balance)
      expect(coversEveryAmount(pieces)).toBe(true)
      expect(ladderInvariant(pieces)).toBe(true)
      expect(pieces.every(isPow2)).toBe(true)
      expect(pieces).toEqual(sorted(pieces))
      expect(pieces.length).toBeLessThanOrEqual(MAX_SLOTS)
    }
    LARGE.forEach((balance) => {
      const pieces = targetPieces(balance)
      expect(sum(pieces)).toBe(balance)
      expect(coversEveryAmount(pieces)).toBe(true)
      expect(ladderInvariant(pieces)).toBe(true)
      expect(pieces.length).toBeLessThanOrEqual(31)
    })
  })

  it("pays every amount exactly, by subset sums, for every balance to 2,000", () => {
    // The checker itself: 32+16+8+4 cannot pay 1, 1+2+4 pays 1..7.
    expect(everyAmountPays([32, 16, 8, 4])).toBe(false)
    expect(everyAmountPays([1, 2, 4])).toBe(true)
    for (let balance = 1; balance <= 2000; balance += 1) {
      expect(everyAmountPays(targetPieces(balance))).toBe(true)
    }
  })

  it("is the ladder, the spares 1, 2, 4, 8 in order, and the fewest pieces for the rest", () => {
    expect(SPARE_PIECES).toEqual([1, 2, 4, 8])
    expect(targetPieces(7)).toEqual([1, 2, 4])
    // Ladder 1..16, spares 1/2/4/8, remainder 8+4+2.
    expect(targetPieces(60)).toEqual([1, 1, 2, 2, 2, 4, 4, 4, 8, 8, 8, 16])
    expect(targetPieces(1023)).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 512])
    expect(targetPieces(1000)).toHaveLength(19)
    expect(targetPieces(100)).toHaveLength(13)
    expect(targetPieces(1_000_000)).toHaveLength(31)
  })

  it("degrades for 60 in order: the remainder, the spares last first, the ladder's top", () => {
    expect(targetPieces(60, 12)).toEqual(targetPieces(60))
    expect(targetPieces(60, 11)).toEqual([1, 1, 2, 2, 2, 4, 4, 4, 8, 16, 16])
    expect(targetPieces(60, 9)).toEqual([1, 1, 2, 4, 4, 8, 8, 16, 16])
    expect(targetPieces(60, 8)).toEqual([1, 1, 2, 4, 4, 8, 8, 32])
    expect(exactReach(targetPieces(60, 8))).toBe(28)
    expect(targetPieces(60, 4)).toEqual([4, 8, 16, 32])
    expect(() => targetPieces(60, 3)).toThrow(RangeError)
  })

  it("never pays fewer amounts with more slots, and never takes more than it is given", () => {
    for (let balance = 1; balance <= 600; balance += 1) {
      const fewest = splitPow2(balance).length
      const full = targetPieces(balance).length
      let reach = -1
      for (let slots = fewest; slots <= full + 1; slots += 1) {
        const pieces = targetPieces(balance, slots)
        expect(pieces.length).toBeLessThanOrEqual(slots)
        expect(sum(pieces)).toBe(balance)
        expect(exactReach(pieces)).toBeGreaterThanOrEqual(reach)
        reach = exactReach(pieces)
      }
      expect(targetPieces(balance, fewest)).toEqual(sorted(splitPow2(balance)))
    }
  })

  it("refuses a balance that is not a positive safe integer, or too few slots", () => {
    expect(() => targetPieces(0)).toThrow(RangeError)
    expect(() => targetPieces(-1)).toThrow(RangeError)
    expect(() => targetPieces(2.5)).toThrow(RangeError)
    expect(() => targetPieces(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError)
    expect(() => targetPieces(1, 0)).toThrow(RangeError)
  })
})

describe("the shared card-shape vectors (flash-pos copies this file, ENG-701)", () => {
  const text = readFileSync(CARD_SHAPE_VECTORS_PATH, "utf8")
  const file = JSON.parse(text) as { sparePieces: number[]; vectors: CardShapeVector[] }

  it("is exactly what scripts/card-shape-vectors.ts writes", () => {
    expect(text).toBe(cardShapeVectorsText())
  })

  it("holds the ticket's examples", () => {
    const at = (balance: number, slotsFree?: number) =>
      file.vectors.find((v) => v.balance === balance && v.slotsFree === slotsFree)?.pieces
    expect(at(7)).toEqual([1, 2, 4])
    expect(at(60)).toEqual([1, 1, 2, 2, 2, 4, 4, 4, 8, 8, 8, 16])
    expect(at(1023)).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 512])
    expect(at(1000)).toHaveLength(19)
    expect(at(60, 9)).toEqual([1, 1, 2, 4, 4, 8, 8, 16, 16])
    expect(file.sparePieces).toEqual([...SPARE_PIECES])
  })

  it("every vector is what targetPieces gives, and holds the invariant", () => {
    expect(file.vectors.length).toBeGreaterThan(64)
    file.vectors.forEach(({ balance, slotsFree, pieces }) => {
      expect(targetPieces(balance, slotsFree)).toEqual(pieces)
      expect(sum(pieces)).toBe(balance)
      if (slotsFree === undefined) expect(ladderInvariant(pieces)).toBe(true)
    })
  })
})

describe("topUpPieces", () => {
  it("fills the gaps of a card shaped the old way", () => {
    const old = [4, 8, 16, 32]
    expect(topUpPieces(3, old, 10)).toEqual([1, 2])
    expect(exactReach([...old, ...topUpPieces(3, old, 10)])).toBe(63)
    const seven = topUpPieces(7, old, 10)
    expect(sum(seven)).toBe(7)
    expect(exactReach([...old, ...seven])).toBe(67)
  })

  it("completes the whole card's target shape when it can", () => {
    const pieces = topUpPieces(100, [16], 20)
    expect(sorted([16, ...pieces])).toEqual(targetPieces(116))
    // Fewer than the 13 that 100 alone would take.
    expect(pieces).toHaveLength(12)
  })

  it("shapes the amount alone when the card's pieces are unknown or it holds none", () => {
    expect(topUpPieces(60, undefined, 128)).toEqual(targetPieces(60))
    expect(topUpPieces(60, [], 128)).toEqual(targetPieces(60))
    expect(topUpPieces(60, undefined, 9)).toEqual(targetPieces(60, 9))
  })

  it("refuses an amount the slots cannot take even as the fewest pieces", () => {
    expect(() => topUpPieces(60, [16], 3)).toThrow(RangeError)
  })

  it("always sums to the amount, fits the slots, and pays no fewer amounts than the amount shaped alone (500 seeded cases)", () => {
    const random = seeded(700)
    const below = (n: number) => Math.floor(random() * n)
    for (let i = 0; i < 500; i += 1) {
      const existing = Array.from({ length: below(12) }, () => 2 ** below(10))
      const amount = 1 + below(i % 2 ? 300 : 5000)
      const slotsFree = splitPow2(amount).length + below(30)
      const pieces = topUpPieces(amount, existing, slotsFree)
      const alone = targetPieces(amount, slotsFree)
      expect(sum(pieces)).toBe(amount)
      expect(pieces.length).toBeLessThanOrEqual(slotsFree)
      expect(pieces.every(isPow2)).toBe(true)
      expect(exactReach([...existing, ...pieces])).toBeGreaterThanOrEqual(
        exactReach([...existing, ...alone]),
      )
    }
  })
})
