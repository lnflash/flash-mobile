import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { SettingsRow } from "../row"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { Alert, Image, Platform } from "react-native"
import { ModalPortal as Modal } from "@app/components/modal-portal"
import { useSettingsScreenQuery } from "@app/graphql/generated"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { useLevel } from "@app/graphql/level-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useBreez } from "@app/hooks"
import { useEffect, useState } from "react"
import { AdvancedModeModal } from "@app/components/advanced-mode-modal"
import * as Keychain from "react-native-keychain"
import { KEYCHAIN_MNEMONIC_KEY } from "@app/utils/breez-sdk-liquid"

export const AdvancedModeToggle: React.FC = () => {
  const { LL } = useI18nContext()
  const { isAtLeastLevelZero } = useLevel()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const { persistentState, updateState } = usePersistentStateContext()
  const { btcWallet } = useBreez()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()

  const [advanceModalVisible, setAdvanceModalVisible] = useState(false)
  const [hasRecoveryPhrase, setHasRecoveryPhrase] = useState(false)

  const isAdvanceMode = persistentState.isAdvanceMode

  const { data } = useSettingsScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
    skip: !isAtLeastLevelZero,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  useEffect(() => {
    checkRecoveryPhrase()
  }, [])

  const checkRecoveryPhrase = async () => {
    const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    if (credentials) {
      setHasRecoveryPhrase(true)
    }
  }

  const onUpdateState = (isAdvanceMode: boolean) => {
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          defaultWallet: isAdvanceMode ? state.defaultWallet : usdWallet,
          isAdvanceMode,
        }
      return undefined
    })
    navigation.reset({
      index: 0,
      routes: [{ name: "Primary" }],
    })
  }

  const toggleAdvanceMode = async () => {
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
            onPress: () => onUpdateState(false),
          },
        ])
      } else {
        onUpdateState(false)
      }
    } else {
      if (hasRecoveryPhrase) {
        onUpdateState(true)
      } else {
        setAdvanceModalVisible(true)
      }
    }
  }

  let leftIcon = isAdvanceMode ? "invert-mode-outline" : "invert-mode"
  let title = isAdvanceMode
    ? LL.SettingsScreen.beginnerMode()
    : LL.SettingsScreen.advanceMode()
  if (hasRecoveryPhrase) {
    leftIcon = isAdvanceMode ? "eye" : "eye-off"
    title = isAdvanceMode
      ? LL.SettingsScreen.hideBtcAccount()
      : LL.SettingsScreen.showBtcAccount()
  }

  if (Platform.OS === "ios" && Number(Platform.Version) < 13) {
    return null
  } else {
    return (
      <>
        <SettingsRow
          title={title}
          leftIcon={leftIcon}
          action={toggleAdvanceMode}
          rightIcon={"sync-outline"}
        />
        <AdvancedModeModal
          hasRecoveryPhrase={hasRecoveryPhrase}
          isVisible={advanceModalVisible}
          setIsVisible={setAdvanceModalVisible}
        />
      </>
    )
  }
}
