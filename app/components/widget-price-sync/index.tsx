import { useEffect } from "react"

import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { SATS_PER_BTC, usePriceConversion } from "@app/hooks/use-price-conversion"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
import { setWidgetPriceData } from "@app/utils/widget"

/**
 * Keeps the native home-screen widget in sync with the BTC price. Renders
 * nothing; mount it once inside the authed Apollo tree.
 */
export const WidgetPriceSync: React.FC = () => {
  const { convertMoneyAmount } = usePriceConversion()
  const { fractionDigits, fiatSymbol, displayCurrency, moneyAmountToMajorUnitOrSats } =
    useDisplayCurrency()

  // Price of 1 BTC expressed in the display currency's major units.
  const btcPrice = convertMoneyAmount
    ? moneyAmountToMajorUnitOrSats(
        convertMoneyAmount(toBtcMoneyAmount(SATS_PER_BTC), DisplayCurrency),
      )
    : NaN

  useEffect(() => {
    if (!Number.isFinite(btcPrice) || btcPrice <= 0) {
      return
    }
    setWidgetPriceData({
      btcPrice,
      currencyCode: displayCurrency,
      currencySymbol: fiatSymbol,
      fractionDigits,
      timestamp: Math.floor(Date.now() / 1000),
    })
  }, [btcPrice, displayCurrency, fiatSymbol, fractionDigits])

  return null
}
