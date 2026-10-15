import { defineRead } from "../define"
import {
  projectTransactionDetails,
  TransactionDetailsPayload,
  TxRail,
} from "../projections"
import type { ReadToolCtx, ToolResult } from "../types"

// getTransactionDetails (docs/ai-assistant-tool-registry.md §4): the
// GraphQL rail's `transactionDetails`, for an id a getTransactions row gave.
// The BTC rail exposes no details call yet, so a BTC row has none to give.

type Args = { transactionId: string; rail: TxRail }

const run = async (
  { transactionId, rail }: Args,
  ctx: ReadToolCtx,
): Promise<ToolResult<TransactionDetailsPayload>> => {
  if (rail === "btc")
    return { kind: "error", userMessage: "Assistant.detailsUnavailable" }
  const details = await ctx.graphql.transactionDetails(transactionId)
  if (!details) return { kind: "error", userMessage: "Assistant.detailsUnavailable" }
  return { kind: "answer", payload: { details } }
}

export const getTransactionDetails = defineRead({
  intent: "getTransactionDetails",
  description:
    "The status of one payment from the list, by the id and rail its row gave.",
  input: {
    type: "object",
    properties: {
      transactionId: { type: "string", pattern: "^[A-Za-z0-9:._-]{1,128}$" },
      rail: { enum: ["graphql", "btc"] },
    },
    required: ["transactionId", "rail"],
    additionalProperties: false,
  },
  run,
  project: projectTransactionDetails,
})
