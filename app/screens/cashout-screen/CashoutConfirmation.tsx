import React, { useState } from "react"
import { ScrollView } from "react-native"
import { makeStyles } from "@rneui/themed"
import { Text, useTheme } from "@rneui/themed"
import moment from "moment"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { CashoutCard, CashoutFromWallet } from "@app/components/cashout-flow"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useActivityIndicator, useDisplayCurrency } from "@app/hooks"
import { useCashoutScreenQuery, useInitiateCashoutMutation } from "@app/graphql/generated"

//utils
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { toUsdMoneyAmount } from "@app/types/amounts"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "CashoutConfirmation">

const CashoutConfirmation: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { formatMoneyAmount } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [errorMsg, setErrorMsg] = useState<string>()

  const [initiateCashout] = useInitiateCashoutMutation()

  const { data } = useCashoutScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  const {
    walletId,
    offerId,
    expiresAt,
    exchangeRate,
    send,
    receiveUsd,
    receiveJmd,
    flashFee,
  } = route.params?.offer

  const onConfirm = async () => {
    toggleActivityIndicator(true)
    const res = await initiateCashout({ variables: { input: { walletId, offerId } } })
    console.log("RESPONSE>>>>>>>>>>>>", res)
    if (res.data?.initiateCashout.success) {
      navigation.navigate("CashoutSuccess")
    } else {
      setErrorMsg(res.data?.initiateCashout.errors[0].message)
    }
    toggleActivityIndicator(false)
  }

  const formattedSendAmount = formatMoneyAmount({
    moneyAmount: toUsdMoneyAmount(send ?? NaN),
  })

  const formattedReceiveUsdAmount = formatMoneyAmount({
    moneyAmount: toUsdMoneyAmount(receiveUsd ?? NaN),
  })

  const formattedFeeAmount = formatMoneyAmount({
    moneyAmount: toUsdMoneyAmount(flashFee ?? NaN),
  })

  return (
    <Screen>
      <ScrollView style={{ padding: 20 }}>
        <Text type="caption" color={colors.placeholder} style={styles.valid}>
          {LL.Cashout.valid({ time: moment(expiresAt).fromNow(true) })}
        </Text>
        <CashoutFromWallet usdBalance={usdBalance} />
        <CashoutCard title={LL.Cashout.exchangeRate()} detail={`$1/J$${exchangeRate}`} />
        <CashoutCard title={LL.Cashout.sendAmount()} detail={formattedSendAmount} />
        <CashoutCard
          title={LL.Cashout.receiveAmount()}
          detail={`${formattedReceiveUsdAmount} (J$${receiveJmd})`}
        />
        <CashoutCard title={LL.Cashout.fee()} detail={formattedFeeAmount} />
        {!!errorMsg && (
          <Text type="bm" color={colors.red}>
            {errorMsg}
          </Text>
        )}
      </ScrollView>
      <PrimaryBtn
        label={LL.common.confirm()}
        btnStyle={styles.buttonContainer}
        onPress={onConfirm}
      />
    </Screen>
  )
}

export default CashoutConfirmation

const useStyles = makeStyles(({ colors }) => ({
  valid: {
    alignSelf: "center",
    marginBottom: 10,
  },
  buttonContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
}))
