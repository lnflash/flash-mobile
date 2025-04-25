import React from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"

// assets
import Cash from "@app/assets/icons/cash.svg"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// types
import { DisplayCurrency, UsdMoneyAmount } from "@app/types/amounts"

type Props = {
  usdBalance: UsdMoneyAmount
}

const CashoutFromWallet: React.FC<Props> = ({ usdBalance }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  if (!convertMoneyAmount) return

  const convertedUsdBalance = convertMoneyAmount(usdBalance, DisplayCurrency)
  const formattedUsdBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedUsdBalance,
    walletAmount: usdBalance,
  })

  return (
    <View>
      <Text type="bl" bold>
        {LL.common.from()}
      </Text>
      <View style={styles.wallet}>
        <Cash />
        <View style={styles.details}>
          <Text type="h01" bold>
            {LL.common.usdAccount()}
          </Text>
          <Text type="bl">{formattedUsdBalance}</Text>
        </View>
      </View>
    </View>
  )
}

export default CashoutFromWallet

const useStyles = makeStyles(({ colors }) => ({
  wallet: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    marginTop: 5,
    marginBottom: 15,
    padding: 15,
    backgroundColor: colors.grey5,
  },
  details: {
    marginLeft: 10,
  },
}))
