// A runtime for the thread specs: fake rails, an in-memory journal, a fake
// auth gate and recorded telemetry, around the real executor, registry and
// runTool (watched). Not a spec itself.
import { ApolloClient, InMemoryCache } from "@apollo/client"

import { createAttemptJournal } from "@app/assistant/engine/attempt-journal"
import type { AuthGate } from "@app/assistant/engine/auth-gate"
import type { ModelAdapter } from "@app/assistant/engine/model-adapter"
import { runTool } from "@app/assistant/engine/run-tool"
import type { GraphqlActionRail } from "@app/assistant/rails/graphql-action-rail"
import type { GraphqlRail } from "@app/assistant/rails/graphql-rail"
import {
  AssistantRuntime,
  createAssistantRuntime,
} from "@app/assistant/ui/assistant-runtime"
import type { TurnEnv } from "@app/assistant/ui/turn"
import type { BtcRail } from "@app/payments/btc-rail"
import type { GraphqlMutationFns } from "@app/payments/send-payment"
import { memoryStorage } from "../executor-harness"
import {
  fakeActionRail,
  fakeBtcRail,
  fakeDisplay,
  fakeGraphqlRail,
  fakeSendTriggers,
  NOW_MS,
  recordingTelemetry,
  unavailableModelAdapter,
} from "../fakes"

/**
 * The runtime. Its on-device model is never there unless a case hands one
 * in (ENG-690): the thread specs run on the grammar alone.
 */
export const fakeRuntime = <
  M extends ModelAdapter = ReturnType<typeof unavailableModelAdapter>,
>(
  options: {
    modelAdapter?: M
    auth?: AuthGate
    client?: ApolloClient<unknown>
    cacheScope?: string
  } = {},
) => {
  const modelAdapter = options.modelAdapter ?? unavailableModelAdapter()
  const graphql = fakeGraphqlRail()
  const cachedGraphql = fakeGraphqlRail()
  const btcRail = fakeBtcRail()
  const actions = fakeActionRail()
  const mutations = fakeSendTriggers()
  const recorded = recordingTelemetry()
  const watchedRunTool = jest.fn(runTool)
  const runtime: AssistantRuntime = createAssistantRuntime(
    options.client ??
      new ApolloClient({ cache: new InMemoryCache(), connectToDevTools: false }),
    {
      cacheScope: options.cacheScope ?? "test-session",
      threadId: "thread-ask-flash",
      graphql: graphql as unknown as GraphqlRail,
      cachedGraphql: cachedGraphql as unknown as GraphqlRail,
      graphqlActions: actions as unknown as GraphqlActionRail,
      btcRail: btcRail as unknown as BtcRail,
      sendMutations: mutations as unknown as GraphqlMutationFns,
      telemetry: recorded.telemetry,
      journal: createAttemptJournal({ storage: memoryStorage() }),
      auth: options.auth ?? {
        availability: async () => "none",
        authenticate: async () => false,
      },
      runTool: watchedRunTool,
      modelAdapter,
      now: () => NOW_MS,
    },
  )
  return {
    runtime,
    modelAdapter: modelAdapter as M,
    graphql,
    cachedGraphql,
    btcRail,
    actions,
    mutations,
    runTool: watchedRunTool,
    ...recorded,
  }
}

/** A turn's environment: online, a USD account, the specs' predictable formatter. */
export const env = (overrides: Partial<TurnEnv> = {}): TurnEnv => ({
  isOffline: false,
  displayCurrency: "USD",
  displaySymbol: "$",
  display: fakeDisplay(),
  graphqlUri: "https://api.example/graphql",
  lnAddressHostname: "flashapp.me",
  ...overrides,
})

/** A cash wallet with $12.34, as the GraphQL rail answers it. */
export const CASH_WALLETS = [
  {
    __typename: "UsdWallet",
    id: "my-usd",
    balance: 1234,
    walletCurrency: "USD",
    isExternal: false,
  },
]
