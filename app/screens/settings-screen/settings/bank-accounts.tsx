import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"

import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

import { SettingsRow } from "../row"

export const BankAccountsSetting: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { LL } = useI18nContext()
  const { bridgeTopupEnabled } = useFeatureFlags()

  // ENG-465 kill switch: while Bridge is remotely disabled, don't advertise a
  // bank-transfer hub whose Receive card and Add-bank flow are all Bridge.
  if (!bridgeTopupEnabled) return null

  return (
    <SettingsRow
      title={LL.BankAccountsScreen.title()}
      subtitle={LL.BankAccountsScreen.settingsSubtitle()}
      leftIcon="business-outline"
      action={() => navigation.navigate("BankAccounts")}
    />
  )
}
