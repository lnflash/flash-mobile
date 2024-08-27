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
  setMoneyAmount: (val: MoneyAmount<WalletOrDisplayCurrency>) => void
}

const ConversionAmountError: React.FC<Props> = ({
  fromWalletCurrency,
  formattedBtcBalance,
  formattedUsdBalance,
  btcBalance,
  usdBalance,
  settlementSendAmount,
  moneyAmount,
  setMoneyAmount,
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
  }, [])

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
    }) &&
    convertMoneyAmount
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
    }) &&
    convertMoneyAmount
  ) {
    const convertedBTCBalance = convertMoneyAmount(maxAmount, DisplayCurrency)
    amountFieldError = LL.SendBitcoinScreen.maxAmountConvertError({
      amount: formatDisplayAndWalletAmount({
        displayAmount: convertedBTCBalance,
        walletAmount: maxAmount,
      }),
    })
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
      />
      {amountFieldError && (
        <View style={styles.errorContainer}>
          <Text color={colors.error}>{amountFieldError}</Text>
        </View>
      )}
    </View>
  )
}

export default ConversionAmountError

const useStyles = makeStyles(({ colors }) => ({
  fieldContainer: {
    marginBottom: 20,
  },
  errorContainer: {
    marginTop: 10,
    alignItems: "center",
  },
}))
