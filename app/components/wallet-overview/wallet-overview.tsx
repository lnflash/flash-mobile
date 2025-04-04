import React, { useEffect, useState } from "react"
import { View, StyleSheet } from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Balance } from "../cards"

// hooks
import { useWalletOverviewScreenQuery } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useNavigation } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useBreez, useFlashcard } from "@app/hooks"

// utils
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { getUsdWallet } from "@app/graphql/wallets-utils"

// services
import { CashuService } from "@app/services/ecash/cashu-service"

type Props = {
  setIsUnverifiedSeedModalVisible: (value: boolean) => void
}

const WalletOverview: React.FC<Props> = ({ setIsUnverifiedSeedModalVisible }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { lnurl, balanceInSats, readFlashcard } = useFlashcard()

  const { persistentState, updateState } = usePersistentStateContext()
  const { formatMoneyAmount, displayCurrency, moneyAmountToDisplayCurrencyString } =
    useDisplayCurrency()

  const { data } = useWalletOverviewScreenQuery({
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
  const [ecashBalance, setEcashBalance] = useState<number>(0)
  const [ecashDisplayBalance, setEcashDisplayBalance] = useState<string>("0")

  // Initialize eCash wallet if enabled
  useEffect(() => {
    const initEcashWallet = async () => {
      if (persistentState.showECashWallet) {
        const cashuService = CashuService.getInstance()
        try {
          await cashuService.initializeWallet()
          const balance = await cashuService.getBalance()
          setEcashBalance(balance)

          // Format for display currency
          const ecashMoneyAmount = toBtcMoneyAmount(balance)
          setEcashDisplayBalance(
            moneyAmountToDisplayCurrencyString({
              moneyAmount: ecashMoneyAmount,
            }) || "0",
          )
        } catch (error) {
          console.error("Failed to initialize eCash wallet:", error)
        }
      }
    }

    initEcashWallet()
  }, [
    persistentState.showECashWallet,
    displayCurrency,
    formatMoneyAmount,
    moneyAmountToDisplayCurrencyString,
  ])

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

    // Update eCash display balance when display currency changes
    if (ecashBalance > 0) {
      const ecashMoneyAmount = toBtcMoneyAmount(ecashBalance)
      setEcashDisplayBalance(
        moneyAmountToDisplayCurrencyString({
          moneyAmount: ecashMoneyAmount,
        }) || "0",
      )
    }
  }

  const navigateHandler = (activeTab: string) => {
    if (persistentState.isAdvanceMode) {
      navigation.navigate("TransactionHistoryTabs", {
        initialRouteName: activeTab,
      })
    } else {
      // Using type assertion since we know these screen names are valid
      navigation.navigate(activeTab as never)
    }
  }

  const onPressCash = () => navigateHandler("USDTransactionHistory")

  const onPressBitcoin = () => navigateHandler("BTCTransactionHistory")

  const onPressEcash = () => {
    navigation.navigate("ECashWallet")
  }

  const onPressFlashcard = () => {
    if (lnurl) navigation.navigate("Card")
    else readFlashcard()
  }

  const formattedCardBalance = moneyAmountToDisplayCurrencyString({
    moneyAmount: toBtcMoneyAmount(balanceInSats ?? NaN),
  })

  return (
    <View style={styles.container}>
      <Balance
        icon="cash"
        title={LL.HomeScreen.cash()}
        amount={cashDisplayBalance}
        // amount={cashBalance}
        currency={displayCurrency}
        onPress={onPressCash}
      />
      {persistentState.showECashWallet && (
        <Balance
          icon="bitcoin"
          title="Pocket Money"
          amount={ecashDisplayBalance}
          currency={displayCurrency}
          onPress={onPressEcash}
        />
      )}
      {persistentState.isAdvanceMode && (
        <Balance
          icon="bitcoin"
          title={LL.HomeScreen.bitcoin()}
          amount={btcBalance?.split(" ")[0]}
          // amount={btcDisplayBalance}
          currency="SATS"
          onPress={onPressBitcoin}
          onPressRightBtn={() => setIsUnverifiedSeedModalVisible(true)}
          rightIcon={persistentState.backedUpBtcWallet ? undefined : "warning"}
        />
      )}
      <Balance
        icon={formattedCardBalance ? "flashcard" : "cardAdd"}
        title={LL.HomeScreen.flashcard()}
        amount={formattedCardBalance}
        currency={displayCurrency}
        emptyText={LL.HomeScreen.addFlashcard()}
        onPress={onPressFlashcard}
        onPressRightBtn={() => readFlashcard(false)}
        rightIcon={"sync"}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    marginHorizontal: 20,
  },
})

export default WalletOverview
