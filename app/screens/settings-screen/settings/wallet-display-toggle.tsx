import { usePersistentStateContext } from "@app/store/persistent-state"
import { SettingsRow } from "../row"
import { Switch } from "@rneui/themed"
import React from "react"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSettingsScreenQuery } from "@app/graphql/generated"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { useLevel } from "@app/graphql/level-context"
import { useBreez } from "@app/hooks"
import { Alert } from "react-native"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

export const ECashWalletToggle: React.FC = () => {
  const { LL: _LL } = useI18nContext()
  const { persistentState, updateState } = usePersistentStateContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const handlePress = () => {
    if (persistentState.showECashWallet) {
      navigation.navigate("ManageMints")
    }
  }

  return (
    <SettingsRow
      title="Pocket Money (eCash)"
      subtitle="Powered by Cashu"
      leftIcon="wallet-outline"
      action={handlePress}
      rightIcon={
        <Switch
          value={Boolean(persistentState.showECashWallet)}
          onValueChange={(enabled) => {
            updateState((state) => {
              if (state)
                return {
                  ...state,
                  showECashWallet: enabled,
                }
              return undefined
            })
          }}
        />
      }
    />
  )
}

export const BitcoinWalletToggle: React.FC = () => {
  const { LL } = useI18nContext()
  const { isAtLeastLevelZero } = useLevel()
  const { persistentState, updateState } = usePersistentStateContext()
  const { btcWallet } = useBreez()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()

  const isAdvanceMode = persistentState.isAdvanceMode
  const isBtcEnabled = Boolean(persistentState.btcWalletEnabled) && isAdvanceMode

  const { data } = useSettingsScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
    skip: !isAtLeastLevelZero,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const onUpdateState = (enabled: boolean) => {
    if (enabled) {
      // Turning Bitcoin on also turns on advanced mode
      updateState((state) => {
        if (state)
          return {
            ...state,
            isAdvanceMode: true,
            btcWalletEnabled: true,
          }
        return undefined
      })
    } else {
      // Turning Bitcoin off also turns off advanced mode
      const hasBtcBalance = btcWallet.balance && btcWallet.balance > 0

      if (hasBtcBalance) {
        const btcWalletBalance = toBtcMoneyAmount(btcWallet.balance || 0)
        const convertedBalance =
          moneyAmountToDisplayCurrencyString({
            moneyAmount: btcWalletBalance,
            isApproximate: true,
          }) || "0"
        const btcBalanceWarning = LL.AccountScreen.btcBalanceWarning({
          balance: convertedBalance,
        })

        const fullMessage = btcBalanceWarning + "\n" + LL.support.switchToBeginnerMode()

        Alert.alert(LL.common.warning(), fullMessage, [
          { text: LL.common.cancel(), onPress: () => {} },
          {
            text: LL.common.yes(),
            onPress: () => {
              updateState((state) => {
                if (state)
                  return {
                    ...state,
                    defaultWallet: usdWallet,
                    isAdvanceMode: false,
                    btcWalletEnabled: false,
                  }
                return undefined
              })
            },
          },
        ])
      } else {
        updateState((state) => {
          if (state)
            return {
              ...state,
              defaultWallet: usdWallet,
              isAdvanceMode: false,
              btcWalletEnabled: false,
            }
          return undefined
        })
      }
    }
  }

  return (
    <SettingsRow
      title="Bitcoin"
      leftIcon="logo-bitcoin"
      action={() => {}}
      rightIcon={<Switch value={isBtcEnabled} onValueChange={onUpdateState} />}
    />
  )
}

export const CashWalletToggle: React.FC = () => {
  const { LL: _LL } = useI18nContext()

  return (
    <SettingsRow
      title="Cash (USD)"
      leftIcon="cash-outline"
      action={() => {}}
      rightIcon={<Switch disabled={true} value={true} />}
    />
  )
}
