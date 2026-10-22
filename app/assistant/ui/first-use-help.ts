import type { ToolCall } from "../engine/intent-router"
import { normalize, textOf } from "../grammar/normalize"
import { namesPaymentRequest, stripFrame } from "../grammar/words"

// Reviewed, bundled topics only. Neither a model nor a fuzzy match decides
// whether an informational question should prepare a financial action.
export const HELP_CONTENT_VERSION = 4
export type HelpTopic =
  | "capabilities"
  | "funding"
  | "receiving"
  | "fees"
  | "cashout"
  | "recovery"
  | "address"
  | "scan"
  | "wallets"
  | "lightning"
  | "refunds"
  | "offline"
  | "limits"
  | "support"
  | "paymentStatus"
export type HelpAction =
  | "receive"
  | "transfers"
  | "backup"
  | "scan"
  | "history"
  | "support"
export const HELP_ACTIONS: Partial<Record<HelpTopic, HelpAction>> = {
  funding: "transfers",
  receiving: "receive",
  cashout: "transfers",
  recovery: "backup",
  address: "receive",
  scan: "scan",
  refunds: "history",
  support: "support",
  paymentStatus: "history",
}
export type FirstUseMatch =
  | { topic: HelpTopic; call?: ToolCall }
  | { call: ToolCall; topic?: never }

const topics: readonly [HelpTopic, RegExp][] = [
  [
    "capabilities",
    /^(?:what (?:can you|you can) (?:help me|help my|help|do)(?: do)?|help|what can flash do)$/,
  ],
  [
    "funding",
    /^(?:how (?:do i|can i|to) (?:add|put|load|deposit) (?:money|funds|cash)(?: (?:to|into|in|on) (?:flash|my wallet))?|how (?:do i|can i|to) top up(?: flash| my wallet)?)$/,
  ],
  [
    "receiving",
    /^(?:how (?:can someone|can people|do people) pay me|how (?:do i|can i|to) (?:receive|get paid|receive money)(?: (?:on|with|in) flash)?)$/,
  ],
  [
    "fees",
    /^(?:what (?:will|does|would) (?:this|a|my) payment cost(?: in fees)?|how much (?:are|will be) (?:the |this payment'?s )?fees|what (?:are|is) (?:the )?(?:payment )?fees)$/,
  ],
  [
    "cashout",
    /^(?:how (?:do i|can i|to|my) (?:cash out|cashout|withdraw|settle)(?: (?:my |the )?(?:money|funds|balance|wallet|account))?(?: (?:from|of) flash)?(?: (?:to|into) (?:my |a |the )?(?:bank account|account|bank))?|how (?:do|does) (?:cash out|cashout|settlement|settlements|withdrawals?) work|what(?: is| are)? settlements?)$/,
  ],
  [
    "recovery",
    /^(?:what happens to my money if i lose my phone|what if i lose my phone|how (?:do i|can i|to) recover my (?:wallet|account)|i lost my phone)$/,
  ],
  ["address", /^(?:what(?: is)? my flash address|my flash address)$/],
  [
    "scan",
    /^(?:how (?:do i|can i|to) scan (?:a |the )?(?:payment )?qr(?: code)?|how (?:do i|can i|to) pay (?:a |with a )?qr code)$/,
  ],
  [
    "wallets",
    /^(?:what(?: is)? the difference between my cash and bitcoin wallets|what(?: is)? the difference between (?:the )?cash and bitcoin(?: wallets)?|why (?:do i|i) have two wallets)$/,
  ],
  ["lightning", /^(?:what(?: is)? lightning|how does lightning work)$/],
  [
    "refunds",
    /^(?:can i cancel a payment(?: or get a refund)?|can i get a refund|how (?:do i|can i|to) (?:get a refund|cancel a payment))$/,
  ],
  [
    "offline",
    /^(?:what can i do (?:without internet|offline)|does flash work offline|can i use flash (?:offline|without internet))$/,
  ],
  [
    "limits",
    /^(?:why (?:cant|cannot|can not) i send (?:this|that) (?:amount|much)|what (?:are )?my (?:account |payment |send )?limits)$/,
  ],
  [
    "support",
    /^(?:how (?:do i|can i|to) (?:contact|reach) (?:flash )?support|contact support|i need help)$/,
  ],
  [
    "paymentStatus",
    /^(?:did my (?:last|latest) payment go through|what(?: is)? the status of my (?:last|latest) payment)$/,
  ],
]

export const readFirstUseQuestion = (utterance: string): FirstUseMatch | undefined => {
  const tokens = stripFrame(normalize(utterance).tokens)
  if (namesPaymentRequest(tokens)) return undefined
  const text = textOf(tokens).replace(/(?: again)+$/, "")
  if (/^how much money (?:do i|i|my) have$/.test(text))
    return { call: { intent: "getBalances", args: {} } }
  if (/^how much is bitcoin worth in jmd$/.test(text))
    return { call: { intent: "getPrice", args: { currency: "JMD" } } }
  for (const [topic, pattern] of topics) {
    if (pattern.test(text))
      return {
        topic,
        ...(topic === "limits" ? { call: { intent: "getAccountLimits", args: {} } } : {}),
      }
  }
  return undefined
}
