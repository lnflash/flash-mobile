import { defineRead } from "../define"
import { PricePayload, projectPrice } from "../projections"
import type { ReadToolCtx, ToolResult } from "../types"

// getPrice (docs/ai-assistant-tool-registry.md §4): the live price, read from
// the server on every call and never estimated or remembered. It answers in
// the account's display currency unless the call names another.

type Args = { currency?: string }

const run = async (
  { currency }: Args,
  ctx: ReadToolCtx,
): Promise<ToolResult<PricePayload>> => {
  const price = await ctx.graphql.realtimePrice(currency ?? ctx.displayCurrency)
  if (price.denominatorCurrency !== (currency ?? ctx.displayCurrency))
    return { kind: "error", userMessage: "Assistant.toolFailed" }
  return {
    kind: "answer",
    payload: {
      currency: price.denominatorCurrency,
      timestamp: price.timestamp,
      btcSatPrice: { base: price.btcSatPrice.base, offset: price.btcSatPrice.offset },
      usdCentPrice: { base: price.usdCentPrice.base, offset: price.usdCentPrice.offset },
    },
  }
}

export const getPrice = defineRead({
  intent: "getPrice",
  description: "The live bitcoin price in the user's display currency, or another one.",
  input: {
    type: "object",
    properties: {
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
    },
    additionalProperties: false,
  },
  run,
  project: projectPrice,
})
