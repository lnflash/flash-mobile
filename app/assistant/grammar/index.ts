import { GET_BALANCES_RULES } from "./get-balances"
import { GET_PRICE_RULES } from "./get-price"
import { GET_TRANSACTIONS_RULES } from "./get-transactions"
import { normalize } from "./normalize"
import { PREPARE_RECEIVE_RULES } from "./prepare-receive"
import { PREPARE_SEND_RULES } from "./prepare-send"
import type { GrammarContext, GrammarMatch, GrammarRule } from "./types"
import { isQuestionAboutHow, namesPaymentRequest, stripFrame } from "./words"

// The grammar tier's entry (docs/ai-assistant-tool-registry.md §7, §7.2):
// the first reader of every utterance, on every device, and for most users
// the only one (§7.1). It emits a ToolCall for runTool, a question about an
// amount, or nothing ("I can't help with that yet"), and never guesses.
//
// The most specific rules come first: an ask that names a payment is a
// send's, one that names a request is a receive's, then a list, a price, and
// last a balance. Adding a sixth intent is one new file of rules and one line
// here, as the registry grows (spec §7.2).

export const GRAMMAR_RULES: readonly GrammarRule[] = [
  ...PREPARE_SEND_RULES,
  ...PREPARE_RECEIVE_RULES,
  ...GET_TRANSACTIONS_RULES,
  ...GET_PRICE_RULES,
  ...GET_BALANCES_RULES,
]

/** What the grammar makes of one utterance, read on its own. */
export const matchGrammar = (
  utterance: string,
  ctx: GrammarContext,
  rules: readonly GrammarRule[] = GRAMMAR_RULES,
): GrammarMatch | undefined => {
  const tokens = stripFrame(normalize(utterance).tokens)
  if (tokens.length === 0) return undefined
  // An invoice or an address is a payee v1 does not take, and a "how do I"
  // is a question about the app: neither is any rule's.
  if (namesPaymentRequest(tokens) || isQuestionAboutHow(tokens)) return undefined
  for (const rule of rules) {
    const result = rule.match({ tokens }, ctx)
    if (result !== undefined) return result.kind === "refuse" ? undefined : result
  }
  return undefined
}

export type { GrammarContext, GrammarMatch } from "./types"
