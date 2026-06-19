import { WalletCurrency } from "@app/graphql/generated"
import { displayCurrencyCode } from "@app/utils/currency-display"
import { makeStyles, useTheme } from "@rneui/themed"
import React, { FC } from "react"
import { Text, View } from "react-native"

type CurrencyTagProps = {
  walletCurrency: WalletCurrency
}

type CurrencyStyle = {
  backgroundColor: string
  textColor: string
}

export const CurrencyTag: FC<CurrencyTagProps> = ({ walletCurrency }) => {
  const {
    theme: { colors },
  } = useTheme()

  const currencyStyling: Record<WalletCurrency, CurrencyStyle> = {
    [WalletCurrency.Btc]: {
      textColor: colors.white,
      backgroundColor: colors.primary,
    },
    [WalletCurrency.Usd]: {
      textColor: colors.black,
      backgroundColor: colors.green,
    },
    [WalletCurrency.Usdt]: {
      textColor: colors.black,
      backgroundColor: colors.green,
    },
  }

  const styles = useStyles(currencyStyling[walletCurrency])

  return (
    <View style={styles.currencyTag}>
      <Text style={styles.currencyText}>{displayCurrencyCode(walletCurrency)}</Text>
    </View>
  )
}

const useStyles = makeStyles((_, currencyStyle: CurrencyStyle) => ({
  currencyTag: {
    borderRadius: 10,
    height: 30,
    width: 50,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: currencyStyle.backgroundColor,
  },
  currencyText: {
    fontSize: 12,
    color: currencyStyle.textColor,
  },
}))
