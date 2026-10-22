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
  lookupFails?: boolean
  voiceAvailable?: boolean
}
export type ScenarioStep =
  | { ask: string; intended?: string; origin?: "text" | "voice"; expect: Outcome }
  | { select: string; expect: Outcome }
  | { restart: true }
  | { offline: boolean }
  | { switchAccount: string }
  | { contactAction: "add" | "remove"; username: string }
  | { openSupport: true }
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
