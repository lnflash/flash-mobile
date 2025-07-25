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
  const settlementAmount = paymentDetail.settlementAmount
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

  if (
    moneyAmountIsCurrencyType(settlementAmount, WalletCurrency.Usd) &&
    paymentDetail.paymentType === PaymentType.Onchain &&
    lessThan({
      value: settlementAmount,
      lessThan: toUsdMoneyAmount(200),
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
      lessThan: toBtcMoneyAmount(5500),
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
