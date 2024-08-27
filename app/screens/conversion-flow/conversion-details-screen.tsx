import React, { useState } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "@app/components/screen"
import { AmountInput } from "@app/components/amount-input"
import { PercentageAmount, SwapWallets } from "@app/components/swap-flow"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"

// hooks
import { useBreez, usePriceConversion, useDisplayCurrency } from "@app/hooks"

// types & utils
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  DisplayCurrency,
  lessThan,
  MoneyAmount,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
  toWalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"

// gql
import {
  useConversionScreenQuery,
  useRealtimePriceQuery,
  WalletCurrency,
} from "@app/graphql/generated"
import { getUsdWallet } from "@app/graphql/wallets-utils"

type Props = StackScreenProps<RootStackParamList, "conversionDetails">

export const ConversionDetailsScreen: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { zeroDisplayAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()
  const { btcWallet } = useBreez()

  const [fromWalletCurrency, setFromWalletCurrency] = useState<WalletCurrency>("BTC")
  const [moneyAmount, setMoneyAmount] =
    useState<MoneyAmount<WalletOrDisplayCurrency>>(zeroDisplayAmount)

  useRealtimePriceQuery({
    fetchPolicy: "network-only",
  })

  const { data } = useConversionScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const btcBalance = toBtcMoneyAmount(btcWallet?.balance ?? NaN)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  // @ts-ignore: Unreachable code error
  const convertedBTCBalance = convertMoneyAmount(btcBalance, DisplayCurrency) // @ts-ignore: Unreachable code error
  const convertedUsdBalance = convertMoneyAmount(usdBalance, DisplayCurrency) // @ts-ignore: Unreachable code error
  const settlementSendAmount = convertMoneyAmount(moneyAmount, fromWalletCurrency)

  const formattedBtcBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedBTCBalance,
    walletAmount: btcBalance,
  })
  const formattedUsdBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedUsdBalance,
    walletAmount: usdBalance,
  })

  const fromWalletBalance = fromWalletCurrency === "BTC" ? btcBalance : usdBalance

  const isValidAmount =
    settlementSendAmount.amount > 0 &&
    settlementSendAmount.amount <= fromWalletBalance.amount

  const canToggleWallet =
    fromWalletCurrency === "BTC" ? usdBalance.amount > 0 : btcBalance.amount > 0

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

  const setAmountToBalancePercentage = (percentage: number) => {
    const fromBalance =
      fromWalletCurrency === WalletCurrency.Btc ? btcBalance.amount : usdBalance.amount

    setMoneyAmount(
      toWalletAmount({
        amount: Math.round((fromBalance * percentage) / 100),
        currency: fromWalletCurrency,
      }),
    )
  }

  const moveToNextScreen = () => {
    if (usdWallet && btcWallet) {
      navigation.navigate("conversionConfirmation", {
        toWallet: fromWalletCurrency === "BTC" ? usdWallet : btcWallet,
        fromWallet: fromWalletCurrency === "BTC" ? btcWallet : usdWallet,
        moneyAmount: settlementSendAmount,
      })
    }
  }

  return (
    <Screen preset="fixed">
      <ScrollView style={styles.scrollViewContainer}>
        <SwapWallets
          fromWalletCurrency={fromWalletCurrency}
          formattedBtcBalance={formattedBtcBalance}
          formattedUsdBalance={formattedUsdBalance}
          canToggleWallet={canToggleWallet}
          setFromWalletCurrency={setFromWalletCurrency}
        />
        <View style={styles.fieldContainer}>
          <AmountInput
            unitOfAccountAmount={moneyAmount}
            walletCurrency={fromWalletCurrency}
            setAmount={setMoneyAmount}
            convertMoneyAmount={convertMoneyAmount as keyof typeof convertMoneyAmount}
          />
          {amountFieldError && (
            <View style={styles.errorContainer}>
              <Text color={colors.error}>{amountFieldError}</Text>
            </View>
          )}
        </View>
        <PercentageAmount setAmountToBalancePercentage={setAmountToBalancePercentage} />
      </ScrollView>
      <GaloyPrimaryButton
        title={LL.common.next()}
        containerStyle={styles.buttonContainer}
        disabled={!isValidAmount}
        onPress={moveToNextScreen}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  scrollViewContainer: {
    flex: 1,
    flexDirection: "column",
    margin: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  buttonContainer: { marginHorizontal: 20, marginBottom: 20 },
  errorContainer: {
    marginTop: 10,
    alignItems: "center",
  },
}))
