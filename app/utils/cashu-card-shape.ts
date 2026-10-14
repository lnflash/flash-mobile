/**
 * The shape of the value on a Cashu card (ENG-700): which denominations its
 * pieces come in.
 *
 * Offline, a till takes whole pieces off a card and gives no change, so a
 * card pays a bill exactly only when some of its pieces add up to it. The
 * fewest powers of two (`splitPow2`) make a 60-sat card 32+16+8+4, which pays
 * exactly only multiples of 4. A card shaped as a covering ladder pays every
 * amount from 1 to its balance: sorted ascending, each piece is at most one
 * more than the sum of the pieces below it.
 *
 * The canonical shape (`targetPieces`) is the same in flash-mobile (ENG-700),
 * flash-pos (ENG-701) and the card reshape (ENG-702). The vectors in
 * `__tests__/fixtures/card-shape-vectors.json` are generated from it, and
 * flash-pos asserts the same file: a till and a wallet that disagreed on the
 * shape would break exact offline payment without any error.
 *
 * Pure: no card, no mint, no clock.
 */
import { MAX_SLOTS } from "./cashu-card"
import { splitPow2 } from "./cashu-card-outputs"

/**
 * The spares a shaped card carries beside its ladder, added in this order
 * while each still fits, and stopping at the first that does not.
 *
 * Till bills are mostly small. The ladder's low pieces pay the first small
 * bill; a second piece at each step below 16 keeps the next small bill exact
 * too, without a trip to the mint. Bigger spares cost slots (128 on a card)
 * and load taps (one LOAD_PROOF each) and are rarely needed offline.
 */
export const SPARE_PIECES = [1, 2, 4, 8] as const

const sum = (pieces: readonly number[]): number => pieces.reduce((a, b) => a + b, 0)

const ascending = (pieces: readonly number[]): number[] =>
  [...pieces].sort((a, b) => a - b)

/**
 * The largest R such that every amount from 1 to R is the sum of some of
 * `pieces`, by the greedy covering test: sorted ascending, the reach grows by
 * each piece that is at most one more than the reach so far, and stops at the
 * first that is not.
 */
export function exactReach(pieces: readonly number[]): number {
  let reach = 0
  for (const piece of ascending(pieces)) {
    if (piece > reach + 1) break
    reach += piece
  }
  return reach
}

/** Every amount from 1 to the pieces' sum pays exactly with some of them. */
export const coversEveryAmount = (pieces: readonly number[]): boolean =>
  exactReach(pieces) === sum(pieces)

/**
 * One candidate shape: the ladder 1..2^k (none for k = −1), up to
 * `spareCount` of `SPARE_PIECES` (each at most 2^k and what is left, stopping
 * at the first that is not), and the fewest powers of two for the rest.
 */
const candidate = (balance: number, k: number, spareCount: number): number[] => {
  const pieces: number[] = []
  const top = k < 0 ? 0 : 2 ** k
  for (let piece = 1; piece <= top; piece *= 2) pieces.push(piece)
  let left = balance - sum(pieces)
  for (const spare of SPARE_PIECES.slice(0, spareCount)) {
    if (spare > left || spare > top) break
    pieces.push(spare)
    left -= spare
  }
  if (left > 0) pieces.push(...splitPow2(left))
  return ascending(pieces)
}

/**
 * The canonical shape of a card holding `balance`, in at most `slotsFree`
 * pieces, sorted ascending.
 *
 * With the room for it: the largest ladder 1, 2, 4, …, 2^k the balance can
 * hold, then the spares (`SPARE_PIECES`), then the rest as the fewest powers
 * of two. The rest is under 2^(k+1), so every piece of it is at most 2^k and
 * the whole shape covers every amount (`coversEveryAmount`).
 *
 * Short of slots it degrades, keeping what pays the most amounts longest: the
 * remainder coarsens, then the spares go (last first), then the top of the
 * ladder, never below the fewest-pieces split (`splitPow2`). Throws
 * `RangeError` for a balance that is not a positive safe integer, or room for
 * fewer pieces than that split.
 */
export function targetPieces(balance: number, slotsFree: number = MAX_SLOTS): number[] {
  if (!Number.isSafeInteger(balance) || balance < 1) {
    throw new RangeError(
      `targetPieces: balance must be a positive integer, got ${balance}`,
    )
  }
  const fewest = splitPow2(balance).length
  if (!Number.isSafeInteger(slotsFree) || slotsFree < fewest) {
    throw new RangeError(
      `targetPieces: ${balance} takes at least ${fewest} pieces, ${slotsFree} free`,
    )
  }
  // The largest k with 2^(k+1) − 1 <= balance.
  let kMax = 0
  while (2 ** (kMax + 2) - 1 <= balance) kMax += 1
  for (let k = kMax; k >= -1; k -= 1) {
    for (let spareCount = SPARE_PIECES.length; spareCount >= 0; spareCount -= 1) {
      const pieces = candidate(balance, k, spareCount)
      if (pieces.length <= slotsFree) return pieces
    }
  }
  // Unreachable: k = −1 with no spares is splitPow2(balance), which fits.
  throw new RangeError(`targetPieces: no shape of ${balance} in ${slotsFree} slots`)
}

/** `whole` less one of each of `taken`, as a multiset. */
const without = (whole: readonly number[], taken: readonly number[]): number[] => {
  const left = new Map<number, number>()
  taken.forEach((piece) => left.set(piece, (left.get(piece) ?? 0) + 1))
  return whole.filter((piece) => {
    const count = left.get(piece) ?? 0
    if (count === 0) return true
    left.set(piece, count - 1)
    return false
  })
}

/**
 * The gap-filling candidate: the pieces of the whole card's target shape the
 * card lacks, smallest first while each fits what is left of the amount and
 * the slots, and the fewest powers of two for the rest. Undefined when that
 * does not fit the slots, or the card's pieces admit no target at all.
 */
const complement = (
  amount: number,
  existing: readonly number[],
  slotsFree: number,
): number[] | undefined => {
  let target: number[]
  try {
    target = targetPieces(sum(existing) + amount, existing.length + slotsFree)
  } catch {
    return undefined
  }
  const pieces: number[] = []
  let left = amount
  for (const piece of ascending(without(target, existing))) {
    if (piece > left || pieces.length >= slotsFree) break
    pieces.push(piece)
    left -= piece
  }
  if (left > 0) pieces.push(...splitPow2(left))
  return pieces.length <= slotsFree ? ascending(pieces) : undefined
}

/**
 * The denominations a top-up of `amount` mints, into at most `slotsFree`
 * slots, sorted ascending. `existing` is what the card already holds or is
 * owed: its unspent pieces as last read and its unfinished top-ups' outputs.
 *
 * A top-up never swaps the card's pieces (that is ENG-702), so it shapes the
 * card by the pieces it adds. Two candidates: the amount shaped on its own
 * (`targetPieces`), and the gaps of the whole card's target shape filled. The
 * one that leaves the whole card paying more amounts exactly wins, the fewer
 * pieces on a tie, so filling gaps never does worse than shaping alone. With
 * no `existing` (the card's pieces were not read) the amount is shaped alone.
 *
 * Whatever the shape, the pieces sum to exactly `amount` and fit the slots:
 * checked here, and thrown on, because the mint is paid for `amount`.
 */
export function topUpPieces(
  amount: number,
  existing: readonly number[] | undefined,
  slotsFree: number,
): number[] {
  const independent = targetPieces(amount, slotsFree)
  let pieces = independent
  if (existing && existing.length > 0) {
    const filled = complement(amount, existing, slotsFree)
    if (filled) {
      const reachFilled = exactReach([...existing, ...filled])
      const reachAlone = exactReach([...existing, ...independent])
      if (
        reachFilled > reachAlone ||
        (reachFilled === reachAlone && filled.length < independent.length)
      ) {
        pieces = filled
      }
    }
  }
  if (sum(pieces) !== amount || pieces.length > slotsFree) {
    throw new Error(
      `topUpPieces: ${pieces.length} pieces summing to ${sum(
        pieces,
      )}, not ${amount} in ${slotsFree} slots`,
    )
  }
  return pieces
}
