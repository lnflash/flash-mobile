import React, { useState } from "react"
import { makeStyles, Text } from "@rneui/themed"
import { ScrollView } from "react-native-gesture-handler"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { AmountInput } from "@app/components/amount-input"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { CashoutFromWallet, CashoutPercentage } from "@app/components/cashout-flow"

// hooks
import { useCashoutScreenQuery } from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  useActivityIndicator,
  useCashout,
  useDisplayCurrency,
  usePriceConversion,
} from "@app/hooks"

// utils
import {
  DisplayCurrency,
  MoneyAmount,
  toUsdMoneyAmount,
  toWalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { getUsdWallet } from "@app/graphql/wallets-utils"

type Props = StackScreenProps<RootStackParamList, "CashoutDetails">

const CashoutDetails = ({ navigation }: Props) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { zeroDisplayAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()
  const { onCashout } = useCashout()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [errorMsg, setErrorMsg] = useState<string>()
  const [moneyAmount, setMoneyAmount] =
    useState<MoneyAmount<WalletOrDisplayCurrency>>(zeroDisplayAmount)

  const { data } = useCashoutScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  if (!convertMoneyAmount) {
    return
  }

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)
  const convertedUsdBalance = convertMoneyAmount(usdBalance, DisplayCurrency)
  const isValidAmount = moneyAmount.amount > 0 && moneyAmount.amount <= usdBalance.amount

  const onConfirm = async () => {
    if (usdWallet) {
      toggleActivityIndicator(true)
      const res = await onCashout(usdWallet?.id, moneyAmount.amount)
      toggleActivityIndicator(false)
      if (res?.status === "SUCCESS") {
        navigation.navigate("sendBitcoinSuccess")
      } else {
        setErrorMsg(res?.errors[0].message)
      }
    }
  }

  const setAmount = (amount: MoneyAmount<WalletOrDisplayCurrency>) => {
    setMoneyAmount(convertMoneyAmount(amount, "USD"))
  }

  const setAmountToBalancePercentage = (percentage: number) => {
    setMoneyAmount(
      toWalletAmount({
        amount: Math.round((usdBalance.amount * percentage) / 100),
        currency: "USD",
      }),
    )
  }

  return (
    <Screen>
      <ScrollView style={styles.scrollViewContainer}>
        <CashoutFromWallet
          usdBalance={usdBalance}
          convertedUsdBalance={convertedUsdBalance}
        />
        <AmountInput
          unitOfAccountAmount={moneyAmount}
          walletCurrency={"USD"}
          setAmount={setAmount}
          convertMoneyAmount={convertMoneyAmount}
          minAmount={{ amount: 1, currency: "USD", currencyCode: "USD" }}
          maxAmount={{ amount: usdBalance.amount, currency: "USD", currencyCode: "USD" }}
        />
        <CashoutPercentage
          fromWalletCurrency={"USD"}
          setAmountToBalancePercentage={setAmountToBalancePercentage}
        />
        {!!errorMsg && <Text style={styles.errorMsg}>{errorMsg}</Text>}
      </ScrollView>
      <GaloyPrimaryButton
        title={LL.common.confirm()}
        containerStyle={styles.buttonContainer}
        disabled={!isValidAmount}
        onPress={onConfirm}
      />
    </Screen>
  )
}

export default CashoutDetails

const useStyles = makeStyles(({ colors }) => ({
  scrollViewContainer: {
    flex: 1,
    flexDirection: "column",
    margin: 20,
  },
  buttonContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  errorMsg: {
    fontSize: 14,
    color: colors.red,
  },
}))
