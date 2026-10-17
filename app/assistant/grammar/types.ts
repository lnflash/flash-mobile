import type { AmountPhrase, AmountPhraseContext } from "../engine/amount-phrase"
import type { ToolCall } from "../engine/intent-router"
import type { Intent } from "../registry/types"
import type { Utterance } from "./normalize"

// The offline grammar tier (docs/ai-assistant-tool-registry.md §7, §7.2): a
// deterministic reading of what the user typed, for the five shipped
// intents, on every device. It emits the same ToolCall a model would, and
// that call goes through runTool unchanged: the router still validates it,
// and nothing the grammar reads is trusted further than any model's output.

/** What the grammar knows about the account: how it reads a bare amount and a "$". */
export type GrammarContext = AmountPhraseContext

/** Why an amount is a question: readAmountPhrase's reasons, or no amount at all. */
export type AmountClarifyReason =
  | Extract<AmountPhrase, { kind: "clarify" }>["reason"]
  | "missing"

/**
 * What the grammar makes of an utterance:
 *
 * - call: a tool call, for runTool;
 * - clarifyAmount: an ask whose amount is a question (a k or m suffix,
 *   mixed units, a "$" on a J$ account, a number in words past ninety-nine,
 *   no amount). It is answered with a templated question and never becomes
 *   a call: the grammar never picks an amount or a currency itself (spec
 *   §5.1).
 *
 * No match at all is undefined: "I can't help with that yet".
 */
export type GrammarMatch =
  | { kind: "call"; call: ToolCall }
  | { kind: "clarifyAmount"; reason: AmountClarifyReason }

/**
 * What one rule says:
 *
 * - a match;
 * - refuse: the utterance is this rule's intent, in a form v1 does not
 *   serve (a pronoun or a follow-up for a payee, two payees, a time). The
 *   search ends with no match, so a later rule cannot read it as something
 *   else;
 * - undefined: not this rule's; the next rule looks.
 */
export type RuleResult = GrammarMatch | { kind: "refuse" } | undefined

/** One way of saying one intent. Rules are tried in GRAMMAR_RULES order. */
export type GrammarRule = {
  /** A name for the snapshots: the intent, then the shape ("prepareSend.verbFirst"). */
  name: string
  intent: Intent
  match: (utterance: Utterance, ctx: GrammarContext) => RuleResult
}
