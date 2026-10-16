import { ToolReplyError } from "@app/assistant/registry/actions/shared/errors"
import { readPrice } from "@app/assistant/registry/actions/shared/price"
import { WalletCurrency } from "@app/graphql/generated"
import { DisplayCurrency, toUsdMoneyAmount } from "@app/types/amounts"
import { fakeActionCtx, JMD_PRICE, NOW_MS, USD_PRICE } from "../fakes"

describe("readPrice", () => {
  it("reads the live price in the display currency, and converts with the screens' math", async () => {
    const { ctx, graphql } = fakeActionCtx({ displayCurrency: "JMD" })
    graphql.realtimePrice.mockResolvedValue(JMD_PRICE)

    const { convert, readAt } = await readPrice(ctx)

    expect(graphql.realtimePrice).toHaveBeenCalledWith("JMD")
    expect(readAt).toBe(NOW_MS)
    expect(convert(toUsdMoneyAmount(100), DisplayCurrency)).toEqual({
      amount: 15_700,
      currency: DisplayCurrency,
      currencyCode: "JMD",
    })
    expect(convert(toUsdMoneyAmount(6_300_000), WalletCurrency.Btc).amount).toBe(
      100_000_000,
    )
  })

  it("reads a USD account's price in USD", async () => {
    const { ctx, graphql } = fakeActionCtx({ displayCurrency: "USD" })
    graphql.realtimePrice.mockResolvedValue(USD_PRICE)

    const { convert } = await readPrice(ctx)

    expect(convert(toUsdMoneyAmount(500), DisplayCurrency).amount).toBe(500)
    expect(convert(toUsdMoneyAmount(6_300_000), WalletCurrency.Btc).amount).toBe(
      100_000_000,
    )
  })

  it("refuses a price in another currency than it asked for, or no usable price", async () => {
    const { ctx, graphql } = fakeActionCtx({ displayCurrency: "JMD" })
    graphql.realtimePrice.mockResolvedValueOnce({
      ...JMD_PRICE,
      denominatorCurrency: "USD",
    })
    graphql.realtimePrice.mockResolvedValueOnce({
      ...JMD_PRICE,
      btcSatPrice: { base: 0, offset: 0 },
    })

    await expect(readPrice(ctx)).rejects.toBeInstanceOf(ToolReplyError)
    await expect(readPrice(ctx)).rejects.toBeInstanceOf(ToolReplyError)
  })
})
