import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { BreezFeeError } from "./fee-errors"

/**
 * User-facing message for a typed fee-estimation error. `formatSats` converts
 * a sat amount into the caller's display format (e.g. "$97.00 (150,000 sats)").
 * Only insufficient-funds errors mention balance; everything else states what
 * actually failed.
 */
export const breezFeeErrorMessage = (
  err: BreezFeeError,
  LL: TranslationFunctions,
  formatSats: (sats: number) => string,
): string => {
  switch (err.kind) {
    case "amount-above-max":
      return LL.SendBitcoinScreen.maxReceiveAmountError({
        amount: formatSats(err.maxSats),
      })
    case "amount-below-min":
      return LL.SendBitcoinScreen.minReceiveAmountError({
        amount: formatSats(err.minSats),
      })
    case "insufficient-funds":
      return LL.SendBitcoinScreen.insufficientBalanceForFee()
    case "network":
      return LL.SendBitcoinScreen.feeFetchNetworkError()
    default:
      return LL.SendBitcoinScreen.feeFetchFailed()
  }
}
