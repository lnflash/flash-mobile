// Suggestions are reviewed questions, never canned money-moving commands.
// Stable IDs keep selections separate from localized labels and transcripts.
export const QUESTION_SUGGESTIONS = [
  {
    id: "help",
    labelKey: "helpSuggestion",
    questionKey: "helpExample",
    question: "What can you help me do?",
  },
  {
    id: "balance",
    labelKey: "balanceSuggestion",
    questionKey: "balanceExample",
    question: "How much money do I have?",
  },
  {
    id: "offline",
    labelKey: "offlineSuggestion",
    questionKey: "offlineExample",
    question: "What can I do without internet?",
  },
  {
    id: "funding",
    labelKey: "fundingSuggestion",
    questionKey: "fundingExample",
    question: "How do I top up my wallet?",
  },
  {
    id: "receiving",
    labelKey: "receivingSuggestion",
    questionKey: "receivingExample",
    question: "How can someone pay me?",
  },
  {
    id: "history",
    labelKey: "historySuggestion",
    questionKey: "historyExample",
    question: "Show me my recent payments.",
  },
  {
    id: "incoming",
    labelKey: "incomingSuggestion",
    questionKey: "incomingExample",
    question: "Who paid me recently?",
  },
  {
    id: "address",
    labelKey: "addressSuggestion",
    questionKey: "addressExample",
    question: "What's my Flash address?",
  },
  {
    id: "scan",
    labelKey: "scanSuggestion",
    questionKey: "scanExample",
    question: "How do I scan a payment QR code?",
  },
  {
    id: "wallets",
    labelKey: "walletsSuggestion",
    questionKey: "walletsExample",
    question: "What's the difference between my cash and Bitcoin wallets?",
  },
  {
    id: "lightning",
    labelKey: "lightningSuggestion",
    questionKey: "lightningExample",
    question: "What is Lightning?",
  },
  {
    id: "fees",
    labelKey: "feesSuggestion",
    questionKey: "feesExample",
    question: "What will this payment cost in fees?",
  },
  {
    id: "status",
    labelKey: "statusSuggestion",
    questionKey: "statusExample",
    question: "Did my last payment go through?",
  },
  {
    id: "cashout",
    labelKey: "cashoutSuggestion",
    questionKey: "cashoutExample",
    question: "How do I cash out?",
  },
  {
    id: "recovery",
    labelKey: "recoverySuggestion",
    questionKey: "recoveryExample",
    question: "What happens to my money if I lose my phone?",
  },
  {
    id: "refunds",
    labelKey: "refundsSuggestion",
    questionKey: "refundsExample",
    question: "Can I cancel a payment or get a refund?",
  },
  {
    id: "limits",
    labelKey: "limitsSuggestion",
    questionKey: "limitsExample",
    question: "Why can't I send this amount?",
  },
  {
    id: "support",
    labelKey: "supportSuggestion",
    questionKey: "supportExample",
    question: "How do I contact support?",
  },
  {
    id: "price",
    labelKey: "priceSuggestion",
    questionKey: "priceExample",
    question: "How much is Bitcoin worth in Jamaican dollars?",
  },
] as const

type Suggestion = (typeof QUESTION_SUGGESTIONS)[number]
export type SuggestionStore = {
  get: () => readonly Suggestion[]
  subscribe: (listener: () => void) => () => void
  choose: (id: Suggestion["id"]) => void
}

/** One store per conversation runtime; revisiting the screen retains its choices. */
export const createSuggestionStore = (): SuggestionStore => {
  let visible: readonly Suggestion[] = QUESTION_SUGGESTIONS.slice(0, 3)
  const used = new Set<Suggestion["id"]>()
  const listeners = new Set<() => void>()
  return {
    get: () => visible,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    choose: (id) => {
      if (!visible.some((question) => question.id === id)) return
      used.add(id)
      const next = QUESTION_SUGGESTIONS.find(
        (question) =>
          !used.has(question.id) &&
          !visible.some((current) => current.id === question.id),
      )
      // After the finite catalog is exhausted, retire used chips instead of repeating them.
      visible = visible.flatMap((question) =>
        question.id === id ? (next ? [next] : []) : [question],
      )
      listeners.forEach((listener) => listener())
    },
  }
}
