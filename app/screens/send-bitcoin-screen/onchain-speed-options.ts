// Which onchain speeds the Bitcoin Account can afford, for the speed picker on
// the send details screen.
//
// Like max-send-amount.ts, this module is intentionally free of react-native /
// SDK imports so the logic is unit-testable under plain jest. All amounts are
// whole sats except the Cash Account check, which is in cents.

import type { OnchainFeeSpeed } from "@app/utils/breez-sdk/fee-extraction"

export type OnchainSpeed = OnchainFeeSpeed

/** Fastest first: the order the picker shows them, and the fallback order. */
export const ONCHAIN_SPEEDS: readonly OnchainSpeed[] = ["fast", "medium", "slow"]

/** Smallest onchain send in sats, from either account: the server's floor. */
export const ONCHAIN_MIN_SEND_SATS = 5500

/** How long the amount has to stay still before the screen asks for a quote. */
export const ONCHAIN_QUOTE_DEBOUNCE_MS = 400

/** Total fee of each speed, in sats. */
export type OnchainSpeedFees = Record<OnchainSpeed, number>

export type OnchainSpeedOption = {
  feeSats: number
  /** amount + fee is within the balance. */
  fits: boolean
}

export type OnchainSpeedPlan = {
  options: Record<OnchainSpeed, OnchainSpeedOption>
  /** The speed to pre-select when none is selected yet. */
  defaultSpeed?: OnchainSpeed
  /** The fastest speed that fits, when one does. */
  fastestFittingSpeed?: OnchainSpeed
  /** True when no speed fits. */
  noSpeedFits: boolean
  cheapestFeeSats: number
  /** The largest amount that still fits at the cheapest fee, never below 0. */
  maxSendSats: number
  /** maxSendSats is a sendable amount: above zero and at least the minimum. */
  canSendMax: boolean
  /** How far amount + cheapest fee is over the balance, 0 when it fits. */
  shortfallSats: number
}

export type PlanOnchainSpeedsArgs = {
  fees: OnchainSpeedFees
  amountSats: number
  balanceSats: number
  /** The smallest amount the send flow accepts, so Send max never offers less. */
  minSendSats?: number
}

export const planOnchainSpeeds = ({
  fees,
  amountSats,
  balanceSats,
  minSendSats = 0,
}: PlanOnchainSpeedsArgs): OnchainSpeedPlan => {
  const optionFor = (speed: OnchainSpeed): OnchainSpeedOption => ({
    feeSats: fees[speed],
    fits: amountSats + fees[speed] <= balanceSats,
  })
  const options = {
    fast: optionFor("fast"),
    medium: optionFor("medium"),
    slow: optionFor("slow"),
  }

  const fastestFittingSpeed = ONCHAIN_SPEEDS.find((speed) => options[speed].fits)
  const defaultSpeed = options.medium.fits ? "medium" : fastestFittingSpeed

  const cheapestFeeSats = Math.min(fees.fast, fees.medium, fees.slow)
  const maxSendSats = Math.max(0, Math.floor(balanceSats - cheapestFeeSats))

  return {
    options,
    defaultSpeed,
    fastestFittingSpeed,
    noSpeedFits: fastestFittingSpeed === undefined,
    cheapestFeeSats,
    maxSendSats,
    canSendMax: maxSendSats > 0 && maxSendSats >= minSendSats,
    shortfallSats: Math.max(0, amountSats + cheapestFeeSats - balanceSats),
  }
}

/**
 * The speed the picker should hold under this plan. A selection that still
 * fits is kept. No selection gets the default (Medium when it fits). A
 * selection that stopped fitting moves to the fastest speed that fits. When
 * none fits, nothing is selected, so Next stays disabled.
 */
export const resolveSelectedSpeed = (
  plan: OnchainSpeedPlan,
  current?: OnchainSpeed,
): OnchainSpeed | undefined => {
  if (current === undefined) return plan.defaultSpeed
  if (plan.options[current].fits) return current
  return plan.fastestFittingSpeed
}

export type CashAccountCanPayArgs = {
  /** The send amount in sats, as the Bitcoin Account would send it. */
  amountSats: number
  /** The same amount converted to cents, or NaN when it cannot be priced. */
  amountCents: number
  /** Cash Account balance in cents, undefined when there is no Cash wallet. */
  balanceCents?: number
  /** The request fixes its sats: the Cash Account sends those exact sats. */
  hasFixedSats: boolean
  /**
   * The Cash Account's on-chain floor in cents for an amount the user typed
   * (cashOnchainMinimumCents), or NaN when it cannot be priced.
   */
  minimumCents: number
}

/**
 * Whether offering "Pay from Cash Account" leads somewhere: the Cash Account
 * exists, its balance covers the amount, and the amount clears the floor the
 * Cash screen holds it to (isValidAmount). A request that fixes its sats is
 * held to the server's 5,500 sats; an amount the user typed, to what those
 * sats are worth in cents, rounded up.
 */
export const cashAccountCanPay = ({
  amountSats,
  amountCents,
  balanceCents,
  hasFixedSats,
  minimumCents,
}: CashAccountCanPayArgs): boolean =>
  balanceCents !== undefined &&
  Number.isFinite(amountCents) &&
  (hasFixedSats ? amountSats >= ONCHAIN_MIN_SEND_SATS : amountCents >= minimumCents) &&
  amountCents <= balanceCents
