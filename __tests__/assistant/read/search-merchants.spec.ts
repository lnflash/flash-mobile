import type { MerchantsPayload } from "@app/assistant/registry/projections"
import {
  MERCHANT_RESULTS_LIMIT,
  searchMerchants,
} from "@app/assistant/registry/read/search-merchants"
import { fakeCtx } from "../fakes"

const marker = (title: string, username: string | null = null) => ({
  __typename: "MapMarker",
  username,
  mapInfo: {
    __typename: "MapInfo",
    title,
    coordinates: { __typename: "Coordinates", longitude: -76.8, latitude: 18.0 },
  },
})

const search = async (args: { query?: string }, markers: ReturnType<typeof marker>[]) => {
  const { ctx, graphql } = fakeCtx()
  graphql.businessMapMarkers.mockResolvedValue(markers)
  const result = await searchMerchants.run(args, ctx)
  if (result.kind !== "answer") throw new Error("expected an answer")
  return result.payload as MerchantsPayload
}

describe("searchMerchants", () => {
  const MARKERS = [
    marker("Devon House Bakery", "devonhouse"),
    marker("Juici Patties"),
    marker("Coffee Shop", "kingstonbeans"),
  ]

  it("filters by name, ignoring case", async () => {
    await expect(search({ query: "BAKERY" }, MARKERS)).resolves.toEqual({
      merchants: [{ title: "Devon House Bakery", username: "devonhouse" }],
      matchedCount: 1,
    })
  })

  it("matches the merchant's username too", async () => {
    const payload = await search({ query: "beans" }, MARKERS)

    expect(payload.merchants).toEqual([
      { title: "Coffee Shop", username: "kingstonbeans" },
    ])
  })

  it("lists merchants with no query, and drops their coordinates", async () => {
    const payload = await search({}, MARKERS)

    expect(payload.merchants).toHaveLength(3)
    expect(JSON.stringify(payload)).not.toMatch(/latitude|longitude/)
  })

  it("caps the list at ten and says how many matched", async () => {
    const many = Array.from({ length: 14 }, (_, i) => marker(`Shop ${i}`))

    const payload = await search({ query: "shop" }, many)

    expect(payload.merchants).toHaveLength(MERCHANT_RESULTS_LIMIT)
    expect(payload.matchedCount).toBe(14)
  })

  it("has no location input", () => {
    expect(searchMerchants.validate({ query: "x", near: "here" }).valid).toBe(false)
  })
})
