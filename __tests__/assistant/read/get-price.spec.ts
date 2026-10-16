import { getPrice } from "@app/assistant/registry/read/get-price"
import { fakeCtx } from "../fakes"

const PRICE = {
  __typename: "RealtimePrice",
  timestamp: 1_760_000_000,
  denominatorCurrency: "JMD",
  btcSatPrice: { __typename: "PriceOfOneSatInMinorUnit", base: 1_712_345, offset: 12 },
  usdCentPrice: { __typename: "PriceOfOneUsdCentInMinorUnit", base: 15_800, offset: 2 },
}

describe("getPrice", () => {
  it("reads the live price in the display currency by default", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.realtimePrice.mockResolvedValue(PRICE)

    const result = await getPrice.run({}, ctx)

    expect(graphql.realtimePrice).toHaveBeenCalledWith("JMD")
    expect(result).toEqual({
      kind: "answer",
      payload: {
        currency: "JMD",
        timestamp: 1_760_000_000,
        btcSatPrice: { base: 1_712_345, offset: 12 },
        usdCentPrice: { base: 15_800, offset: 2 },
      },
    })
  })

  it("reads another currency when the call names one", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.realtimePrice.mockResolvedValue({ ...PRICE, denominatorCurrency: "USD" })

    await getPrice.run({ currency: "USD" }, ctx)

    expect(graphql.realtimePrice).toHaveBeenCalledWith("USD")
  })

  it("asks the server every time and never answers from memory", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.realtimePrice.mockResolvedValue(PRICE)

    await getPrice.run({}, ctx)
    await getPrice.run({}, ctx)

    expect(graphql.realtimePrice).toHaveBeenCalledTimes(2)
  })

  it("takes only a three-letter currency code", () => {
    expect(getPrice.validate({ currency: "JMD" }).valid).toBe(true)
    expect(getPrice.validate({ currency: "jmd" }).valid).toBe(false)
    expect(getPrice.validate({ currency: "JMD; drop" }).valid).toBe(false)
  })

  it("projects the payload as it is: integers, no text", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.realtimePrice.mockResolvedValue(PRICE)
    const result = await getPrice.run({}, ctx)
    if (result.kind !== "answer") throw new Error("expected an answer")

    expect(getPrice.project(result.payload, {})).toEqual(result.payload)
  })
})
