import { defineRead } from "../define"
import { MerchantsPayload, projectMerchants } from "../projections"
import type { ReadToolCtx, ToolResult } from "../types"

// searchMerchants (docs/ai-assistant-tool-registry.md §4): the merchants on
// the map, filtered by name on the device. `businessMapMarkers` takes no
// location, and a distance filter would need the location permission, so v1
// has none.

/** The most merchants an answer lists. */
export const MERCHANT_RESULTS_LIMIT = 10

type Args = { query?: string }

const run = async (
  { query }: Args,
  ctx: ReadToolCtx,
): Promise<ToolResult<MerchantsPayload>> => {
  const needle = query?.trim().toLowerCase()
  const matched = (await ctx.graphql.businessMapMarkers())
    .map((marker) => ({ title: marker.mapInfo.title, username: marker.username ?? null }))
    .filter(
      ({ title, username }) =>
        !needle ||
        title.toLowerCase().includes(needle) ||
        Boolean(username?.toLowerCase().includes(needle)),
    )
  return {
    kind: "answer",
    payload: {
      merchants: matched.slice(0, MERCHANT_RESULTS_LIMIT),
      matchedCount: matched.length,
    },
  }
}

export const searchMerchants = defineRead({
  intent: "searchMerchants",
  description: "Merchants on the Flash map whose name matches a query.",
  input: {
    type: "object",
    properties: {
      query: { type: "string", pattern: "^[\\s\\S]{1,80}$" },
    },
    additionalProperties: false,
  },
  run,
  project: projectMerchants,
})
