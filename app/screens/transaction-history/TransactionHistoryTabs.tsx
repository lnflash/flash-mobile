import React from "react"
import { useTheme } from "@rneui/themed"
import {
  createMaterialTopTabNavigator,
  MaterialTopTabBar,
} from "@react-navigation/material-top-tabs"
import { TabBarItem } from "react-native-tab-view"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// screens
import { USDTransactionHistory } from "./USDTransactionHistory"
import { BTCTransactionHistory } from "./BTCTransactionHistory"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { usePersistentStateContext } from "@app/store/persistent-state"

const Tab = createMaterialTopTabNavigator()

type Props = StackScreenProps<RootStackParamList, "TransactionHistoryTabs">

export const TransactionHistoryTabs: React.FC<Props> = ({ route }) => {
  const initialRouteName = route.params?.initialRouteName
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { persistentState } = usePersistentStateContext()

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
        />
      )}

      <Tab.Screen
        name="USDTransactionHistory"
        component={USDTransactionHistory}
        options={{ title: LL.TransactionHistoryTabs.titleUSD() }}
      />
    </Tab.Navigator>
  )
}
