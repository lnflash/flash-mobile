/**
 * How far a card's pieces are from their canonical shape, and the tidy that
 * brings them back (ENG-702).
 *
 * A till pays offline by taking whole pieces off the card, so every payment
 * eats into the low rungs of the ladder ENG-700's top-ups build
 * (`targetPieces`). A tidy swaps some of the card's largest pieces at the mint
 * for change the card makes for itself, shaped to the target again.
 *
 * The measure is ENG-700's target for the card's balance B, T =
 * `targetPieces(B)`: for each rung d (1, 2, 4, … up to T's largest piece), the
 * card should hold at least as much value in pieces of d or less as T does.
 * The shortfall, summed over the rungs, is the card's deficit; a card is below
 * target exactly when it is above 0. T covers every amount, and holding at
 * least T's value under every rung means every piece is at most one more than
 * the pieces below it, so a card at 0 covers every amount too
 * (`coversEveryAmount`), spares and all.
 *
 * Pure: no card, no mint, no clock.
 */
import { CardProofSlot, isProofShaped } from "../cashu-card"
import { splitPow2 } from "../cashu-card-outputs"
import { targetPieces } from "../cashu-card-shape"
import { CHANGE_MOST } from "../cashu-card-spend"

const sum = (pieces: readonly number[]): number => pieces.reduce((a, b) => a + b, 0)

/** The first rung (as a power of two's exponent) a piece counts toward: the least d >= piece. */
const rungOf = (piece: number): number => {
  let rung = 0
  while (2 ** rung < piece) rung += 1
  return rung
}

/** For each rung 1, 2, 4, … up to the target's largest piece, the target's value in pieces of it or less. */
const needs = new Map<number, number[]>()
const needOf = (balance: number): number[] => {
  const known = needs.get(balance)
  if (known) return known
  const target = targetPieces(balance)
  const top = rungOf(Math.max(...target))
  const need = new Array<number>(top + 1).fill(0)
  target.forEach((piece) => {
    need[rungOf(piece)] += piece
  })
  for (let rung = 1; rung <= top; rung += 1) need[rung] += need[rung - 1]
  // A planner asks about a handful of balances; a long-lived app, many.
  if (needs.size > 256) needs.clear()
  needs.set(balance, need)
  return need
}

/**
 * How far `pieces` fall short of their balance's target shape: for each rung
 * of the target, the value it holds in pieces of that rung or less and the
 * card does not, summed. 0 for a card at its target, and for an empty one.
 * Every split of a piece in two lowers it or leaves it, so a tidy that lowers
 * it is progress, and tidies that each lower it end at 0.
 */
export function shapeDeficit(pieces: readonly number[]): number {
  const balance = sum(pieces)
  if (balance < 1) return 0
  const need = needOf(balance)
  const have = new Array<number>(need.length).fill(0)
  pieces.forEach((piece) => {
    const rung = rungOf(piece)
    if (rung < have.length) have[rung] += piece
  })
  let deficit = 0
  let held = 0
  need.forEach((needed, rung) => {
    held += have[rung]
    deficit += Math.max(0, needed - held)
  })
  return deficit
}

/**
 * The card's pieces are short of ENG-700's shape for their balance: a gap in
 * the ladder (an amount that cannot be paid exactly), or a spare gone.
 */
export const belowTarget = (pieces: readonly number[]): boolean =>
  shapeDeficit(pieces) > 0

/** A piece a tidy can name to SPEND_ALL_BEGIN: a slot as GET_PIECES read it. */
export type TidyPiece = Pick<
  CardProofSlot,
  "slot" | "keysetId" | "amount" | "nonce" | "C" | "date"
>

/** Why no tidy is offered. */
export type TidySkip =
  /** The card is at its shape already. */
  | "at-target"
  /** Too few empty slots for the change, the card's unfinished top-ups and tidies counted. */
  | "slots"
  /** Too few of the card's eight change openings free: a till's change not yet back on it holds them. */
  | "openings"
  /** The mint's fee is as much as the smallest piece the tidy would make. */
  | "fee"
  /** Nothing within the room brings the card closer to its shape. */
  | "no-progress"

export type TidyPlan =
  | {
      kind: "tidy"
      /** The keyset of every input and every new piece. */
      keysetId: string
      /** The pieces the card burns, largest first, in the order named to the card. */
      inputs: TidyPiece[]
      /** The change the card makes for itself, largest first: sums to the inputs less `fee`. */
      outputs: number[]
      /** NUT-02 input fee, in the keyset's unit: `ceil(inputs · ppk / 1000)`. */
      fee: number
      /** The card is at its shape after this tidy; false for a partial one, offered again later. */
      complete: boolean
    }
  | { kind: "skip"; reason: TidySkip }

export type TidyRoom = {
  /** Change openings the card has free (8 less those it holds). */
  freeOpenings: number
  /** Empty slots less what the card's unfinished top-ups and tidies will take. */
  freeSlots: number
  /** The keyset's NUT-02 `input_fee_ppk`. */
  feePpk: number
  /** The keyset to tidy; by default the one holding the most of the card's undated value. */
  keysetId?: string
}

/** A piece the card can spend in one payment with the others: undated, and a proof at all. */
const spendable = (piece: TidyPiece): boolean => piece.date === 0 && isProofShaped(piece)

/**
 * The keyset a tidy of these pieces is in: the one holding the most undated
 * value, the first on the card on a tie. Undefined with no undated piece.
 */
export const tidyKeyset = (pieces: readonly TidyPiece[]): string | undefined => {
  const totals = new Map<string, number>()
  pieces
    .filter(spendable)
    .forEach((piece) =>
      totals.set(piece.keysetId, (totals.get(piece.keysetId) ?? 0) + piece.amount),
    )
  let best: string | undefined
  totals.forEach((total, keysetId) => {
    if (best === undefined || total > (totals.get(best) ?? 0)) best = keysetId
  })
  return best
}

/** NUT-02: the fee for `count` inputs at `ppk` parts per thousand each. */
export const inputFee = (count: number, ppk: number): number =>
  Math.ceil((count * ppk) / 1000)

/**
 * The fewest-pieces split of `value`, then halved, one piece at a time, where
 * a half lowers the merged card's deficit most, while there is room and a
 * half still lowers it.
 */
const splitToward = (value: number, rest: readonly number[], room: number): number[] => {
  let pieces = splitPow2(value)
  let deficit = shapeDeficit([...rest, ...pieces])
  while (pieces.length < room && deficit > 0) {
    let best: { pieces: number[]; deficit: number } | undefined
    for (const piece of new Set(pieces)) {
      if (piece >= 2) {
        const at = pieces.indexOf(piece)
        const halved = [
          ...pieces.slice(0, at),
          piece / 2,
          piece / 2,
          ...pieces.slice(at + 1),
        ]
        const after = shapeDeficit([...rest, ...halved])
        if (after < deficit && (!best || after < best.deficit)) {
          best = { pieces: halved, deficit: after }
        }
      }
    }
    if (!best) break
    pieces = best.pieces
    deficit = best.deficit
  }
  return pieces
}

type Candidate = { inputs: TidyPiece[]; outputs: number[]; fee: number; deficit: number }

const descending = (pieces: readonly number[]): number[] =>
  [...pieces].sort((a, b) => b - a)

/** Inputs a search tries beyond the largest pieces: enough for any tidy of eight new pieces. */
const MOST_CAPPED_INPUTS = 32

/**
 * The best tidy within `room` new pieces. For k = 1, 2, … inputs, the k
 * largest pieces, then the k largest no bigger than each smaller size the
 * card holds (a gap low in the ladder is closed by its smallest piece above
 * it, not its largest); their value less the fee reshaped, ENG-700's target
 * for it when it fits, else the fewest pieces halved toward the card's shape.
 * The first set that leaves the card at its shape wins (the fewest inputs);
 * without one, the set that leaves the least deficit, the fewer inputs on a
 * tie.
 */
const search = (
  pieces: readonly TidyPiece[],
  room: number,
  ppk: number,
): Candidate | undefined => {
  const largestFirst = [...pieces].sort((a, b) => b.amount - a.amount || a.slot - b.slot)
  const sizes = [...new Set(largestFirst.map((piece) => piece.amount))]
  const capped = sizes.map((cap, i) => {
    const under = largestFirst.filter((piece) => piece.amount <= cap)
    return i === 0 ? under : under.slice(0, MOST_CAPPED_INPUTS)
  })
  const tried = new Set<string>()
  let best: Candidate | undefined
  for (let k = 1; k <= largestFirst.length; k += 1) {
    for (const pool of capped) {
      const inputs = pool.slice(0, k)
      const key = inputs.map((piece) => piece.slot).join(",")
      if (inputs.length === k && !tried.has(key)) {
        tried.add(key)
        best = better(best, reshape(inputs, { card: largestFirst, room, ppk }))
        if (best?.deficit === 0) return best
      }
    }
  }
  return best
}

/**
 * `inputs` reshaped within `room`: ENG-700's target for their value less the
 * fee when it fits, else the fewest pieces halved toward the card's shape,
 * whichever leaves the card the less deficit. Undefined when the value cannot
 * fit the room at all.
 */
const reshape = (
  inputs: TidyPiece[],
  { card, room, ppk }: { card: readonly TidyPiece[]; room: number; ppk: number },
): Candidate | undefined => {
  const taken = new Set(inputs)
  const rest = card.filter((piece) => !taken.has(piece)).map((piece) => piece.amount)
  const fee = inputFee(inputs.length, ppk)
  const value = sum(inputs.map((piece) => piece.amount)) - fee
  if (value < 1 || splitPow2(value).length > room) return undefined
  const shapes: number[][] = [splitToward(value, rest, room)]
  const shaped = targetPieces(value)
  if (shaped.length <= room) shapes.push(shaped)
  return shapes
    .map((outputs) => ({
      inputs,
      outputs: descending(outputs),
      fee,
      deficit: shapeDeficit([...rest, ...outputs]),
    }))
    .reduce<Candidate | undefined>(better, undefined)
}

/** The less deficit; on a tie, as many inputs and fewer new pieces. The first otherwise. */
const better = (
  best: Candidate | undefined,
  next: Candidate | undefined,
): Candidate | undefined => {
  if (!next) return best
  if (!best) return next
  if (next.deficit < best.deficit) return next
  if (
    next.deficit === best.deficit &&
    next.inputs.length === best.inputs.length &&
    next.outputs.length < best.outputs.length
  ) {
    return next
  }
  return best
}

/**
 * The tidy to offer for a card's pieces, or why there is none.
 *
 * Only undated pieces of one keyset (`keysetId`, or the one holding the most
 * value) are considered: SPEND_ALL_BEGIN refuses pieces of different dates
 * (`6A80`), and the card's change takes the first piece's keyset. The card's
 * change is at most `min(freeOpenings, freeSlots)` new pieces, and its value
 * is exactly the inputs' less the fee, so the balance moves by the fee alone.
 *
 * A tidy that does not reach the shape (`complete` false: a large single piece
 * needs more than eight new ones) is offered only when it brings the card
 * closer to it, and the card is offered another on its next online read. No
 * tidy is offered whose fee is as much as the smallest piece it makes.
 */
export function planTidy(pieces: readonly TidyPiece[], room: TidyRoom): TidyPlan {
  const usable = pieces.filter(spendable)
  const keysetId = room.keysetId ?? tidyKeyset(usable)
  const mine = usable.filter((piece) => piece.keysetId === keysetId)
  const amounts = mine.map((piece) => piece.amount)
  const deficit = shapeDeficit(amounts)
  if (keysetId === undefined || deficit === 0)
    return { kind: "skip", reason: "at-target" }
  if (room.freeOpenings < 1) return { kind: "skip", reason: "openings" }
  if (room.freeSlots < 1) return { kind: "skip", reason: "slots" }
  const fits = Math.min(room.freeOpenings, room.freeSlots, CHANGE_MOST)
  const found = search(mine, fits, room.feePpk)
  if (!found || found.deficit >= deficit) {
    // Would a card with every opening and slot free do better? Then the room
    // is what stops it, and the screen says which.
    const roomy = search(mine, CHANGE_MOST, room.feePpk)
    if (roomy && roomy.deficit < (found?.deficit ?? deficit)) {
      return {
        kind: "skip",
        reason: room.freeSlots <= room.freeOpenings ? "slots" : "openings",
      }
    }
    return { kind: "skip", reason: "no-progress" }
  }
  if (found.fee > 0 && found.fee >= Math.min(...found.outputs)) {
    return { kind: "skip", reason: "fee" }
  }
  return {
    kind: "tidy",
    keysetId,
    inputs: found.inputs,
    outputs: found.outputs,
    fee: found.fee,
    complete: found.deficit === 0,
  }
}
