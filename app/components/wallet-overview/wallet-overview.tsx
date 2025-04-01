import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Balance } from "../cards"

// hooks
import { useWalletOverviewScreenQuery, WalletCurrency } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useNavigation } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useBreez, useFlashcard } from "@app/hooks"

// utils
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { getUsdWallet } from "@app/graphql/wallets-utils"

const WalletOverview = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { balanceInSats, readFlashcard } = useFlashcard()

  const { persistentState, updateState } = usePersistentStateContext()
  const { formatMoneyAmount, displayCurrency, moneyAmountToDisplayCurrencyString } =
    useDisplayCurrency()

  const { data, error } = useWalletOverviewScreenQuery({
    fetchPolicy: "network-only",
    skip: !isAuthed,
  })

  const [btcBalance, setBtcBalance] = useState<string | undefined>(
    persistentState?.btcBalance || undefined,
  )
  const [btcDisplayBalance, setBtcDisplayBalance] = useState<string | undefined>(
    persistentState?.btcDisplayBalance || "0",
  )
  const [cashBalance, setCashBalance] = useState<string | undefined>(
    persistentState?.cashBalance || undefined,
  )
  const [cashDisplayBalance, setCashDisplayBalance] = useState<string | undefined>(
    persistentState?.cashDisplayBalance || "0",
  )

  useEffect(() => {
    if (
      persistentState.btcDisplayBalance !== btcDisplayBalance ||
      persistentState.cashDisplayBalance !== cashDisplayBalance ||
      persistentState.btcBalance !== btcBalance ||
      persistentState.cashBalance !== cashBalance
    ) {
      updateState((state) => {
        if (state)
          return {
            ...state,
            btcDisplayBalance,
            cashDisplayBalance,
            btcBalance,
            cashBalance,
          }
        return undefined
      })
    }
  }, [btcDisplayBalance, cashDisplayBalance, btcBalance, cashBalance])

  useEffect(() => {
    if (isAuthed) formatBalance()
  }, [isAuthed, data?.me?.defaultAccount?.wallets, btcWallet?.balance, displayCurrency])

  const formatBalance = () => {
    const extBtcWalletBalance = toBtcMoneyAmount(btcWallet?.balance ?? NaN)
    setBtcBalance(
      formatMoneyAmount({
        moneyAmount: extBtcWalletBalance,
      }),
    )
    setBtcDisplayBalance(
      moneyAmountToDisplayCurrencyString({
        moneyAmount: extBtcWalletBalance,
      }),
    )

    if (data) {
      const extUsdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
      const extUsdWalletBalance = toUsdMoneyAmount(extUsdWallet?.balance ?? NaN)
      setCashBalance(
        formatMoneyAmount({
          moneyAmount: extUsdWalletBalance,
        }),
      )
      setCashDisplayBalance(
        moneyAmountToDisplayCurrencyString({
          moneyAmount: extUsdWalletBalance,
        }),
      )
    }
  }

  const navigateHandler = (activeTab: string) => {
    if (persistentState.isAdvanceMode) {
      navigation.navigate("TransactionHistoryTabs", {
        initialRouteName: activeTab,
      })
    } else {
      navigation.navigate(activeTab as any)
    }
  }

  const onPressCash = () => navigateHandler("USDTransactionHistory")

  const onPressBitcoin = () => navigateHandler("BTCTransactionHistory")

  const onPressFlashcard = () => navigation.navigate("Card")

  const formattedCardBalance = moneyAmountToDisplayCurrencyString({
    moneyAmount: toBtcMoneyAmount(balanceInSats ?? NaN),
  })

  return (
    <View style={{ marginTop: 10, marginHorizontal: 20 }}>
      <Balance
        icon="cash"
        title={LL.HomeScreen.cash()}
        amount={cashDisplayBalance}
        // amount={cashBalance}
        currency={displayCurrency}
        onPress={onPressCash}
      />
      {persistentState.isAdvanceMode && (
        <Balance
          icon="bitcoin"
          title={LL.HomeScreen.bitcoin()}
          amount={btcBalance?.split(" ")[0]}
          // amount={btcDisplayBalance}
          currency="SATS"
          onPress={onPressBitcoin}
        />
      )}
      <Balance
        icon={!!formattedCardBalance ? "flashcard" : "cardAdd"}
        title={LL.HomeScreen.flashcard()}
        amount={formattedCardBalance}
        currency={displayCurrency}
        emptyCardText={LL.HomeScreen.addFlashcard()}
        onPress={onPressFlashcard}
        onSync={() => readFlashcard(false)}
      />
    </View>
  )
}

export default WalletOverview
