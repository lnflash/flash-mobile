/**
 * Why the top-up screen will not continue with an amount, in the order the
 * screen says it: over the mint's per-quote limit, more slots than the card
 * has free, more than the Cash wallet holds.
 *
 * Kept free of React Native so the rule is tested on its own, with the
 * development pay stub on and off (ENG-634).
 */
import { MAX_TOPUP_AMOUNT } from "./engine"

export type TopUpAmountProblem = "too-much" | "no-room" | "over-balance"

export type TopUpAmountCheck = {
  /** The amount, in the card's unit. */
  amount: number
  /** Slots the amount takes (`slotsNeeded`); 0 for no amount. */
  needed: number
  /** Slots the card will have for it: empty, plus reclaimable, less reserved. */
  freeSlots: number
  /** What the amount costs in the Cash wallet's currency; undefined when it cannot be priced. */
  cost: number | undefined
  /** The Cash wallet's balance; undefined or null when unknown. */
  balance: number | null | undefined
  /**
   * The development pay stub is on (`stubbedPayOutcome`): the payment is
   * skipped, so the Cash balance does not limit the amount. Always false in a
   * release build, where `stubbedPayOutcome` is always undefined.
   */
  payStubbed: boolean
}

export const topUpAmountProblem = ({
  amount,
  needed,
  freeSlots,
  cost,
  balance,
  payStubbed,
}: TopUpAmountCheck): TopUpAmountProblem | undefined => {
  if (amount > MAX_TOPUP_AMOUNT) return "too-much"
  if (needed > freeSlots) return "no-room"
  // An unknown balance is not a reason to refuse: the payment answers for it.
  if (
    !payStubbed &&
    amount > 0 &&
    cost !== undefined &&
    typeof balance === "number" &&
    cost > balance
  ) {
    return "over-balance"
  }
  return undefined
}
