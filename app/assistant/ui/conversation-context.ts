import { validateCard } from "../cards/types"
import { readAmountPhrase, type AmountPhraseContext } from "../engine/amount-phrase"
import type { ToolCall } from "../engine/intent-router"
import { normalize, textOf } from "../grammar/normalize"
import { readGrammar } from "../grammar"
import { isIntent, tierOf } from "../registry/types"
import { HELP_ACTIONS, readFirstUseQuestion, type HelpTopic } from "./first-use-help"
import { readQuickAction } from "./quick-actions"
import { readScreenDestination } from "./screen-destinations"
import { FLASH_USERNAME } from "../registry/read/lookup-flash-username"
import type { NewEntry, ThreadEntry } from "./thread-store"

type Followup =
  | { kind: "request"; text: string }
  | { kind: "answer"; entries: NewEntry[] }
  | { kind: "read"; call: ToolCall }
const answer = (...entries: NewEntry[]): Followup => ({ kind: "answer", entries })
const request = (text: string): Followup => ({ kind: "request", text })
const readOnly = (call: ToolCall) =>
  isIntent(call.intent) && tierOf(call.intent) === "read"
const repeat =
  /^(?:again|one more time|same (?:thing|ting)(?: again)?|show (?:me )?(?:that|it)(?: again)?|(?:say|read) (?:that|it)(?: again)?|repeat (?:that|it)|do (?:that|it) again)$/

/** Context is only the last few visible turns, never a model guess or persisted memory. */
export const readConversationFollowup = (
  utterance: string,
  entries: readonly ThreadEntry[],
  account: AmountPhraseContext,
): Followup | undefined => {
  const text = textOf(normalize(utterance).tokens)
    .replace(/^(?:please )?(?:(?:can|could|would) you )?(?:please )?/, "")
    .replace(/ please$/, "")
  const profile =
    /^(?:show me|show|open) (?:their|his|her|that users) profile(?: again)?$/.test(text)
  const contact =
    /^(add|remove) (?:them|him|her|that user) (to|from) my contacts(?: again)?$/.exec(
      text,
    )
  const history =
    /^(?:show|find)(?: me)? my (?:last|latest) payment to (?:them|him|her|that user)$/.test(
      text,
    )
  const framed = utterance
    .trim()
    .replace(/^(?:please )?(?:(?:can|could|would) you )?(?:please )?/i, "")
    .replace(/[?.!]+$/, "")
  const payPerson = /^(?:pay|send) (?:them|him|her|that user) (.+)$/i.exec(framed)
  const sendToPerson = /^send (.+?) to (?:them|him|her|that user)$/i.exec(framed)
  const personAmount = payPerson?.[1] ?? sendToPerson?.[1]
  const missingPerson = () =>
    profile || contact || history || personAmount
      ? answer({ kind: "reply", replyKey: "Assistant.contextPersonUnclear" })
      : undefined
  // The caller normally already appended the current user bubble.
  const end =
    entries[entries.length - 1]?.kind === "user" ? entries.length - 1 : entries.length
  const recent = entries.slice(Math.max(0, end - 12), end)
  const userAt = recent.map(({ kind }) => kind).lastIndexOf("user")
  if (userAt < 0) return missingPerson()
  const previousUser = recent[userAt]
  if (previousUser.kind !== "user") return undefined
  const replies = recent.slice(userAt + 1)
  const prior = replies[replies.length - 1]
  if (!prior) return missingPerson()
  const previousText = previousUser.resolvedText ?? previousUser.text

  if (prior.kind === "help") {
    const topic =
      /^(?:and|what about|how about) (fees|offline|limits|support|refunds|lightning)$/.exec(
        text,
      )?.[1]
    if (topic) return answer({ kind: "help", topic: topic as HelpTopic })
  }

  if (
    prior.kind === "reply" &&
    ["Assistant.unknownIntent", "Assistant.notYetAvailable"].includes(prior.replyKey) &&
    /^(?:yes|yes please|support|open it|open support|talk to (?:pulse|a human|an agent)|connect me)$/.test(
      text,
    )
  )
    return answer({ kind: "screen", destination: "support" })

  if (/^(?:open (?:it|that)|take me there|go there|show me where)$/.test(text)) {
    if (prior.kind === "screen")
      return answer({ kind: "screen", destination: prior.destination })
    if (prior.kind === "help") {
      const action = HELP_ACTIONS[prior.topic]
      const destinations = {
        receive: "receive",
        transfers: "transfers",
        history: "history",
        scan: "scanner",
        support: "support",
        backup: "backup",
      } as const
      if (action && action in destinations)
        return answer({
          kind: "screen",
          destination: destinations[action as keyof typeof destinations],
        })
    }
  }

  // Only a selected, verified identity can fill a pronoun. A fuzzy picker is not one.
  let username: string | undefined
  if (prior.kind === "contactAction") username = prior.resolvedUsername
  if (prior.kind === "card") {
    const card = validateCard(prior.card)
    if (card.valid && card.card.type === "confirmPayment")
      username = card.card.payeeUsername
  }
  if (profile || contact || history || personAmount) {
    if (!username || !FLASH_USERNAME.test(username)) return missingPerson()
    if (profile) return request(`Show me ${username}'s profile`)
    if (contact) return request(`${contact[1]} ${username} ${contact[2]} my contacts`)
    if (personAmount) {
      // Only the verified recipient comes from context. A new, explicit amount
      // still goes through the normal preparer and a fresh Confirm card.
      if (readAmountPhrase(personAmount, account).kind !== "amount")
        return answer({
          kind: "reply",
          replyKey: "Assistant.amountUnclear",
          params: { currency: account.displayCurrency },
        })
      return request(`Pay ${username} ${personAmount}`)
    }
    return request(`Show me my last payment to ${username}`)
  }

  if (repeat.test(text)) {
    if (previousUser.readCall && readOnly(previousUser.readCall))
      return { kind: "read", call: previousUser.readCall }
    if (prior.kind === "screen")
      return answer({ kind: "screen", destination: prior.destination })
    if (prior.kind === "help") return answer({ kind: "help", topic: prior.topic })
    if (prior.kind === "address") return request("What's my Flash address?")
    if (
      prior.kind === "contactAction" ||
      prior.kind === "cardTopUp" ||
      prior.kind === "card" ||
      prior.kind === "cashoutAmount" ||
      prior.kind === "conversionAmount"
    )
      return answer({ kind: "reply", replyKey: "Assistant.contextActionReview" })
    // Re-parse only a previously understood information request. Amounts and actions
    // cannot be repeated by a conversational reference.
    const firstUse = readFirstUseQuestion(previousText)
    const quick = readQuickAction(previousText, account)
    const grammar = readGrammar(previousText, account)
    if (
      ["balances", "price", "transactions", "details", "limits", "merchants"].includes(
        prior.kind,
      ) &&
      ((firstUse && (!firstUse.call || readOnly(firstUse.call))) ||
        quick?.kind === "payment" ||
        quick?.kind === "merchants" ||
        (grammar?.kind === "call" && readOnly(grammar.call)))
    )
      return request(previousText)
    if (readScreenDestination(previousText)) return request(previousText)
  }
  return undefined
}
