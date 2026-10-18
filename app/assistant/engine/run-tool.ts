import type { GraphqlRail } from "../rails/graphql-rail"
import type { RegisteredTool, Registry } from "../registry/define"
import { prepareRefusalResult, PrepareRefusedError } from "../registry/refusals"
import {
  ActionToolCtx,
  BtcReadRail,
  Intent,
  ReadToolCtx,
  Tier,
  tierOf,
  ToolResult,
} from "../registry/types"
import { routeIntent } from "./intent-router"
import { AssistantOutcome, AssistantTelemetry, report } from "./telemetry"

// The single entry every tool call goes through, from the grammar tier and
// from any model alike (docs/ai-assistant-tool-registry.md §2): route, run,
// project, report. It never rejects: whatever goes wrong becomes a templated
// error reply.

/**
 * What only action tools get, on top of what every tool gets (ENG-688): the
 * thread, the rails that can prepare and send, and the display formatter.
 */
export type ActionDeps = Omit<ActionToolCtx, "graphql" | "displayCurrency" | "now">

export type RunToolDeps = {
  registry: Registry
  graphql: GraphqlRail
  /** The BTC rail, or just its reads. Only the reads reach a read tool. */
  btcRail: BtcReadRail
  displayCurrency: string
  /** The instance's Lightning-address host, for the read tools (ReadToolCtx). */
  lnAddressHostname: string
  /** Epoch milliseconds. */
  now: () => number
  telemetry: AssistantTelemetry
  /**
   * For action tools. Without it an action intent is answered "not yet
   * available" and no action tool runs: a caller that only reads cannot
   * prepare a payment by accident.
   */
  actionDeps?: ActionDeps
  /**
   * The on-device model emitted this call, or a card it prepared issues it
   * again (a pick, a Try again, a Refresh; ENG-690): the event says so in
   * `onDeviceModelAvailable`, which analytics.ts reads as "a model served
   * the call". False, or absent, for the grammar's calls and every other.
   */
  servedByOnDeviceModel?: boolean
}

/**
 * The context a read tool gets: the BTC rail cut down to its two reads at
 * run time, not only in the type, so a tool cannot reach a send method even
 * when the caller handed in the whole rail.
 */
export const createReadToolCtx = ({
  graphql,
  btcRail,
  displayCurrency,
  lnAddressHostname,
  now,
}: Pick<
  RunToolDeps,
  "graphql" | "btcRail" | "displayCurrency" | "lnAddressHostname" | "now"
>): ReadToolCtx => ({
  graphql,
  btcRail: {
    getBalanceSats: () => btcRail.getBalanceSats(),
    listPayments: (...args) => btcRail.listPayments(...args),
  },
  displayCurrency,
  lnAddressHostname,
  now,
})

/** The context an action tool gets: the action deps over the shared ones. */
export const createActionToolCtx = (
  {
    graphql,
    displayCurrency,
    now,
  }: Pick<RunToolDeps, "graphql" | "displayCurrency" | "now">,
  actionDeps: ActionDeps,
): ActionToolCtx => ({ ...actionDeps, graphql, displayCurrency, now })

/** Run a routed tool with its own tier's context, and nothing more. */
const runRouted = (
  tool: RegisteredTool,
  args: Record<string, unknown>,
  deps: RunToolDeps,
): Promise<ToolResult<unknown>> => {
  if (tool.tier === "read") return tool.run(args, createReadToolCtx(deps))
  if (!deps.actionDeps) {
    return Promise.resolve({ kind: "error", userMessage: "Assistant.notYetAvailable" })
  }
  return tool.run(args, createActionToolCtx(deps, deps.actionDeps))
}

const OUTCOME: Record<ToolResult<unknown>["kind"], AssistantOutcome> = {
  answer: "answered",
  prepared: "prepared",
  clarification: "clarification",
  error: "error",
}

/** What a tool's failure tells the user: a refusal card, or that it failed. */
const failureResult = (err: unknown): ToolResult<never> =>
  err instanceof PrepareRefusedError
    ? prepareRefusalResult(err.reason)
    : { kind: "error", userMessage: "Assistant.toolFailed" }

export const runTool = async (
  raw: unknown,
  deps: RunToolDeps,
): Promise<ToolResult<unknown>> => {
  const startedAt = deps.now()
  let intent: Intent | "unknown" = "unknown"
  let tier: Tier | "none" = "none"
  let outcome: AssistantOutcome
  let result: ToolResult<unknown>

  try {
    const route = routeIntent(raw, deps.registry)
    intent = route.intent
    tier = route.intent === "unknown" ? "none" : tierOf(route.intent)
    if (route.ok) {
      const ran = await runRouted(route.tool, route.args, deps)
      // Only the compact projection of an answer leaves runTool (spec §4).
      result =
        ran.kind === "answer"
          ? { kind: "answer", payload: route.tool.project(ran.payload, route.args) }
          : ran
      outcome = OUTCOME[result.kind]
    } else {
      result = { kind: "error", userMessage: route.replyKey }
      outcome = "rejected"
    }
  } catch (err) {
    result = failureResult(err)
    outcome = "error"
  }

  const latencyMs = deps.now() - startedAt
  report(() =>
    deps.telemetry.tool({
      intent,
      tier,
      outcome,
      latencyMs,
      onDeviceModelAvailable: deps.servedByOnDeviceModel ?? false,
    }),
  )
  return result
}
