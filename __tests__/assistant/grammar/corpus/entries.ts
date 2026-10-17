// What a phrasing corpus holds (docs/ai-assistant-tool-registry.md §7.2, §9):
// one utterance as a user types it, the dialect it is in, the display
// currency of the account typing it, and what the grammar tier should make
// of it. Not a spec itself.
import type { ToolCall } from "@app/assistant/engine/intent-router"

export type Dialect = "en" | "jm"

export type DisplayCurrency = "USD" | "JMD"

/**
 * - a call: the grammar must emit exactly this call, intent and arguments;
 * - "miss": no call at all ("I can't help with that yet"), as for anything
 *   outside the five shipped intents, a payee v1 does not take (an invoice,
 *   an address, a pronoun) or a follow-up;
 * - "clarifyAmount": the amount is a question, never a guess (a k or m
 *   suffix, a "$" on a J$ account, words for a number, no amount at all).
 */
export type Expected = ToolCall | "miss" | "clarifyAmount"

export type CorpusEntry = {
  utterance: string
  dialect: Dialect
  displayCurrency: DisplayCurrency
  expected: Expected
}

/** The symbol each display currency shows, as useDisplayCurrency's fiatSymbol gives it. */
export const DISPLAY_SYMBOL: Record<DisplayCurrency, string> = {
  USD: "$",
  JMD: "J$",
}

export const entry = (
  { dialect, displayCurrency }: { dialect: Dialect; displayCurrency: DisplayCurrency },
  utterance: string,
  expected: Expected,
): CorpusEntry => ({ utterance, dialect, displayCurrency, expected })

// The calls, as the grammar emits them: every call carries `args`.

export const balances = (): ToolCall => ({ intent: "getBalances", args: {} })

export const transactions = (
  args: { first?: number; direction?: "SEND" | "RECEIVE"; query?: string } = {},
): ToolCall => ({ intent: "getTransactions", args })

export const price = (args: { currency?: string } = {}): ToolCall => ({
  intent: "getPrice",
  args,
})

export const send = (
  payee: string,
  amount: string,
  extra: { currency?: "BTC" | "USD" | "USDT"; memo?: string; sourceWallet?: "BTC" } = {},
): ToolCall => ({ intent: "prepareSend", args: { payee, amount, ...extra } })

export const receive = (
  args: {
    amount?: string
    currency?: "BTC" | "USD" | "USDT"
    wallet?: "BTC"
    method?: "onchain"
  } = {},
): ToolCall => ({ intent: "prepareReceive", args })

/** The intent an entry is about, for the per-intent snapshots; undefined for a miss or a question. */
export const intentOf = (expected: Expected): string | undefined =>
  typeof expected === "string" ? undefined : expected.intent
