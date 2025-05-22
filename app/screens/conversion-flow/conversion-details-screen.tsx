import React, { useState } from "react"
import { ScrollView } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

// components
import {
  ConversionAmountError,
  PercentageAmount,
  SwapWallets,
} from "@app/components/swap-flow"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// hooks
import {
  useBreez,
  usePriceConversion,
  useDisplayCurrency,
  useActivityIndicator,
  useSwap,
} from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// types & utils
import {
  DisplayCurrency,
  MoneyAmount,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
  toWalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { getUsdWallet } from "@app/graphql/wallets-utils"

// gql
import {
  useConversionScreenQuery,
  useRealtimePriceQuery,
  WalletCurrency,
} from "@app/graphql/generated"

type Props = StackScreenProps<RootStackParamList, "conversionDetails">

export const ConversionDetailsScreen: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { zeroDisplayAmount } = useDisplayCurrency()

  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { prepareBtcToUsd, prepareUsdToBtc } = useSwap()

  const [errorMsg, setErrorMsg] = useState<string>()
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

  if (!convertMoneyAmount) return

  const convertedBTCBalance = convertMoneyAmount(btcBalance, DisplayCurrency)
  const convertedUsdBalance = convertMoneyAmount(usdBalance, DisplayCurrency)
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

  const moveToNextScreen = async () => {
    toggleActivityIndicator(true)
    const { data, err } =
      fromWalletCurrency === "USD"
        ? await prepareUsdToBtc(settlementSendAmount)
        : await prepareBtcToUsd(settlementSendAmount)

    if (data) {
      navigation.navigate("conversionConfirmation", {
        ...data,
        fromWalletCurrency,
      })
    } else {
      setErrorMsg(err)
    }
    toggleActivityIndicator(false)
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
        <ConversionAmountError
          fromWalletCurrency={fromWalletCurrency}
          formattedBtcBalance={formattedBtcBalance}
          formattedUsdBalance={formattedUsdBalance}
          btcBalance={btcBalance}
          usdBalance={usdBalance}
          settlementSendAmount={settlementSendAmount}
          moneyAmount={moneyAmount}
          errorMsg={errorMsg}
          setMoneyAmount={setMoneyAmount}
          setErrorMsg={setErrorMsg}
        />
        <PercentageAmount
          fromWalletCurrency={fromWalletCurrency}
          setAmountToBalancePercentage={setAmountToBalancePercentage}
        />
      </ScrollView>
      <PrimaryBtn
        label={LL.common.next()}
        btnStyle={styles.btnStyle}
        disabled={!isValidAmount || !!errorMsg}
        onPress={moveToNextScreen}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  scrollViewContainer: {
    margin: 20,
  },
  btnStyle: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
}))
