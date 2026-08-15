import { createCache } from "@app/graphql/cache"
import {
  CardTopupLimitsDocument,
  CardTopupLimitsQuery,
  TransferFlagsDocument,
  TransferFlagsQuery,
} from "@app/graphql/generated"

// transferFlags and cardTopupLimits deliberately select DISJOINT subsets of
// globals.fygaroTopup (see use-transfer-flags.ts / use-card-topup-limit.ts for
// why the split exists). FygaroTopupInfo has no id, so it is embedded in the
// singleton Globals record — without a merge policy on Globals.fygaroTopup,
// each query's response wholesale-replaces the object and destroys the other
// query's cached fields. Both hooks watch with cache-and-network on the same
// screens, so the clobber triggers a refetch, whose response clobbers the
// other query's fields, and so on: a sustained ping-pong during which
// dailyLimit (and the enforced minimum) read undefined — disarming the
// over-cap gate on the payment screen. These tests exercise the REAL cache
// (not mocked hooks) and fail if the merge policy is ever removed.

const transferFlagsData: TransferFlagsQuery = {
  __typename: "Query",
  globals: {
    __typename: "Globals",
    topupEnabled: true,
    cashoutEnabled: true,
    bridgeEnabled: false,
    fygaroTopup: {
      __typename: "FygaroTopupInfo",
      minimumAmount: 10,
      processorFeePercent: 4.5,
      processorFeeFixed: 0.3,
      flashFeePercent: 1,
      flashFeeFixed: 0.5,
    },
  },
}

const cardTopupLimitsData: CardTopupLimitsQuery = {
  __typename: "Query",
  globals: {
    __typename: "Globals",
    fygaroTopup: {
      __typename: "FygaroTopupInfo",
      l1DailyLimit: 500,
      l2DailyLimit: 5000,
      l3DailyLimit: 10000,
    },
  },
}

describe("Globals.fygaroTopup cache merge policy", () => {
  it("keeps transferFlags' fygaroTopup fields when cardTopupLimits writes after it", () => {
    const cache = createCache()

    cache.writeQuery({ query: TransferFlagsDocument, data: transferFlagsData })
    cache.writeQuery({ query: CardTopupLimitsDocument, data: cardTopupLimitsData })

    // readQuery returns null when ANY selected field is missing from the
    // cache — a null here means the second write clobbered the first.
    const transferFlags = cache.readQuery<TransferFlagsQuery>({
      query: TransferFlagsDocument,
    })
    expect(transferFlags?.globals?.fygaroTopup).toEqual(
      expect.objectContaining({
        minimumAmount: 10,
        processorFeePercent: 4.5,
        processorFeeFixed: 0.3,
        flashFeePercent: 1,
        flashFeeFixed: 0.5,
      }),
    )

    const limits = cache.readQuery<CardTopupLimitsQuery>({
      query: CardTopupLimitsDocument,
    })
    expect(limits?.globals?.fygaroTopup).toEqual(
      expect.objectContaining({
        l1DailyLimit: 500,
        l2DailyLimit: 5000,
        l3DailyLimit: 10000,
      }),
    )
  })

  it("keeps cardTopupLimits' fygaroTopup fields when transferFlags writes after it", () => {
    const cache = createCache()

    cache.writeQuery({ query: CardTopupLimitsDocument, data: cardTopupLimitsData })
    cache.writeQuery({ query: TransferFlagsDocument, data: transferFlagsData })

    const limits = cache.readQuery<CardTopupLimitsQuery>({
      query: CardTopupLimitsDocument,
    })
    expect(limits?.globals?.fygaroTopup).toEqual(
      expect.objectContaining({
        l1DailyLimit: 500,
        l2DailyLimit: 5000,
        l3DailyLimit: 10000,
      }),
    )

    const transferFlags = cache.readQuery<TransferFlagsQuery>({
      query: TransferFlagsDocument,
    })
    expect(transferFlags?.globals?.fygaroTopup).toEqual(
      expect.objectContaining({
        minimumAmount: 10,
        processorFeePercent: 4.5,
        processorFeeFixed: 0.3,
        flashFeePercent: 1,
        flashFeeFixed: 0.5,
      }),
    )
  })
})
