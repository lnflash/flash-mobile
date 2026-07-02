import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"

import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

import { SettingsRow } from "../row"

export const BankAccountsSetting: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { LL } = useI18nContext()

  return (
    <SettingsRow
      title={LL.BankAccountsScreen.title()}
      subtitle={LL.BankAccountsScreen.settingsSubtitle()}
      leftIcon="business-outline"
      action={() => navigation.navigate("BankAccounts")}
    />
  )
}
