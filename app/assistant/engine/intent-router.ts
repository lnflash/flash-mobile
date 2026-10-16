import type { AmountFields, Registry, RegisteredTool } from "../registry/define"
import { AssistantReplyKey, Intent, isIntent } from "../registry/types"
import { AmountCurrency, parseAmount } from "./parse-amount"
import { isPlainObject } from "./schema-validator"

// The gate between whatever emitted a tool call (the grammar tier, a model)
// and the tools (docs/ai-assistant-tool-registry.md §3, §8). It trusts
// nothing: the call must be a known intent with a registered tool and
// arguments its schema accepts, and amounts become MoneyAmounts here, once.

/** What the engine emits: `{ intent, args }` and nothing else. */
export type ToolCall = { intent: string; args?: Record<string, unknown> }

export type RouteResult =
  | { ok: true; intent: Intent; tool: RegisteredTool; args: Record<string, unknown> }
  | { ok: false; intent: Intent | "unknown"; replyKey: AssistantReplyKey }

const refuse = (
  intent: Intent | "unknown",
  replyKey: AssistantReplyKey,
): RouteResult => ({ ok: false, intent, replyKey })

/** The args with each amount field parsed, or undefined if one does not parse. */
const parseAmountFields = (
  args: Record<string, unknown>,
  amounts: AmountFields,
): Record<string, unknown> | undefined => {
  const parsed = { ...args }
  const fields = Object.keys(amounts).filter((field) => args[field] !== undefined)
  for (const field of fields) {
    // The schema already holds the currency field to the amount currencies.
    const currency = args[amounts[field]] as AmountCurrency | undefined
    if (currency === undefined) return undefined
    const amount = parseAmount(args[field], currency)
    if (!amount.ok) return undefined
    parsed[field] = amount.amount
  }
  return parsed
}

/**
 * Route a raw tool call.
 *
 * - Not a known intent: `unknownIntent`.
 * - A known intent with no tool registered: `notYetAvailable`, distinct
 *   from unknown.
 * - Arguments the tool's schema refuses, or an amount that does not parse:
 *   `invalidArguments`.
 */
export const routeIntent = (raw: unknown, registry: Registry): RouteResult => {
  if (!isPlainObject(raw) || !isIntent(raw.intent)) {
    return refuse("unknown", "Assistant.unknownIntent")
  }
  const { intent } = raw
  const tool = registry.get(intent)
  if (!tool) return refuse(intent, "Assistant.notYetAvailable")

  const envelopeIsClosed = Object.keys(raw).every(
    (key) => key === "intent" || key === "args",
  )
  const args = raw.args === undefined ? {} : raw.args
  if (!envelopeIsClosed || !isPlainObject(args) || !tool.validate(args).valid) {
    return refuse(intent, "Assistant.invalidArguments")
  }

  const parsed = parseAmountFields(args, tool.amounts)
  if (!parsed) return refuse(intent, "Assistant.invalidArguments")
  return { ok: true, intent, tool, args: parsed }
}
