export type Outcome = {
  kind: string
  topic?: string
  destination?: string
  replyKey?: string
  operation?: "add" | "remove" | "profile"
  query?: string
  lookup?: "exact" | "suggestions" | "missing" | "error"
  usernames?: string[]
  username?: string
  cardType?: string
  amount?: string
  intent?: string
  stale?: boolean
  cashBalance?: number | null
  btcState?: "ok" | "disabled" | "syncing" | "failed"
  btcSats?: number | null
  transactionIds?: string[]
  currency?: string
  inputOrigin?: "text" | "voice"
  reason?: string
  suggestionSource?: "known"
  prompt?: string
  toWallet?: string
  title?: string
}
export type FixtureChanges = {
  cashBalance?: number | null
  btcState?: "ok" | "disabled" | "syncing" | "failed"
  btcSats?: number
  lookupFails?: boolean
  unverifiedUsers?: string[]
  failServices?: ("wallets" | "realtimePrice" | "transactions" | "accountDefaultWallet")[]
}
export type ScenarioState = {
  offline?: boolean
  contacts?: string[]
  chatContacts?: string[]
  history?: string[]
  legacyLookups?: string[]
  recent?: string[]
  legacyIndex?: string[]
  scope?: string
  displayCurrency?: "USD" | "JMD"
  voiceAvailable?: boolean
} & FixtureChanges
export type ScenarioStep =
  | { ask: string; intended?: string; origin?: "text" | "voice"; expect: Outcome }
  | { select: string; expect: Outcome }
  | { correctUsername: string; expect: Outcome }
  | { restart: true }
  | { offline: boolean }
  | { switchAccount: string }
  | {
      contactAction: "add" | "remove"
      username: string
      result?: "cancelled" | "rejected"
    }
  | { fixture: FixtureChanges }
  | {
      assertReads: Partial<
        Record<
          "wallets" | "realtimePrice" | "transactions" | "verification" | "btc",
          number
        >
      >
    }
  | {
      voiceFailure:
        | "denied"
        | "blocked"
        | "restricted"
        | "no-speech"
        | "interrupted"
        | "unavailable"
        | "failed"
        | "cancelled"
        | "empty"
    }
  | { openSupport: true }
  | { openScreen: { route: string; params?: Record<string, unknown> } }
  | { toggleWallet: boolean }
  | { voiceUnavailable: true }
export type Scenario = {
  id: string
  category: string
  layer: "integration" | "screen"
  supported: boolean
  split: "regression" | "holdout" | "generated"
  state: ScenarioState
  steps: ScenarioStep[]
  source?: string
}
export type ScenarioSuite = {
  schemaVersion: 1
  corpusVersion: string
  digest: string
  seed: number
  scenarios: Scenario[]
  users: Record<string, { pubkey: string }>
}
export type ScenarioResult = {
  id: string
  category: string
  layer: Scenario["layer"]
  supported: boolean
  split: Scenario["split"]
  passed: boolean
  steps: { input: unknown; expected?: Outcome; actual?: Outcome; error?: string }[]
  unexpectedSupport: number
  dispatches: number
  errors: string[]
}
