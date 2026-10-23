import { useEffect, useState } from "react"
import { Alert, Platform } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import * as Keychain from "react-native-keychain"

import { useLevel } from "@app/graphql/level-context"
import { useSettingsScreenQuery } from "@app/graphql/generated"
import { getCashWallet } from "@app/graphql/wallets-utils"
import { useBreez } from "@app/hooks"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useI18nContext } from "@app/i18n/i18n-react"
import type { RootStackParamList } from "@app/navigation/stack-param-lists"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { toBtcMoneyAmount, toSpendableBalance } from "@app/types/amounts"
import { KEYCHAIN_MNEMONIC_KEY } from "@app/utils/breez-sdk"
import { bitcoinWalletAvailable } from "./bitcoin-wallet-availability"

/** The same guarded Bitcoin-account switch for Settings and Ask Flash. */
export const useBitcoinWalletMode = () => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { isAtLeastLevelZero } = useLevel()
  const { persistentState, updateState } = usePersistentStateContext()
  const { btcWallet } = useBreez()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const [setupVisible, setSetupVisible] = useState(false)
  const [hasRecoveryPhrase, setHasRecoveryPhrase] = useState(false)
  const enabled = Boolean(persistentState.isAdvanceMode)
  const available = bitcoinWalletAvailable(Platform.OS, Platform.Version)
  const { data } = useSettingsScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
    skip: !isAtLeastLevelZero,
  })
  const cashWallet = getCashWallet(data?.me?.defaultAccount?.wallets)

  useEffect(() => {
    Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
      .then((credentials) => setHasRecoveryPhrase(Boolean(credentials)))
      .catch(() => setHasRecoveryPhrase(false))
  }, [])

  const apply = (next: boolean) => {
    updateState((state) =>
      state
        ? {
            ...state,
            defaultWallet: next ? state.defaultWallet : cashWallet,
            isAdvanceMode: next,
          }
        : undefined,
    )
    navigation.reset({ index: 0, routes: [{ name: "Primary" }] })
  }

  const request = async (next: boolean) => {
    if (!available || next === enabled) return
    if (next) {
      const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
      const backedUp = Boolean(credentials)
      setHasRecoveryPhrase(backedUp)
      if (backedUp) apply(true)
      else setSetupVisible(true)
      return
    }
    if (btcWallet.balance && btcWallet.balance > 0) {
      const balance = toSpendableBalance(toBtcMoneyAmount(btcWallet.balance))
      const displayed =
        moneyAmountToDisplayCurrencyString({
          moneyAmount: balance,
          isApproximate: true,
        }) || "0"
      Alert.alert(
        LL.common.warning(),
        LL.AccountScreen.btcBalanceWarning({ balance: displayed }) +
          "\n" +
          LL.support.switchToBeginnerMode(),
        [
          { text: LL.common.cancel(), style: "cancel" },
          { text: LL.common.yes(), onPress: () => apply(false) },
        ],
      )
    } else apply(false)
  }

  return {
    enabled,
    available,
    hasRecoveryPhrase,
    setupVisible,
    setSetupVisible,
    request,
  }
}
