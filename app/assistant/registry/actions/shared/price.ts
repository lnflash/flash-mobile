import {
  ConvertMoneyAmountFn,
  createConvertMoneyAmount,
  priceOfCurrencyInCurrencyFor,
} from "@app/utils/price-conversion"
import type { ActionToolCtx } from "../../types"
import { ToolReplyError } from "./errors"

/** A price an action converted its amounts at, and when it was read. */
export type PriceRead = {
  convert: ConvertMoneyAmountFn
  /** Epoch ms, taken before the read: a rate-dependent amount holds RATE_TTL_MS from it. */
  readAt: number
}

/**
 * Read the live price in the display currency, from the network, and the
 * conversion over it: the same math the screens convert with
 * (app/utils/price-conversion.ts). The card's amounts and the payment's
 * settlement amount both come from this one read.
 */
export const readPrice = async (
  ctx: Pick<ActionToolCtx, "graphql" | "displayCurrency" | "now">,
): Promise<PriceRead> => {
  const readAt = ctx.now()
  const price = await ctx.graphql.realtimePrice(ctx.displayCurrency)
  const table = priceOfCurrencyInCurrencyFor(price)
  // A price in another currency than the one asked for would convert every
  // display amount to NaN: refuse it rather than show one.
  if (!table || price.denominatorCurrency !== ctx.displayCurrency) {
    throw new ToolReplyError("Assistant.toolFailed")
  }
  return {
    convert: createConvertMoneyAmount({
      priceOfCurrencyInCurrency: table,
      displayCurrency: ctx.displayCurrency,
    }),
    readAt,
  }
}
