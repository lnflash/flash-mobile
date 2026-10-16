import { toUsdMoneyAmount } from "@app/types/amounts"
import type { AccountLimitsRow } from "../../rails/graphql-rail"
import { defineRead } from "../define"
import { AccountLimitsPayload, LimitEntry, projectAccountLimits } from "../projections"
import type { ReadToolCtx, ToolResult } from "../types"

// getAccountLimits (docs/ai-assistant-tool-registry.md §4): the account's
// daily limits, which answer "why can't I send this much". The server
// reports them in whole cents.

const entries = (limits: AccountLimitsRow["withdrawal"]): LimitEntry[] =>
  limits.map((limit) => ({
    total: toUsdMoneyAmount(limit.totalLimit),
    remaining:
      limit.remainingLimit === null || limit.remainingLimit === undefined
        ? null
        : toUsdMoneyAmount(limit.remainingLimit),
    intervalSeconds: limit.interval ?? null,
  }))

const run = async (
  _args: Record<string, never>,
  ctx: ReadToolCtx,
): Promise<ToolResult<AccountLimitsPayload>> => {
  const limits = await ctx.graphql.accountLimits()
  return {
    kind: "answer",
    payload: {
      withdrawal: entries(limits.withdrawal),
      internalSend: entries(limits.internalSend),
      convert: entries(limits.convert),
    },
  }
}

export const getAccountLimits = defineRead({
  intent: "getAccountLimits",
  description:
    "The account's daily limits for sending to other users, withdrawing and converting.",
  input: { type: "object", properties: {}, additionalProperties: false },
  run,
  project: projectAccountLimits,
})
