import React from "react"
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs"
import { useRoute } from "@react-navigation/native"

// screens
import { USDTransactionHistory } from "./USDTransactionHistory"
import { BTCTransactionHistory } from "./BTCTransactionHistory"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

const Tab = createMaterialTopTabNavigator()

export const TransactionHistoryTabs = () => {
  const route = useRoute()
  const initialRouteName = route.params?.initialRouteName
  const { LL } = useI18nContext()

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        tabBarLabelStyle: { fontSize: 18, fontWeight: "600" },
        tabBarIndicatorStyle: { backgroundColor: "#60aa55" },
      }}
    >
      <Tab.Screen
        name="BTCTransactionHistory"
        component={BTCTransactionHistory}
        options={{ title: LL.TransactionHistoryTabs.titleBTC() }}
      />
      <Tab.Screen
        name="USDTransactionHistory"
        component={USDTransactionHistory}
        options={{ title: LL.TransactionHistoryTabs.titleUSD() }}
      />
    </Tab.Navigator>
  )
}
