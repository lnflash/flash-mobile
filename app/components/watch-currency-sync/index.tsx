import { useEffect } from "react"

import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { setWatchCurrency } from "@app/utils/watch"

/**
 * Keeps the paired Apple Watch in sync with the user's display currency. Renders
 * nothing; mount it once inside the authed Apollo tree (alongside the price
 * updates). The watch fetches the BTC price itself, so only the currency
 * preference is pushed. No-op on Android / when no watch is paired.
 */
export const WatchCurrencySync: React.FC = () => {
  const { fractionDigits, fiatSymbol, displayCurrency } = useDisplayCurrency()

  useEffect(() => {
    if (!displayCurrency) {
      return
    }
    setWatchCurrency({
      currencyCode: displayCurrency,
      currencySymbol: fiatSymbol,
      fractionDigits,
    })
  }, [displayCurrency, fiatSymbol, fractionDigits])

  return null
}
