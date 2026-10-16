import type { WalletCurrency } from "@app/graphql/generated"
import type { MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"
import {
  AmountCurrency,
  parseAmount,
  parseDisplayAmount,
} from "../../../engine/parse-amount"
import type { ActionToolCtx } from "../../types"
import { ToolReplyError } from "./errors"

/** The amount fields an action tool's input takes. */
export type AmountArgs = { amount?: string; currency?: AmountCurrency }

/**
 * The amount a call asks for, in the unit it names (spec v0.2.5 §5.1, the
 * bare-amount rule): a wallet currency when the call names one, the
 * account's display currency when it names none. A display currency of USD
 * is the USD wallet currency itself, with no rate between them. Undefined
 * when the call has no amount.
 *
 * The router checked the string's shape; this reads it, once, with the
 * engine's own parsers, because only a tool knows the display currency and
 * its places (a router-parsed amount needs its currency in the call).
 */
export const requestedAmount = (
  { amount, currency }: AmountArgs,
  ctx: Pick<ActionToolCtx, "displayCurrency" | "display">,
): MoneyAmount<WalletOrDisplayCurrency> | undefined => {
  if (amount === undefined) {
    // A unit with no number is not an amount.
    if (currency !== undefined) throw new ToolReplyError("Assistant.invalidArguments")
    return undefined
  }
  let parsed
  if (currency !== undefined) parsed = parseAmount(amount, currency)
  else if (ctx.displayCurrency === "USD") parsed = parseAmount(amount, "USD")
  else
    parsed = parseDisplayAmount(amount, ctx.display.fractionDigits, ctx.displayCurrency)
  if (!parsed.ok) throw new ToolReplyError("Assistant.invalidArguments")
  if (parsed.amount.amount <= 0) throw new ToolReplyError("Assistant.amountTooSmall")
  return parsed.amount
}

const isCash = (currency: WalletOrDisplayCurrency): boolean =>
  currency === "USD" || currency === "USDT"

/**
 * Whether the amount a payment settles moves with the exchange rate, which
 * then caps its card at RATE_TTL_MS from the price read (spec §5,
 * "Expiry"). USD and USDT are one to one.
 */
export const isRateDependent = (
  unitOfAccount: MoneyAmount<WalletOrDisplayCurrency>,
  settlementCurrency: WalletCurrency,
): boolean =>
  unitOfAccount.currency !== settlementCurrency &&
  !(isCash(unitOfAccount.currency) && isCash(settlementCurrency))
