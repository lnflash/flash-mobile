import React from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"

// hooks
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// types
import { DisplayCurrency, MoneyAmount, UsdMoneyAmount } from "@app/types/amounts"

type Props = {
  usdBalance: UsdMoneyAmount
  convertedUsdBalance: MoneyAmount<DisplayCurrency>
}

const CashoutFromWallet: React.FC<Props> = ({ usdBalance, convertedUsdBalance }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const formattedUsdBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedUsdBalance,
    walletAmount: usdBalance,
  })

  return (
    <View style={styles.fromFieldContainer}>
      <View style={styles.walletSelectorInfoContainer}>
        <Text
          style={styles.walletCurrencyText}
        >{`${LL.common.from()} ${LL.common.usdAccount()}`}</Text>
        <View style={styles.walletSelectorBalanceContainer}>
          <Text>{formattedUsdBalance}</Text>
        </View>
      </View>
    </View>
  )
}

export default CashoutFromWallet

const useStyles = makeStyles(({ colors }) => ({
  fromFieldContainer: {
    flexDirection: "row",
    backgroundColor: colors.grey5,
    borderRadius: 10,
    marginBottom: 15,
    padding: 15,
  },
  walletSelectorInfoContainer: {
    flex: 1,
    flexDirection: "column",
  },
  walletCurrencyText: {
    fontWeight: "bold",
    fontSize: 18,
  },
  walletSelectorBalanceContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
  },
}))
