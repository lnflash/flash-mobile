import { readAmountPhrase, type AmountPhraseContext } from "../engine/amount-phrase"
import type { AmountCurrency } from "../engine/parse-amount"
import { normalize, textOf } from "../grammar/normalize"

export type QuickAction =
  | { kind: "cashout"; amount?: string; currency?: AmountCurrency }
  | { kind: "merchants"; query?: string }
  | { kind: "payment"; query?: string }
  | { kind: "cardTopUp"; amount?: string; currency?: AmountCurrency }
  | { kind: "contact"; operation: "add" | "remove" | "profile"; username: string }

// Capture what speech heard, including spaces; username lookup resolves it later.
const usernameHint = "([\\p{L}0-9_][\\p{L}0-9_. -]{0,79}?)"
const SELF_WORDS = new Set(["my", "your", "the", "his", "her", "their", "him", "them"])
const isNameHint = (hint: string) =>
  !SELF_WORDS.has(hint.toLowerCase()) && !/\b(?:and|then|also|or)\b/i.test(hint)
const cleanNameHint = (hint: string) => hint.toLowerCase().trim().replace(/\s+/g, " ")
const clean = (utterance: string) => textOf(normalize(utterance).tokens)

/** Reviewed, whole-utterance commands. No name, destination or amount is guessed. */
export const readQuickAction = (
  utterance: string,
  amountContext: AmountPhraseContext,
): QuickAction | undefined => {
  const text = clean(utterance)
  const raw = utterance
    .trim()
    .replace(/^(?:please )?(?:can|could|would) you (?:please )?/i, "")
  const contact = new RegExp(
    `^(?:please )?(add|save|remove|delete) @?${usernameHint} (to|from|of) (?:my |the )?contacts(?: again)?[?.!]*$`,
    "iu",
  ).exec(raw)
  if (
    contact &&
    isNameHint(contact[2]) &&
    (/^(add|save)$/i.test(contact[1])
      ? /^(to|of)$/i.test(contact[3])
      : /^from$/i.test(contact[3]))
  )
    return {
      kind: "contact",
      operation: /^(remove|delete)$/i.test(contact[1]) ? "remove" : "add",
      username: cleanNameHint(contact[2]),
    }
  // A dropped verb can still open an add-contact preview; saving requires a tap.
  const asContact = new RegExp(
    `^(?:please )?(?:(?:add|save) )?@?${usernameHint} as (?:a |my )?contact(?: again)?[?.!]*$`,
    "iu",
  ).exec(raw)
  if (
    asContact &&
    isNameHint(asContact[1]) &&
    !/\b(?:remove|delete|not|never|pay|send)\b/i.test(asContact[1])
  )
    return { kind: "contact", operation: "add", username: cleanNameHint(asContact[1]) }
  const profile = new RegExp(
    `^(?:(?:please )?show me|open|show) @?${usernameHint} profile(?: again)?[?.!]*$`,
    "iu",
  ).exec(raw)
  const possessive = new RegExp(
    `^(?:(?:please )?show me|open|show) @?${usernameHint}['’]s profile(?: again)?[?.!]*$`,
    "iu",
  ).exec(raw)
  const profileMatch = possessive ?? profile
  if (profileMatch && isNameHint(profileMatch[1]))
    return {
      kind: "contact",
      operation: "profile",
      username: cleanNameHint(profileMatch[1]),
    }

  const merchants =
    /^(?:where can i spend (?:flash|bitcoin|btc)|(?:show|find)(?: me)?(?: the)?(?: flash)? merchants?(?: (?:named|called) ([a-z0-9 _.-]+))?|find ([a-z0-9 _.-]+) on the flash map)$/.exec(
      text,
    )
  if (merchants) return { kind: "merchants", query: merchants[1] ?? merchants[2] }

  const payment =
    /^(?:show|find|open)(?: me)? my (?:last|latest) payment(?: to ([a-z0-9_. -]{1,80}))?$/.exec(
      text,
    )
  if (payment && (!payment[1] || isNameHint(payment[1])))
    return { kind: "payment", query: payment[1] }

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
