import React, { useState } from "react"
import { ScrollView, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import moment from "moment"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import {
  CashoutCard,
  CashoutFromWallet,
  CashoutWithdrawTo,
} from "@app/components/topup-cashout-flow"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useActivityIndicator, useDisplayCurrency } from "@app/hooks"
import {
  useBridgeCancelWithdrawalRequestMutation,
  useBridgeInitiateWithdrawalMutation,
  useBridgeWithdrawalRequestQuery,
  useCashoutScreenQuery,
  useInitiateCashoutMutation,
} from "@app/graphql/generated"

// utils
import { getCashWallet } from "@app/graphql/wallets-utils"
import { toUsdMoneyAmount } from "@app/types/amounts"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "CashoutConfirmation">

// The Bridge service fee charged by Flash (0.5%), included in the withdrawal amount.
const FLASH_BRIDGE_FEE_RATE = 0.005

const CashoutConfirmation: React.FC<Props> = (props) => {
  if ("bridgeWithdrawalId" in props.route.params) {
    return <BridgeCashoutConfirmation {...props} />
  }
  return <LocalCashoutConfirmation {...props} />
}

export default CashoutConfirmation

const LocalCashoutConfirmation: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()
  const confirmButtonStyle = React.useMemo(
    () => [styles.confirmButton, { marginBottom: bottom + 10 }],
    [bottom, styles.confirmButton],
  )

  const [errorMsg, setErrorMsg] = useState<string>()

  const [initiateCashout] = useInitiateCashoutMutation()

  const { data } = useCashoutScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  // Narrowed by the dispatcher: this component only renders for the offer variant.
  const params = route.params as Extract<typeof route.params, { offer: unknown }>
  const {
    walletId,
    offerId,
    expiresAt,
    exchangeRate,
    send,
    receiveUsd,
    receiveJmd,
    flashFee,
  } = params.offer

  const onConfirm = async () => {
    toggleActivityIndicator(true)
    const res = await initiateCashout({ variables: { input: { walletId, offerId } } })
    if (res.data?.initiateCashout.id) {
      navigation.navigate("CashoutSuccess")
    } else {
      setErrorMsg(res.data?.initiateCashout.errors[0].message)
    }
    toggleActivityIndicator(false)
  }

  const formattedSendAmount = moneyAmountToDisplayCurrencyString({
    moneyAmount: toUsdMoneyAmount(send ?? NaN),
  })

  const formattedReceiveUsdAmount = moneyAmountToDisplayCurrencyString({
    moneyAmount: toUsdMoneyAmount(receiveUsd ?? NaN),
  })

  const formattedFeeAmount = moneyAmountToDisplayCurrencyString({
    moneyAmount: toUsdMoneyAmount(flashFee ?? NaN),
  })

  return (
    <Screen>
      <ScrollView style={styles.scrollView}>
        <Text type="caption" color={colors.placeholder} style={styles.valid}>
          {LL.Cashout.valid({ time: moment(expiresAt).fromNow(true) })}
        </Text>
        <CashoutFromWallet usdBalance={usdBalance} />
        {exchangeRate && (
          <CashoutCard
            title={LL.Cashout.exchangeRate()}
            detail={`$1/J$${(exchangeRate / 100).toFixed(2)}`}
          />
        )}
        <CashoutCard title={LL.Cashout.sendAmount()} detail={formattedSendAmount} />
        {receiveJmd && (
          <CashoutCard
            title={LL.Cashout.receiveAmount()}
            detail={`${formattedReceiveUsdAmount} (J$${(receiveJmd / 100).toFixed(2)})`}
          />
        )}
        <CashoutCard title={LL.Cashout.fee()} detail={formattedFeeAmount} />
        <CashoutWithdrawTo />
        {Boolean(errorMsg) && (
          <Text type="bm" color={colors.red}>
            {errorMsg}
          </Text>
        )}
      </ScrollView>
      <PrimaryBtn
        label={LL.common.confirm()}
        btnStyle={confirmButtonStyle}
        onPress={onConfirm}
      />
    </Screen>
  )
}

const BridgeCashoutConfirmation: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()
  const actionButtonsStyle = React.useMemo(
    () => [styles.actionButtons, { marginBottom: bottom + 10 }],
    [bottom, styles.actionButtons],
  )

  const [errorMsg, setErrorMsg] = useState<string>()

  // Narrowed by the dispatcher: this component only renders for the bridge variant.
  const params = route.params as Extract<
    typeof route.params,
    { bridgeWithdrawalId: string }
  >
  const { bridgeWithdrawalId, bridgeAccountLabel } = params

  const [initiateWithdrawal] = useBridgeInitiateWithdrawalMutation()
  const [cancelWithdrawal] = useBridgeCancelWithdrawalRequestMutation()

  const { data: cashoutData } = useCashoutScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })
  const usdWallet = getCashWallet(cashoutData?.me?.defaultAccount?.wallets)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  const { data, loading } = useBridgeWithdrawalRequestQuery({
    variables: { id: bridgeWithdrawalId },
    fetchPolicy: "network-only",
  })

  const withdrawal = data?.bridgeWithdrawalRequest
  // Backend amount is a decimal USD-dollar string (e.g. "10.50"); convert to cents.
  const amountCents = Math.round(parseFloat(withdrawal?.amount ?? "0") * 100)
  const feeCents = Math.round(amountCents * FLASH_BRIDGE_FEE_RATE)

  const formattedAmount = moneyAmountToDisplayCurrencyString({
    moneyAmount: toUsdMoneyAmount(amountCents),
  })
  const formattedFee = moneyAmountToDisplayCurrencyString({
    moneyAmount: toUsdMoneyAmount(feeCents),
  })

  const onConfirm = async () => {
    setErrorMsg(undefined)
    toggleActivityIndicator(true)
    try {
      const res = await initiateWithdrawal({
        variables: { input: { withdrawalId: bridgeWithdrawalId } },
      })
      const errors = res.data?.bridgeInitiateWithdrawal.errors
      if (errors?.length) {
        setErrorMsg(errors[0].message)
        return
      }
      navigation.navigate("CashoutSuccess")
    } finally {
      toggleActivityIndicator(false)
    }
  }

  const onCancel = async () => {
    setErrorMsg(undefined)
    toggleActivityIndicator(true)
    try {
      await cancelWithdrawal({
        variables: { input: { withdrawalId: bridgeWithdrawalId } },
      })
    } finally {
      toggleActivityIndicator(false)
      navigation.goBack()
    }
  }

  return (
    <Screen>
      <ScrollView style={styles.scrollView}>
        <CashoutFromWallet usdBalance={usdBalance} />
        <CashoutCard
          title={LL.Cashout.sendAmount()}
          detail={loading ? "…" : formattedAmount}
        />
        <CashoutCard
          title={LL.Cashout.fee()}
          detail={loading ? "…" : `${formattedFee} (0.5%)`}
        />
        {Boolean(bridgeAccountLabel) && (
          <CashoutCard title={LL.Cashout.withdrawTo()} detail={bridgeAccountLabel} />
        )}
        {Boolean(errorMsg) && (
          <Text type="bm" color={colors.red}>
            {errorMsg}
          </Text>
        )}
      </ScrollView>
      <View style={actionButtonsStyle}>
        <PrimaryBtn
          label={LL.common.confirm()}
          disabled={loading || !withdrawal}
          onPress={onConfirm}
        />
        <PrimaryBtn type="outline" label={LL.common.cancel()} onPress={onCancel} />
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  scrollView: {
    padding: 20,
  },
  valid: {
    alignSelf: "center",
    marginBottom: 10,
  },
  confirmButton: {
    marginHorizontal: 20,
  },
  actionButtons: {
    marginHorizontal: 20,
    rowGap: 10,
  },
}))
