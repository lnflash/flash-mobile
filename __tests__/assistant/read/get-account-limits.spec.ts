import { getAccountLimits } from "@app/assistant/registry/read/get-account-limits"
import { toUsdMoneyAmount } from "@app/types/amounts"
import { fakeCtx } from "../fakes"

const limit = (totalLimit: number, remainingLimit: number | null, interval = 86400) => ({
  __typename: "OneDayAccountLimit",
  totalLimit,
  remainingLimit,
  interval,
})

describe("getAccountLimits", () => {
  it("answers each limit in cents as a MoneyAmount", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.accountLimits.mockResolvedValue({
      withdrawal: [limit(100_000, 25_050)],
      internalSend: [limit(500_000, null)],
      convert: [],
    })

    const result = await getAccountLimits.run({}, ctx)

    expect(result).toEqual({
      kind: "answer",
      payload: {
        withdrawal: [
          {
            total: toUsdMoneyAmount(100_000),
            remaining: toUsdMoneyAmount(25_050),
            intervalSeconds: 86400,
          },
        ],
        // A limit with nothing reported as left says so, rather than zero.
        internalSend: [
          { total: toUsdMoneyAmount(500_000), remaining: null, intervalSeconds: 86400 },
        ],
        convert: [],
      },
    })
    if (result.kind === "answer") {
      expect(getAccountLimits.project(result.payload, {})).toEqual(result.payload)
    }
  })

  it("lets a failed read reject, for runTool to report", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.accountLimits.mockRejectedValue(new Error("Network request failed"))

    await expect(getAccountLimits.run({}, ctx)).rejects.toThrow("Network request failed")
  })
})
