import React, { useEffect, useState } from "react"
import { useI18nContext } from "@app/i18n/i18n-react"
import { View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { AmountInput } from "../amount-input"

// types
import {
  BtcMoneyAmount,
  DisplayCurrency,
  greaterThan,
  isNonZeroMoneyAmount,
  lessThan,
  MoneyAmount,
  UsdMoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { WalletCurrency } from "@app/graphql/generated"

// hooks
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// breez-sdk
import { fetchBreezLightningLimits } from "@app/utils/breez-sdk-liquid"

type Props = {
  fromWalletCurrency: WalletCurrency
  formattedBtcBalance: string
  formattedUsdBalance: string
  btcBalance: BtcMoneyAmount
  usdBalance: UsdMoneyAmount
  settlementSendAmount: MoneyAmount<WalletCurrency>
  moneyAmount: MoneyAmount<WalletOrDisplayCurrency>
  errorMsg?: string
  setMoneyAmount: (val: MoneyAmount<WalletOrDisplayCurrency>) => void
  setErrorMsg: (val?: string) => void
}

const ConversionAmountError: React.FC<Props> = ({
  fromWalletCurrency,
  formattedBtcBalance,
  formattedUsdBalance,
  btcBalance,
  usdBalance,
  settlementSendAmount,
  moneyAmount,
  errorMsg,
  setMoneyAmount,
  setErrorMsg,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const [minAmount, setMinAmount] = useState<MoneyAmount<WalletCurrency>>()
  const [maxAmount, setMaxAmount] = useState<MoneyAmount<WalletCurrency>>()

  // @ts-ignore: Unreachable code error
  const convertedSettlementSendAmount = convertMoneyAmount(settlementSendAmount, "BTC")

  useEffect(() => {
    fetchMinMaxAmount()
  }, [fromWalletCurrency])

  const fetchMinMaxAmount = async () => {
    const limits = await fetchBreezLightningLimits()

    setMinAmount({
      amount: fromWalletCurrency === "BTC" ? limits?.send.minSat : limits.receive.minSat,
      currency: "BTC",
      currencyCode: "SAT",
    })
    setMaxAmount({
      amount: fromWalletCurrency === "BTC" ? limits?.send.maxSat : limits.receive.maxSat,
      currency: "BTC",
      currencyCode: "SAT",
    })
  }

  useEffect(() => {
    checkErrorMessage()
  }, [
    fromWalletCurrency,
    settlementSendAmount.amount,
    btcBalance.amount,
    usdBalance.amount,
    minAmount,
    maxAmount,
  ])

  const checkErrorMessage = () => {
    if (!convertMoneyAmount) return null
    let amountFieldError: string | undefined = undefined
    if (
      lessThan({
        value: fromWalletCurrency === "BTC" ? btcBalance : usdBalance,
        lessThan: settlementSendAmount,
      })
    ) {
      amountFieldError = LL.SendBitcoinScreen.amountExceed({
        balance: fromWalletCurrency === "BTC" ? formattedBtcBalance : formattedUsdBalance,
      })
    } else if (
      minAmount &&
      isNonZeroMoneyAmount(convertedSettlementSendAmount) &&
      lessThan({
        value: convertedSettlementSendAmount,
        lessThan: minAmount,
      })
    ) {
      const convertedBTCBalance = convertMoneyAmount(minAmount, DisplayCurrency)
      amountFieldError = LL.SendBitcoinScreen.minAmountConvertError({
        amount: formatDisplayAndWalletAmount({
          displayAmount: convertedBTCBalance,
          walletAmount: minAmount,
        }),
      })
    } else if (
      maxAmount &&
      isNonZeroMoneyAmount(convertedSettlementSendAmount) &&
      greaterThan({
        value: convertedSettlementSendAmount,
        greaterThan: maxAmount,
      })
    ) {
      const convertedBTCBalance = convertMoneyAmount(maxAmount, DisplayCurrency)
      amountFieldError = LL.SendBitcoinScreen.maxAmountConvertError({
        amount: formatDisplayAndWalletAmount({
          displayAmount: convertedBTCBalance,
          walletAmount: maxAmount,
        }),
      })
    }
    setErrorMsg(amountFieldError)
  }

  return (
    <View style={styles.fieldContainer}>
      <AmountInput
        unitOfAccountAmount={moneyAmount}
        walletCurrency={fromWalletCurrency}
        setAmount={setMoneyAmount}
        convertMoneyAmount={convertMoneyAmount as keyof typeof convertMoneyAmount}
        minAmount={minAmount}
        maxAmount={maxAmount}
        title="Convert"
      />
      {errorMsg && (
        <Text style={styles.errMsg} color={colors.error}>
          {errorMsg}
        </Text>
      )}
    </View>
  )
}

export default ConversionAmountError

const useStyles = makeStyles(({ colors }) => ({
  fieldContainer: {
    marginBottom: 20,
  },
  errMsg: {
    marginTop: 10,
  },
}))
