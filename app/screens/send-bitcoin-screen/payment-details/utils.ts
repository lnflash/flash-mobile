import { WalletCurrency } from "@app/graphql/generated"
import {
  AmountInvalidReason,
  AmountStatus,
  LimitType,
  PaymentDetail,
} from "./index.types"
import {
  BtcMoneyAmount,
  UsdMoneyAmount,
  greaterThan,
  isNonZeroMoneyAmount,
  lessThan,
  moneyAmountIsCurrencyType,
  toUsdMoneyAmount,
  toBtcMoneyAmount,
} from "@app/types/amounts"
import { PaymentType } from "@galoymoney/client"
import { ONCHAIN_MIN_SEND_CENTS, ONCHAIN_MIN_SEND_SATS } from "../onchain-speed-options"

export const isValidAmount = ({
  paymentDetail,
  usdWalletAmount,
  btcWalletAmount,
  withdrawalLimits,
  intraledgerLimits,
  isFromFlashcard,
}: {
  paymentDetail?: PaymentDetail<WalletCurrency>
  usdWalletAmount: UsdMoneyAmount
  btcWalletAmount: BtcMoneyAmount
  withdrawalLimits?: readonly {
    readonly __typename: "OneDayAccountLimit"
    readonly totalLimit: number
    readonly remainingLimit?: number | null
    readonly interval?: number | null
  }[]
  intraledgerLimits?: readonly {
    readonly __typename: "OneDayAccountLimit"
    readonly totalLimit: number
    readonly remainingLimit?: number | null
    readonly interval?: number | null
  }[]
  isFromFlashcard?: boolean
}): AmountStatus => {
  if (!paymentDetail || !isNonZeroMoneyAmount(paymentDetail.settlementAmount)) {
    return {
      validAmount: false,
      invalidReason: AmountInvalidReason.NoAmount,
    } as const
  }
  // Both Cash Account currencies use cents. Keep the original currency on the
  // payment detail for dispatch, but validate USD and USDT against the cash balance.
  const settlementAmount =
    paymentDetail.settlementAmount.currency === WalletCurrency.Usdt
      ? toUsdMoneyAmount(paymentDetail.settlementAmount.amount)
      : paymentDetail.settlementAmount
  if (
    moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Btc) &&
    greaterThan({
      value: settlementAmount,
      greaterThan: btcWalletAmount,
    })
  ) {
    return {
      validAmount: false,
      invalidReason: AmountInvalidReason.InsufficientBalance,
      balance: btcWalletAmount,
    }
  }

  if (
    moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Usd) &&
    greaterThan({
      value: settlementAmount,
      greaterThan: usdWalletAmount,
    })
  ) {
    return {
      validAmount: false,
      invalidReason: AmountInvalidReason.InsufficientBalance,
      balance: usdWalletAmount,
    }
  }

  // A request that fixes the sats is sent from the Cash Account as sats, and
  // the server refuses fewer than 5,500 of them.
  if (
    moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Usd) &&
    paymentDetail.paymentType === PaymentType.Onchain &&
    paymentDetail.destinationSpecifiedAmount &&
    lessThan({
      value: paymentDetail.destinationSpecifiedAmount,
      lessThan: toBtcMoneyAmount(ONCHAIN_MIN_SEND_SATS),
    })
  ) {
    return {
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainSatLimit,
    }
  }

  if (
    moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Usd) &&
    paymentDetail.paymentType === PaymentType.Onchain &&
    lessThan({
      value: settlementAmount,
      lessThan: toUsdMoneyAmount(ONCHAIN_MIN_SEND_CENTS),
    })
  ) {
    return {
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainLimit,
    }
  }

  if (
    moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Btc) &&
    paymentDetail.paymentType === PaymentType.Onchain &&
    lessThan({
      value: settlementAmount,
      lessThan: toBtcMoneyAmount(ONCHAIN_MIN_SEND_SATS),
    })
  ) {
    return {
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainSatLimit,
    }
  }

  // Flashcard-specific minimum validation (100 sats)
  if (
    isFromFlashcard &&
    moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Btc) &&
    lessThan({
      value: settlementAmount,
      lessThan: toBtcMoneyAmount(100),
    })
  ) {
    return {
      validAmount: false,
      invalidReason: AmountInvalidReason.MinFlashcardLimit,
    }
  }

  const usdAmount = paymentDetail.convertMoneyAmount(
    paymentDetail.unitOfAccountAmount,
    WalletCurrency.Usd,
  )

  if (paymentDetail.paymentType === PaymentType.Intraledger) {
    for (const intraledgerLimit of intraledgerLimits || []) {
      const remainingIntraledgerLimit = intraledgerLimit.remainingLimit
        ? toUsdMoneyAmount(intraledgerLimit.remainingLimit)
        : undefined
      if (
        remainingIntraledgerLimit &&
        greaterThan({
          value: usdAmount,
          greaterThan: remainingIntraledgerLimit,
        })
      ) {
        return {
          validAmount: false,
          invalidReason: AmountInvalidReason.InsufficientLimit,
          remainingLimit: remainingIntraledgerLimit,
          limitType: LimitType.Intraledger,
        }
      }
    }
  } else {
    for (const withdrawalLimit of withdrawalLimits || []) {
      const remainingWithdrawalLimit = withdrawalLimit.remainingLimit
        ? toUsdMoneyAmount(withdrawalLimit.remainingLimit)
        : undefined
      if (
        remainingWithdrawalLimit &&
        greaterThan({
          value: usdAmount,
          greaterThan: remainingWithdrawalLimit,
        })
      ) {
        return {
          validAmount: false,
          invalidReason: AmountInvalidReason.InsufficientLimit,
          remainingLimit: remainingWithdrawalLimit,
          limitType: LimitType.Withdrawal,
        }
      }
    }
  }

  return {
    validAmount: true,
  }
}
