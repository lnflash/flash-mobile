/**
 * Shared rounding policy for all currency conversions across Flash.
 *
 * This module is **byte-identical** between `flash` (backend / price-server)
 * and `flash-mobile`. Do not edit one copy without syncing the other — see
 * `scripts/sync-money.sh` (or the lint/CI check that enforces this).
 *
 * Why this exists
 * ---------------
 * Money conversions in Flash are not value-free arithmetic. Every conversion
 * silently picks a rounding mode (round-half-up, ceiling, floor, …) and that
 * choice has accounting, UX, and trust implications. Before this module,
 * those choices lived in scattered `Math.round` / `Math.floor` / `Math.ceil`
 * calls across backend, price-server, and mobile — invisible to review.
 *
 * The rule is: **never round money with a bare `Math.round`.** Use
 * `roundForContext` and declare your intent. The `RoundingContext → mode`
 * mapping is a single, documented policy table that can be changed in one
 * place.
 *
 * Spec: ENG-318. Roadmap §2 / §4.1.
 */

/**
 * Rounding modes supported by `roundMinor`.
 *
 * - `half-to-even` — Banker's rounding. Ties go to the nearest even integer.
 *                    Removes the positive bias of half-up over large samples.
 *                    IFRS / GAAP friendly; the right default for accounting.
 * - `half-up`      — Ties go away from zero (`0.5 → 1`, `-0.5 → -1`).
 *                    Matches the user's mental model; use for UI display.
 * - `half-down`    — Ties go toward zero (`0.5 → 0`, `-0.5 → 0`).
 *                    Rare; included for completeness.
 * - `ceiling`      — Always toward `+∞`. Use when the house must never
 *                    under-charge itself (fees).
 * - `floor`        — Always toward `-∞`. Use when the house must never
 *                    over-pay (payouts; sub-minor-unit dust stays in treasury).
 */
export type RoundingMode =
  | "half-to-even"
  | "half-up"
  | "half-down"
  | "ceiling"
  | "floor"

/**
 * The four contexts in which money is rounded across Flash. Every call site
 * that handles money belongs to exactly one of these.
 *
 * The mapping from context to mode is defined by `CONTEXT_MODE` below and is
 * the *only* policy lever in this module. Changing one of those four lines
 * is reviewed as a single, focused PR.
 */
export type RoundingContext = "accounting" | "display" | "fee" | "payout"

/**
 * Initial policy table. Editing any line here is a policy change — please
 * include a rationale and a link to the discussion in the commit message.
 *
 * | Context     | Mode           | Rationale                                  |
 * | ----------- | -------------- | ------------------------------------------ |
 * | accounting  | half-to-even   | Removes statistical bias; IFRS/GAAP norm.  |
 * | display     | half-up        | Matches user expectation; no UI surprise.  |
 * | fee         | ceiling        | House never under-charges itself.          |
 * | payout      | floor          | House never over-pays; dust stays in tsy.  |
 */
const CONTEXT_MODE: Readonly<Record<RoundingContext, RoundingMode>> =
  Object.freeze({
    accounting: "half-to-even",
    display: "half-up",
    fee: "ceiling",
    payout: "floor",
  })

/**
 * Per-currency minor-unit scale (number of fraction digits in the minor unit
 * representation). For BTC the minor unit is the satoshi, which is itself
 * already an integer, so the scale is 0.
 *
 * Mirrors ISO 4217 fractionDigits for fiat. Sourced from the same currency
 * registry the rest of the app uses; keep in sync if currencies are added.
 */
const MINOR_UNIT_SCALE: Readonly<Record<string, number>> = Object.freeze({
  BTC: 0,
  SAT: 0,

  // ISO 4217 — 0-digit fiat
  JPY: 0,
  KRW: 0,
  CLP: 0,
  ISK: 0,
  HUF: 0,
  TWD: 0,
  VND: 0,

  // ISO 4217 — 2-digit fiat (the common case)
  USD: 2,
  EUR: 2,
  GBP: 2,
  JMD: 2,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  CNY: 2,
  HKD: 2,
  INR: 2,
  MXN: 2,
  BRL: 2,
  ZAR: 2,
  TTD: 2,
  XCD: 2,
  KYD: 2,
  BBD: 2,
  BSD: 2,
  BZD: 2,
  GYD: 2,
  HTG: 2,
  DOP: 2,
  CUP: 2,
  ARS: 2,
  COP: 2,
  PEN: 2,
  UYU: 2,
  VES: 2,
  NGN: 2,
  KES: 2,
  GHS: 2,
  EGP: 2,
  PHP: 2,
  THB: 2,
  IDR: 2,
  MYR: 2,
  SGD: 2,
  NZD: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  PLN: 2,
  CZK: 2,
  RON: 2,
  TRY: 2,

  // ISO 4217 — 3-digit fiat
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
})

/**
 * Default scale when a currency code is not in the table. Fiat is
 * overwhelmingly 2-digit, so 2 is the safe default; passing an unknown
 * currency through this function is logged as a warning by the caller's
 * money library, not here.
 */
const DEFAULT_MINOR_UNIT_SCALE = 2

// ---------------------------------------------------------------------------
// Internal arithmetic. All inputs are normalised to `bigint` * 10^GUARD so
// that intermediate ties (e.g. exactly 0.5) are exact even when the caller
// passes a `number`.
// ---------------------------------------------------------------------------

/**
 * Guard digits used internally so that ties expressed in IEEE-754 (e.g.
 * `0.1 + 0.2`) round consistently. 12 digits comfortably exceeds the ~15.95
 * decimal digits of double precision while keeping intermediates well below
 * `Number.MAX_SAFE_INTEGER` (2^53 ≈ 9.007e15) for any realistic minor-unit
 * value.
 */
const GUARD = 12n
const GUARD_SCALE = 10n ** GUARD

/**
 * Convert a `number | bigint` fractional-minor input into a scaled bigint.
 * `bigint` inputs are assumed to already be in integer minor units (no scale
 * applied) and are returned scaled by `GUARD_SCALE`.
 */
const toScaled = (input: number | bigint): bigint => {
  if (typeof input === "bigint") {
    return input * GUARD_SCALE
  }
  if (!Number.isFinite(input)) {
    throw new RangeError(
      `roundMinor: input must be a finite number, got ${String(input)}`,
    )
  }
  // Format with fixed precision to convert `number` → exact decimal string,
  // then strip the decimal point to get a bigint with `GUARD` fraction digits.
  // This sidesteps `BigInt(Math.round(...))` which would re-introduce the
  // very float drift this module is meant to remove.
  const fixed = input.toFixed(Number(GUARD))
  const negative = fixed.startsWith("-")
  const body = negative ? fixed.slice(1) : fixed
  const [intPart, fracPart = ""] = body.split(".")
  const padded = (fracPart + "0".repeat(Number(GUARD))).slice(0, Number(GUARD))
  const magnitude = BigInt(intPart + padded)
  return negative ? -magnitude : magnitude
}

/**
 * Apply a rounding mode to a scaled bigint, returning integer minor units.
 *
 * The `scaled` value represents `quotient.fraction` where `fraction` has
 * `GUARD` digits. We separate quotient and fractional remainder, then
 * dispatch on the mode.
 */
const applyMode = (scaled: bigint, mode: RoundingMode): bigint => {
  const sign = scaled < 0n ? -1n : 1n
  const abs = sign === -1n ? -scaled : scaled
  const quotient = abs / GUARD_SCALE
  const remainder = abs % GUARD_SCALE
  if (remainder === 0n) {
    return sign * quotient
  }

  // Compare 2 * remainder against GUARD_SCALE to detect ties without doing
  // any floating-point arithmetic.
  const twiceRemainder = remainder * 2n
  const isTie = twiceRemainder === GUARD_SCALE
  const isAboveHalf = twiceRemainder > GUARD_SCALE

  let rounded: bigint
  switch (mode) {
    case "ceiling":
      rounded = sign === 1n ? quotient + 1n : quotient
      return sign * rounded
    case "floor":
      rounded = sign === 1n ? quotient : quotient + 1n
      return sign * rounded
    case "half-up":
      // Half away from zero.
      rounded = isAboveHalf || isTie ? quotient + 1n : quotient
      return sign * rounded
    case "half-down":
      // Half toward zero.
      rounded = isAboveHalf ? quotient + 1n : quotient
      return sign * rounded
    case "half-to-even":
      if (isTie) {
        // If the integer part is already even, stay; otherwise bump up.
        rounded = quotient % 2n === 0n ? quotient : quotient + 1n
      } else {
        rounded = isAboveHalf ? quotient + 1n : quotient
      }
      return sign * rounded
    default: {
      // Exhaustiveness check — fails the build if RoundingMode is extended
      // without updating this switch.
      const _exhaustive: never = mode
      throw new Error(`roundMinor: unhandled mode ${String(_exhaustive)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Round a high-precision amount expressed in fractional minor units to an
 * integer number of minor units, using the given mode.
 *
 * @param fractionalMinor  Amount in minor units. `1.5` USD-cents means
 *                         "one and a half cents". `bigint` inputs are
 *                         assumed already integer.
 * @param mode             The rounding mode to apply.
 * @returns                The rounded amount as a `bigint` (always exact).
 *
 * @example
 *   roundMinor(1.5, "half-to-even")   // 2n
 *   roundMinor(2.5, "half-to-even")   // 2n  (ties to even)
 *   roundMinor(1.5, "half-up")        // 2n
 *   roundMinor(-1.5, "half-up")       // -2n (away from zero)
 *   roundMinor(1.4, "ceiling")        // 2n
 *   roundMinor(1.9, "floor")          // 1n
 */
export function roundMinor(
  fractionalMinor: number | bigint,
  mode: RoundingMode,
): bigint {
  const scaled = toScaled(fractionalMinor)
  return applyMode(scaled, mode)
}

/**
 * Round a high-precision amount using the policy associated with the given
 * context. This is the function call sites should use 99% of the time —
 * passing a raw mode is a stronger statement that should be questioned in
 * review.
 */
export function roundForContext(
  fractionalMinor: number | bigint,
  context: RoundingContext,
): bigint {
  const mode = CONTEXT_MODE[context]
  return roundMinor(fractionalMinor, mode)
}

/**
 * Look up the number of minor-unit fraction digits for a currency code.
 * Returns the default (2) for unknown currencies; callers that want strict
 * behaviour should check membership before calling.
 *
 * @example
 *   minorUnitScale("USD")   // 2
 *   minorUnitScale("BTC")   // 0
 *   minorUnitScale("BHD")   // 3
 *   minorUnitScale("XXX")   // 2  (default)
 */
export function minorUnitScale(currencyCode: string): number {
  const upper = currencyCode.toUpperCase()
  return MINOR_UNIT_SCALE[upper] ?? DEFAULT_MINOR_UNIT_SCALE
}

/**
 * Read-only view of the policy table. Exposed for tests and for the
 * developer doc; do not consume this in production code (use
 * `roundForContext` instead).
 */
export const __policyForContext = (context: RoundingContext): RoundingMode =>
  CONTEXT_MODE[context]
