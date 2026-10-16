import type { GraphqlRail } from "../rails/graphql-rail"
import type { Registry } from "../registry/define"
import { prepareRefusalResult, PrepareRefusedError } from "../registry/refusals"
import {
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

export type RunToolDeps = {
  registry: Registry
  graphql: GraphqlRail
  /** The BTC rail, or just its reads. Only the reads reach a tool. */
  btcRail: BtcReadRail
  displayCurrency: string
  /** Epoch milliseconds. */
  now: () => number
  telemetry: AssistantTelemetry
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
  now,
}: Omit<RunToolDeps, "registry" | "telemetry">): ReadToolCtx => ({
  graphql,
  btcRail: {
    getBalanceSats: () => btcRail.getBalanceSats(),
    listPayments: (...args) => btcRail.listPayments(...args),
  },
  displayCurrency,
  now,
})

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
      const ran = await route.tool.run(route.args, createReadToolCtx(deps))
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
      // No on-device model is wired in yet (Phase 3).
      onDeviceModelAvailable: false,
    }),
  )
  return result
}
