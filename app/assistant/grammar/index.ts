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

/** A match, a refusal (an ask v1 does not serve), or undefined for a miss. */
export type GrammarVerdict = GrammarMatch | { kind: "refused" } | undefined

const REFUSED: GrammarVerdict = { kind: "refused" }

export const GRAMMAR_RULES: readonly GrammarRule[] = [
  ...PREPARE_SEND_RULES,
  ...PREPARE_RECEIVE_RULES,
  ...GET_TRANSACTIONS_RULES,
  ...GET_PRICE_RULES,
  ...GET_BALANCES_RULES,
]

/**
 * What the grammar makes of one utterance, its refusals kept apart from its
 * misses (ENG-690): `refused` is an ask v1 does not serve, and only these:
 * an invoice, an address or a link anywhere in it (namesPaymentRequest); a
 * question that opens with one of isQuestionAboutHow's fifteen openers
 * ("how do", "why", "where", "when", "is", "do" and the rest, words.ts);
 * or a rule's refusal, which today is the send rule's: a send it cannot
 * read as one contact's words and at most one amount (prepare-send.ts: a
 * follow-up or a time, a "from" it cannot read, two payments, a pronoun or
 * no payee, a word for what a payment is for). Undefined is words no rule
 * reads. Only a miss may go to a later tier (the on-device model): a
 * refusal is the v1 boundary (spec §7.2), which no tier reads past.
 */
export const readGrammar = (
  utterance: string,
  ctx: GrammarContext,
  rules: readonly GrammarRule[] = GRAMMAR_RULES,
): GrammarVerdict => {
  const tokens = stripFrame(normalize(utterance).tokens)
  if (tokens.length === 0) return undefined
  // An invoice or an address is a payee v1 does not take, and a question
  // ("how do I", "where can I") is about the app: neither is any rule's.
  if (namesPaymentRequest(tokens) || isQuestionAboutHow(tokens)) return REFUSED
  for (const rule of rules) {
    const result = rule.match({ tokens }, ctx)
    if (result !== undefined) return result.kind === "refuse" ? REFUSED : result
  }
  return undefined
}

/** What the grammar makes of one utterance, read on its own: a refusal is no match. */
export const matchGrammar = (
  utterance: string,
  ctx: GrammarContext,
  rules: readonly GrammarRule[] = GRAMMAR_RULES,
): GrammarMatch | undefined => {
  const verdict = readGrammar(utterance, ctx, rules)
  return verdict?.kind === "refused" ? undefined : verdict
}

export type { GrammarContext, GrammarMatch } from "./types"
