import { readAmountPhrase, type AmountPhraseContext } from "../engine/amount-phrase"
import type { AmountCurrency } from "../engine/parse-amount"
import { normalize, textOf } from "../grammar/normalize"

export type QuickAction =
  | { kind: "cashout"; amount?: string; currency?: AmountCurrency }
  | { kind: "merchants"; query?: string }
  | { kind: "payment"; query?: string }
  | { kind: "cardTopUp"; amount?: string; currency?: AmountCurrency }
  | { kind: "contact"; operation: "add" | "remove" | "profile"; username: string }

const username = "([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,62})"
const SELF_WORDS = new Set(["my", "your", "the", "his", "her", "their"])
const clean = (utterance: string) => textOf(normalize(utterance).tokens)

/** Reviewed, whole-utterance commands. No name, destination or amount is guessed. */
export const readQuickAction = (
  utterance: string,
  amountContext: AmountPhraseContext,
): QuickAction | undefined => {
  const text = clean(utterance)
  const raw = utterance.trim()
  const contact = new RegExp(
    `^(?:please )?(add|remove) @?${username} (?:to|from) my contacts[?.!]*$`,
    "i",
  ).exec(raw)
  if (contact && !SELF_WORDS.has(contact[2].toLowerCase()))
    return {
      kind: "contact",
      operation: contact[1].toLowerCase() as "add" | "remove",
      username: contact[2].toLowerCase(),
    }
  const profile = new RegExp(
    `^(?:(?:please )?show me|open|show) @?${username} profile[?.!]*$`,
    "i",
  ).exec(raw)
  const possessive = new RegExp(
    `^(?:(?:please )?show me|open|show) @?${username}['’]s profile[?.!]*$`,
    "i",
  ).exec(raw)
  const profileMatch = possessive ?? profile
  if (profileMatch && !SELF_WORDS.has(profileMatch[1].toLowerCase()))
    return {
      kind: "contact",
      operation: "profile",
      username: profileMatch[1].toLowerCase(),
    }

  const merchants =
    /^(?:where can i spend (?:flash|bitcoin|btc)|(?:show|find)(?: me)?(?: the)?(?: flash)? merchants?(?: (?:named|called) ([a-z0-9 _.-]+))?|find ([a-z0-9 _.-]+) on the flash map)$/.exec(
      text,
    )
  if (merchants) return { kind: "merchants", query: merchants[1] ?? merchants[2] }

  const payment =
    /^(?:show|find|open)(?: me)? my (?:last|latest) payment(?: to ([a-z0-9_.-]+))?$/.exec(
      text,
    )
  if (payment) return { kind: "payment", query: payment[1] }

  const cashout =
    /^(?:please )?(?:cash out|cashout|withdraw|settle)(?: (.+?))?(?: (?:to|into) (?:my |a |the )?(?:bank|bank account|account))?$/.exec(
      text,
    )
  if (cashout) {
    const phrase = cashout[1]
    if (!phrase || /^(?:my )?(?:money|funds|balance)$/.test(phrase))
      return { kind: "cashout" }
    const amount = readAmountPhrase(phrase, amountContext)
    return amount.kind === "amount"
      ? { kind: "cashout", amount: amount.amount, currency: amount.currency }
      : undefined
  }

  const topUp =
    /^(?:please )?(?:top up|add|load) (.+?) (?:to|onto|on|into) (?:my |the )?(?:flashcard|flash card|card)$/.exec(
      text,
    )
  const topUpCardFirst =
    /^(?:please )?(?:top up|load) (?:my |the )?(?:flashcard|flash card|card) (?:with|by) (.+)$/.exec(
      text,
    )
  const topUpAmount = topUp?.[1] ?? topUpCardFirst?.[1]
  if (topUpAmount) {
    const amount = readAmountPhrase(topUpAmount, amountContext)
    return amount.kind === "amount"
      ? { kind: "cardTopUp", amount: amount.amount, currency: amount.currency }
      : undefined
  }
  if (/^(?:top up|load) (?:my |the )?(?:flashcard|flash card|card)$/.test(text))
    return { kind: "cardTopUp" }
  return undefined
}
