import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { SettingsRow } from "../row"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { Alert, Image, Modal, Platform } from "react-native"
import { useSettingsScreenQuery } from "@app/graphql/generated"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { useLevel } from "@app/graphql/level-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useActivityIndicator, useBreez } from "@app/hooks"
import { useState } from "react"
import { AdvancedModeModal } from "@app/components/advanced-mode-modal"

export const AdvancedModeToggle: React.FC = () => {
  const { LL } = useI18nContext()
  const { isAtLeastLevelZero } = useLevel()
  const { goBack } = useNavigation<StackNavigationProp<RootStackParamList>>()

  const { persistentState, updateState } = usePersistentStateContext()
  const { btcWallet } = useBreez()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [animationVisible, setAnimationVisible] = useState(false)
  const [advanceModalVisible, setAdvanceModalVisible] = useState(false)

  const isAdvanceMode = persistentState.isAdvanceMode

  const { data } = useSettingsScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
    skip: !isAtLeastLevelZero,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const toggleAdvanceModeComplete = (isAdvanceMode: boolean) => {
    toggleActivityIndicator(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          defaultWallet: isAdvanceMode ? state.defaultWallet : usdWallet,
          isAdvanceMode: isAdvanceMode,
        }
      return undefined
    })

    toggleActivityIndicator(false)

    if (isAdvanceMode) {
      setAnimationVisible(true)
      setTimeout(() => {
        setAnimationVisible(false)
        setAdvanceModalVisible(true)
      }, 5500)
    } else {
      goBack()
    }
  }

  const toggleAdvanceMode = () => {
    if (isAdvanceMode) {
      if (btcWallet.balance && btcWallet.balance > 0) {
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
            onPress: () => toggleAdvanceModeComplete(false),
          },
        ])
      } else {
        toggleAdvanceModeComplete(false)
      }
    } else {
      toggleAdvanceModeComplete(true)
    }
  }
  if (Platform.OS === "ios" && Number(Platform.Version) < 13) {
    return null
  } else {
    return (
      <>
        <SettingsRow
          title={
            isAdvanceMode
              ? LL.SettingsScreen.beginnerMode()
              : LL.SettingsScreen.advanceMode()
          }
          leftIcon={isAdvanceMode ? "invert-mode-outline" : "invert-mode"}
          action={toggleAdvanceMode}
          rightIcon={"sync-outline"}
        />
        <Modal visible={animationVisible} animationType={"fade"}>
          <Image
            source={require("@app/assets/gifs/flash-logo-btc-enabled.gif")}
            style={{ height: "100%", width: "100%" }}
          />
        </Modal>
        <AdvancedModeModal
          isVisible={advanceModalVisible}
          setIsVisible={setAdvanceModalVisible}
        />
      </>
    )
  }
}
