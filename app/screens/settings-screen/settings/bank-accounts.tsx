import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"

import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useAccountStatus } from "@app/hooks/use-account-status"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

import { SettingsRow } from "../row"

export const BankAccountsSetting: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { LL } = useI18nContext()
  const { bridgeTopupEnabled } = useFeatureFlags()

  const { capabilities } = useAccountStatus()

  // Shown when the user can hold local (Jamaican) bank accounts OR Bridge is
  // on. ENG-465 kill switch: with Bridge remotely disabled the hub still opens
  // for local accounts; its Bridge sections are gated by the flag inside.
  if (!bridgeTopupEnabled && !capabilities.bankPayout) return null

  return (
    <SettingsRow
      title={LL.BankAccountsScreen.title()}
      subtitle={LL.BankAccountsScreen.settingsSubtitle()}
      leftIcon="business-outline"
      action={() => navigation.navigate("BankAccounts")}
    />
  )
}
