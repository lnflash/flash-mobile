import React, { useEffect, useState } from "react"
import { Text, useTheme } from "@rneui/themed"
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// screens
import { USDTransactionHistory } from "./USDTransactionHistory"
import { BTCTransactionHistory } from "./BTCTransactionHistory"

// components
import HideableArea from "@app/components/hideable-area/hideable-area"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useBreez, useDisplayCurrency } from "@app/hooks"
import { useBalanceHeaderQuery, useHideBalanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// types
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { getUsdWallet } from "@app/graphql/wallets-utils"

const Tab = createMaterialTopTabNavigator()

type Props = StackScreenProps<RootStackParamList, "TransactionHistoryTabs">

export const TransactionHistoryTabs: React.FC<Props> = ({ navigation, route }) => {
  const initialRouteName = route.params?.initialRouteName
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { persistentState } = usePersistentStateContext()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()

  const [btcBalance, setBtcBalance] = useState<string>()
  const [cashBalance, setCashBalance] = useState<string>()
  const [activeWallet, setActiveWallet] = useState<"btc" | "usd">(
    initialRouteName === "USDTransactionHistory" ? "usd" : "btc",
  )

  const isAuthed = useIsAuthed()
  const { data } = useBalanceHeaderQuery({ skip: !isAuthed })
  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HideableArea isContentVisible={hideBalance} style={{ marginRight: 10 }}>
          <Text type="p1" style={{ marginRight: 10 }}>
            {activeWallet === "btc" ? btcBalance : cashBalance}
          </Text>
        </HideableArea>
      ),
    })
  }, [activeWallet, btcBalance, cashBalance])

  useEffect(() => {
    formatBalance()
  }, [data?.me?.defaultAccount.wallets, btcWallet.balance])

  const formatBalance = () => {
    setBtcBalance(
      moneyAmountToDisplayCurrencyString({
        moneyAmount: toBtcMoneyAmount(btcWallet.balance ?? NaN),
      }),
    )
    const extUsdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
    const extUsdWalletBalance = toUsdMoneyAmount(extUsdWallet?.balance ?? NaN)
    setCashBalance(
      moneyAmountToDisplayCurrencyString({
        moneyAmount: extUsdWalletBalance,
      }),
    )
  }

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        tabBarLabelStyle: { fontSize: 18, fontWeight: "600" },
        tabBarIndicatorStyle: { backgroundColor: colors.primary },
      }}
    >
      {persistentState.isAdvanceMode && (
        <Tab.Screen
          name="BTCTransactionHistory"
          component={BTCTransactionHistory}
          options={{ title: LL.TransactionHistoryTabs.titleBTC() }}
          listeners={() => ({
            swipeEnd: (e) => {
              setActiveWallet("btc")
            },
            tabPress: (e) => {
              setActiveWallet("btc")
            },
          })}
        />
      )}

      <Tab.Screen
        name="USDTransactionHistory"
        component={USDTransactionHistory}
        options={{ title: LL.TransactionHistoryTabs.titleUSD() }}
        listeners={() => ({
          swipeEnd: (e) => {
            setActiveWallet("usd")
          },
          tabPress: (e) => {
            setActiveWallet("usd")
          },
        })}
      />
    </Tab.Navigator>
  )
}
