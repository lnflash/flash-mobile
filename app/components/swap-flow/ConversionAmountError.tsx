import React, { useEffect } from "react"
import { View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { AmountInput } from "../amount-input"

// types
import {
  BtcMoneyAmount,
  lessThan,
  MoneyAmount,
  UsdMoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { WalletCurrency } from "@app/graphql/generated"

// hooks
import { usePriceConversion } from "@app/hooks"

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

  useEffect(() => {
    checkErrorMessage()
  }, [fromWalletCurrency, settlementSendAmount.amount])

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
