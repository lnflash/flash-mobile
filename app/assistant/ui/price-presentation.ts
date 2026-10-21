import { WalletCurrency } from "@app/graphql/generated"
import type { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { SATS_PER_BTC } from "@app/hooks/use-price-conversion"
import { toDisplayAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { priceOfCurrencyInCurrencyFor } from "@app/utils/price-conversion"
import type { PricePayload } from "../registry/projections"
export type PriceDisplay = Pick<
  ReturnType<typeof useDisplayCurrency>,
  "displayCurrency" | "formatMoneyAmount" | "formatCurrency"
>
/** The same conversion/formatting for the visible quote and its spoken narration. */
export const pricePresentation = (
  payload: PricePayload,
  display: PriceDisplay,
): string | undefined => {
  const table = priceOfCurrencyInCurrencyFor(payload)
  if (!table) return undefined
  const perBitcoin = table(WalletCurrency.Btc, "DisplayCurrency") * SATS_PER_BTC
  return payload.currency === display.displayCurrency
    ? display.formatMoneyAmount({
        moneyAmount: toDisplayAmount({
          amount: perBitcoin,
          currencyCode: payload.currency,
        }),
      })
    : payload.currency === WalletCurrency.Usd
    ? display.formatMoneyAmount({ moneyAmount: toUsdMoneyAmount(perBitcoin) })
    : display.formatCurrency({
        amountInMajorUnits: perBitcoin / 100,
        currency: payload.currency,
      })
}
