import React, { useState } from "react"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { ScrollView } from "react-native-gesture-handler"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { AmountInput } from "@app/components/amount-input"
import { CashoutFromWallet, CashoutPercentage } from "@app/components/cashout-flow"

// hooks
import { useCashoutScreenQuery, useRequestCashoutMutation } from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useActivityIndicator, useDisplayCurrency, usePriceConversion } from "@app/hooks"

// utils
import {
  MoneyAmount,
  toUsdMoneyAmount,
  toWalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { View } from "react-native"
import { PrimaryBtn } from "@app/components/buttons"

type Props = StackScreenProps<RootStackParamList, "CashoutDetails">

const CashoutDetails = ({ navigation }: Props) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { zeroDisplayAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [errorMsg, setErrorMsg] = useState<string>()
  const [moneyAmount, setMoneyAmount] =
    useState<MoneyAmount<WalletOrDisplayCurrency>>(zeroDisplayAmount)

  const [requestCashout] = useRequestCashoutMutation()

  const { data } = useCashoutScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  if (!convertMoneyAmount) {
    return
  }

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)
  const settlementSendAmount = convertMoneyAmount(moneyAmount, "USD")
  const isValidAmount =
    settlementSendAmount.amount > 0 && settlementSendAmount.amount <= usdBalance.amount

  const onNext = async () => {
    if (usdWallet) {
      toggleActivityIndicator(true)
      const res = await requestCashout({
        variables: {
          input: { walletId: usdWallet.id, usdAmount: settlementSendAmount.amount },
        },
      })
      console.log("Response: ", res.data?.requestCashout)
      if (res.data?.requestCashout.offer) {
        navigation.navigate("CashoutConfirmation", {
          offer: res.data.requestCashout.offer,
        })
      } else {
        setErrorMsg(res.data?.requestCashout.errors[0].message)
      }

      toggleActivityIndicator(false)
    }
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
        <CashoutFromWallet usdBalance={usdBalance} />
        <View>
          <Text type="bl" bold style={{ marginBottom: 5 }}>
            {LL.SendBitcoinScreen.amount()}
          </Text>
          <AmountInput
            unitOfAccountAmount={moneyAmount}
            walletCurrency={"USD"}
            setAmount={setMoneyAmount}
            convertMoneyAmount={convertMoneyAmount}
            minAmount={{ amount: 1, currency: "USD", currencyCode: "USD" }}
            maxAmount={{
              amount: usdBalance.amount,
              currency: "USD",
              currencyCode: "USD",
            }}
          />
        </View>
        <CashoutPercentage setAmountToBalancePercentage={setAmountToBalancePercentage} />
        {!!errorMsg && (
          <Text type="bm" color={colors.red}>
            {errorMsg}
          </Text>
        )}
      </ScrollView>
      <PrimaryBtn
        label={LL.common.next()}
        btnStyle={styles.buttonContainer}
        disabled={!isValidAmount}
        onPress={onNext}
      />
    </Screen>
  )
}

export default CashoutDetails

const useStyles = makeStyles(() => ({
  scrollViewContainer: {
    flex: 1,
    flexDirection: "column",
    margin: 20,
  },
  buttonContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
}))
