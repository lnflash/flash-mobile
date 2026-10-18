import type { ApolloClient } from "@apollo/client"
import { v4 as uuidv4 } from "uuid"

import { breezBtcRail, BtcRail } from "@app/payments/btc-rail"
import { createGraphqlMutationFns, GraphqlMutationFns } from "@app/payments/send-payment"
import { AttemptJournal, createAttemptJournal } from "../engine/attempt-journal"
import { AuthGate, createDeviceAuthGate } from "../engine/auth-gate"
import { createExecutor, Executor } from "../engine/executor"
import { createNativeModelAdapter, ModelAdapter } from "../engine/model-adapter"
import { createTransactionListReconciler } from "../engine/reconcile"
import { runTool } from "../engine/run-tool"
import { analyticsTelemetry, AssistantTelemetry } from "../engine/telemetry"
import { createGraphqlActionRail, GraphqlActionRail } from "../rails/graphql-action-rail"
import { createGraphqlRail, GraphqlRail } from "../rails/graphql-rail"
import { createLnurlInvoiceRequest, LnurlInvoiceRequest } from "../rails/lnurl-invoice"
import { assistantRegistry } from "../registry"
import type { Registry } from "../registry/define"
import { createThreadStore, ThreadStore } from "./thread-store"

// What the Ask Flash thread runs on (ENG-689): the rails over the app's
// Apollo client, the dispatch journal, the reconciler, the executor, and
// the thread's transcript. One per client: the client is rebuilt whenever
// the session's token or the instance changes (app/graphql/client.tsx), so
// a logout or an account switch gets a new runtime, with a new executor and
// an empty thread, and nothing held by the old session's actions. Leaving
// the screen and coming back keeps the thread, its cards, and what the
// executor knows of their actions, with no provider at the app's root.

export type AssistantRuntime = {
  /** The one thread this runtime holds. */
  threadId: string
  registry: Registry
  /** The custodial rail's reads, from the network: every turn online, and the reconciler. */
  graphql: GraphqlRail
  /** The same reads from the cache alone: the thread's reads while offline. */
  cachedGraphql: GraphqlRail
  graphqlActions: GraphqlActionRail
  btcRail: BtcRail
  /** The nine GraphQL send triggers; execute() journals each dispatch through them. */
  sendMutations: GraphqlMutationFns
  requestLnurlInvoice: LnurlInvoiceRequest
  telemetry: AssistantTelemetry
  executor: Executor
  transcript: ThreadStore
  /** runTool: the engine's, unless a spec watches it. */
  runTool: typeof runTool
  /**
   * The on-device model (ENG-690), asked only after the grammar misses and
   * only while the flags allow (TurnEnv.onDeviceModel): the native module,
   * unless a spec hands in a fake.
   */
  modelAdapter: ModelAdapter
  /** Epoch milliseconds. */
  now: () => number
}

export type AssistantRuntimeOptions = {
  /**
   * What the OS biometric prompt says. Only a voice-initiated action asks
   * for it (Phase 4); a text one confirms with a tap (spec §5).
   */
  authDescription?: string
  // Seams for specs.
  threadId?: string
  graphql?: GraphqlRail
  cachedGraphql?: GraphqlRail
  graphqlActions?: GraphqlActionRail
  btcRail?: BtcRail
  sendMutations?: GraphqlMutationFns
  telemetry?: AssistantTelemetry
  journal?: AttemptJournal
  auth?: AuthGate
  runTool?: typeof runTool
  modelAdapter?: ModelAdapter
  now?: () => number
}

/** A runtime over `client`. getAssistantRuntime keeps one per client. */
export const createAssistantRuntime = (
  client: ApolloClient<unknown>,
  options: AssistantRuntimeOptions = {},
): AssistantRuntime => {
  const now = options.now ?? Date.now
  const graphql = options.graphql ?? createGraphqlRail(client)
  const telemetry = options.telemetry ?? analyticsTelemetry
  const executor = createExecutor({
    auth:
      options.auth ??
      createDeviceAuthGate({ description: options.authDescription ?? "" }),
    journal: options.journal ?? createAttemptJournal(),
    // The reconciler reads the network, never the cache: an absent verdict
    // lets a payment go again.
    reconcile: createTransactionListReconciler({ graphql, now }),
    telemetry,
    now,
  })
  return {
    threadId: options.threadId ?? uuidv4(),
    registry: assistantRegistry,
    graphql,
    cachedGraphql:
      options.cachedGraphql ?? createGraphqlRail(client, { fetchPolicy: "cache-only" }),
    graphqlActions: options.graphqlActions ?? createGraphqlActionRail(client),
    btcRail: options.btcRail ?? breezBtcRail,
    sendMutations: options.sendMutations ?? createGraphqlMutationFns(client),
    requestLnurlInvoice: createLnurlInvoiceRequest(),
    telemetry,
    executor,
    transcript: createThreadStore(),
    runTool: options.runTool ?? runTool,
    modelAdapter: options.modelAdapter ?? createNativeModelAdapter(),
    now,
  }
}

const runtimes = new WeakMap<object, AssistantRuntime>()

/**
 * The runtime for this Apollo client: the same one for as long as the
 * client lives, a new one for a new client. Options apply to the one this
 * call creates.
 */
export const getAssistantRuntime = (
  client: ApolloClient<unknown>,
  options: AssistantRuntimeOptions = {},
): AssistantRuntime => {
  const held = runtimes.get(client)
  if (held) return held
  const runtime = createAssistantRuntime(client, options)
  runtimes.set(client, runtime)
  return runtime
}
