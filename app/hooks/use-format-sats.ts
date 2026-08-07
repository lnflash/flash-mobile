import { useCallback } from "react"

import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"

import { useDisplayCurrency } from "./use-display-currency"
import { usePriceConversion } from "./use-price-conversion"

/**
 * Format a sat amount as display currency + wallet amount (e.g.
 * "$97.03 (150,000 sats)"), falling back to a plain sat string while the
 * price feed is unavailable. Shared by the send screens' fee/limit messages.
 */
export const useFormatSats = (): ((sats: number) => string) => {
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  return useCallback(
    (sats: number): string => {
      const walletAmount = toBtcMoneyAmount(sats)
      return convertMoneyAmount
        ? formatDisplayAndWalletAmount({
            displayAmount: convertMoneyAmount(walletAmount, DisplayCurrency),
            walletAmount,
          })
        : `${sats} sats`
    },
    [convertMoneyAmount, formatDisplayAndWalletAmount],
  )
}
