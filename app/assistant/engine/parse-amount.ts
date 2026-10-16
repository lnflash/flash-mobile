import { WalletCurrency } from "@app/graphql/generated"
import {
  DisplayAmount,
  MoneyAmount,
  toBtcMoneyAmount,
  toDisplayAmount,
  toUsdMoneyAmount,
  toWalletAmount,
} from "@app/types/amounts"

// The one place a model-emitted amount becomes a MoneyAmount
// (docs/ai-assistant-tool-registry.md §3, "Amounts"). Amounts arrive as
// decimal strings in display units, never as JSON numbers, and leave as an
// integer count of minor units: cents for USD and USDT, sats for BTC. The
// conversion is string arithmetic, so no float ever holds the amount and
// nothing is rounded: a string with more places than the currency has is
// refused.

/** Every amount string matches this: digits, then at most 8 decimal places. */
export const AMOUNT_PATTERN = "^[0-9]+(\\.[0-9]{1,8})?$"

const AMOUNT_RE = new RegExp(AMOUNT_PATTERN)

export const AMOUNT_CURRENCIES = ["BTC", "USD", "USDT"] as const

export type AmountCurrency = (typeof AMOUNT_CURRENCIES)[number]

/**
 * Places after the point in each currency's display unit. A BTC amount is in
 * bitcoin, so its 8 places are sats ("0.00021" is 21,000 sats); USD and USDT
 * amounts are in dollars, so their 2 places are cents.
 */
const DISPLAY_PLACES: Record<AmountCurrency, number> = {
  BTC: 8,
  USD: 2,
  USDT: 2,
}

export type AmountRefusal = "format" | "precision" | "range"

export type ParsedAmount =
  | { ok: true; amount: MoneyAmount<WalletCurrency> }
  | { ok: false; reason: AmountRefusal }

const toMoneyAmount = (
  minorUnits: number,
  currency: AmountCurrency,
): MoneyAmount<WalletCurrency> => {
  switch (currency) {
    case "BTC":
      return toBtcMoneyAmount(minorUnits)
    case "USD":
      return toUsdMoneyAmount(minorUnits)
    case "USDT":
      return toWalletAmount({ amount: minorUnits, currency: WalletCurrency.Usdt })
  }
}

/** A decimal amount string as a count of minor units with `places` places. */
const toMinorUnits = (
  value: unknown,
  places: number,
): { ok: true; minorUnits: number } | { ok: false; reason: AmountRefusal } => {
  if (typeof value !== "string" || !AMOUNT_RE.test(value)) {
    return { ok: false, reason: "format" }
  }
  const [whole, fraction = ""] = value.split(".")
  if (/[^0]/.test(fraction.slice(places))) {
    return { ok: false, reason: "precision" }
  }
  const minorUnits = BigInt(whole + fraction.slice(0, places).padEnd(places, "0"))
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: "range" }
  }
  return { ok: true, minorUnits: Number(minorUnits) }
}

/**
 * Parse a decimal amount string into minor units of `currency`.
 *
 * - "12.50" USD is 1250 cents; "0.00021" BTC is 21000 sats.
 * - Trailing zeros past the currency's places are exact and accepted
 *   ("12.500" USD is 1250 cents). Any other digit there would need rounding
 *   and is refused ("12.505" USD).
 * - Anything that is not a plain decimal string, a JSON number included, is
 *   refused, as is an amount too large to count in minor units exactly.
 */
export const parseAmount = (value: unknown, currency: AmountCurrency): ParsedAmount => {
  const parsed = toMinorUnits(value, DISPLAY_PLACES[currency])
  if (!parsed.ok) return parsed
  return { ok: true, amount: toMoneyAmount(parsed.minorUnits, currency) }
}

export type ParsedDisplayAmount =
  | { ok: true; amount: DisplayAmount }
  | { ok: false; reason: AmountRefusal }

/**
 * Parse a decimal amount string in the account's display currency (ENG-688,
 * the bare-amount rule: a number with no unit is the display currency).
 * `places` is that currency's fraction digits (useDisplayCurrency's
 * fractionDigits: 2 for JMD, 0 for a currency without minor units). The
 * same string arithmetic as parseAmount: nothing is rounded.
 */
export const parseDisplayAmount = (
  value: unknown,
  places: number,
  currencyCode: string,
): ParsedDisplayAmount => {
  if (!Number.isInteger(places) || places < 0 || places > 8) {
    return { ok: false, reason: "precision" }
  }
  const parsed = toMinorUnits(value, places)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    amount: toDisplayAmount({ amount: parsed.minorUnits, currencyCode }),
  }
}
