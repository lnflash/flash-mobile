import React, { useState } from "react"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { ScrollView } from "react-native-gesture-handler"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { AmountInput } from "@app/components/amount-input"
import { CashoutFromWallet, CashoutPercentage } from "@app/components/topup-cashout-flow"

// hooks
import {
  useBankAccountsQuery,
  useBridgeExternalAccountsQuery,
  useBridgeRequestWithdrawalMutation,
  useCashoutScreenQuery,
  useRequestCashoutMutation,
  WalletCurrency,
} from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useActivityIndicator, useDisplayCurrency, usePriceConversion } from "@app/hooks"

// utils
import {
  MoneyAmount,
  toUsdMoneyAmount,
  toWalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { getCashWallet } from "@app/graphql/wallets-utils"
import { View } from "react-native"
import { PrimaryBtn } from "@app/components/buttons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { loadDefaultWithdrawAccountId } from "@app/screens/settings-screen/bank-accounts/default-account-store"

type Props = StackScreenProps<RootStackParamList, "CashoutDetails">

const CashoutDetails = ({ navigation, route }: Props) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { bottom } = useSafeAreaInsets()
  const nextButtonStyle = React.useMemo(
    () => [styles.nextButton, { marginBottom: bottom + 10 }],
    [bottom, styles.nextButton],
  )
  const { LL } = useI18nContext()
  const { zeroDisplayAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()
  const { toggleActivityIndicator } = useActivityIndicator()

  const { type } = route.params
  const isBridge = type === "bridge"

  const [errorMsg, setErrorMsg] = useState<string>()
  const [moneyAmount, setMoneyAmount] =
    useState<MoneyAmount<WalletOrDisplayCurrency>>(zeroDisplayAmount)

  const [requestCashout] = useRequestCashoutMutation()
  const [bridgeRequestWithdrawal] = useBridgeRequestWithdrawalMutation()

  const { data: bankAccountsData, loading: bankLoading } = useBankAccountsQuery({
    fetchPolicy: "network-only",
    skip: isBridge,
  })

  const { data: externalAccountsData, loading: bridgeLoading } =
    useBridgeExternalAccountsQuery({
      fetchPolicy: "network-only",
      skip: !isBridge,
    })

  const { data } = useCashoutScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  if (!convertMoneyAmount) {
    return null
  }

  const usdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)
  const settlementSendAmount = convertMoneyAmount(moneyAmount, WalletCurrency.Usd)
  const accountsLoading = isBridge ? bridgeLoading : bankLoading
  const isValidAmount =
    settlementSendAmount.amount > 0 &&
    settlementSendAmount.amount <= usdBalance.amount &&
    !accountsLoading

  const onNext = async () => {
    setErrorMsg(undefined)

    if (!usdWallet) {
      setErrorMsg(LL.common.error())
      return
    }

    if (isBridge) {
      await onBridgeWithdraw()
      return
    }

    const localBankAccounts = bankAccountsData?.me?.bankAccounts ?? []
    const storedDefaultId = await loadDefaultWithdrawAccountId("JMD")
    const jmdBankAccounts = localBankAccounts.filter(
      (el) => el.currency.toUpperCase() === "JMD",
    )
    const defaultBankAccount =
      jmdBankAccounts.find((el) => el.id === storedDefaultId) ||
      jmdBankAccounts.find((el) => el.isDefault) ||
      jmdBankAccounts[0] ||
      localBankAccounts.find((el) => el.id === storedDefaultId) ||
      localBankAccounts.find((el) => el.isDefault) ||
      localBankAccounts[0]

    if (!defaultBankAccount?.id) {
      setErrorMsg(LL.Cashout.noBankAccountFound())
      return
    }

    toggleActivityIndicator(true)
    try {
      const res = await requestCashout({
        variables: {
          input: {
            bankAccountId: defaultBankAccount.id,
            walletId: usdWallet.id,
            amount: settlementSendAmount.amount,
          },
        },
      })
      if (res.data?.requestCashout.offer) {
        navigation.navigate("CashoutConfirmation", {
          offer: res.data.requestCashout.offer,
        })
      } else {
        setErrorMsg(res.data?.requestCashout.errors[0]?.message ?? LL.common.error())
      }
    } finally {
      toggleActivityIndicator(false)
    }
  }

  const onBridgeWithdraw = async () => {
    const storedDefaultId = await loadDefaultWithdrawAccountId("USD")
    const externalAccounts =
      externalAccountsData?.bridgeExternalAccounts?.flatMap((account) =>
        account ? [account] : [],
      ) ?? []
    const externalAccount =
      externalAccounts.find((account) => account.id === storedDefaultId) ||
      externalAccounts[0]

    if (!externalAccount?.id) {
      setErrorMsg(LL.Cashout.noExternalAccountFound())
      return
    }

    toggleActivityIndicator(true)
    try {
      // Backend expects a decimal USD-dollar string (e.g. "10.50"), max 6 decimals.
      const amount = (settlementSendAmount.amount / 100).toFixed(2)
      const requestRes = await bridgeRequestWithdrawal({
        variables: { input: { externalAccountId: externalAccount.id, amount } },
      })

      const requestErrors = requestRes.data?.bridgeRequestWithdrawal.errors
      const withdrawalId = requestRes.data?.bridgeRequestWithdrawal.withdrawal?.id
      if (requestErrors?.length) {
        setErrorMsg(requestErrors[0].message)
        return
      }
      if (!withdrawalId) {
        setErrorMsg(LL.common.error())
        return
      }

      // bridgeRequestWithdrawal only stores a pending record; the user reviews and
      // confirms (bridgeInitiateWithdrawal) on the confirmation screen.
      navigation.navigate("CashoutConfirmation", {
        bridgeWithdrawalId: withdrawalId,
        bridgeAccountLabel: `${externalAccount.bankName} ••${externalAccount.accountNumberLast4}`,
      })
    } finally {
      toggleActivityIndicator(false)
    }
  }

  const setAmountToBalancePercentage = (percentage: number) => {
    setMoneyAmount(
      toWalletAmount({
        amount: Math.round((usdBalance.amount * percentage) / 100),
        currency: WalletCurrency.Usd,
      }),
    )
  }

  return (
    <Screen>
      <ScrollView style={styles.scrollViewContainer}>
        <CashoutFromWallet usdBalance={usdBalance} />
        <View>
          <Text type="bl" bold style={styles.amountLabel}>
            {LL.SendBitcoinScreen.amount()}
          </Text>
          <AmountInput
            unitOfAccountAmount={moneyAmount}
            walletCurrency={WalletCurrency.Usd}
            setAmount={setMoneyAmount}
            convertMoneyAmount={convertMoneyAmount}
            minAmount={toUsdMoneyAmount(1)}
            maxAmount={{
              amount: usdBalance.amount,
              currency: WalletCurrency.Usd,
              currencyCode: "USD",
            }}
          />
        </View>
        <CashoutPercentage setAmountToBalancePercentage={setAmountToBalancePercentage} />
        {Boolean(errorMsg) && (
          <Text type="bm" color={colors.red}>
            {errorMsg}
          </Text>
        )}
      </ScrollView>
      <PrimaryBtn
        label={LL.common.next()}
        btnStyle={nextButtonStyle}
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
  amountLabel: {
    marginBottom: 5,
  },
  nextButton: {
    marginHorizontal: 20,
  },
}))
