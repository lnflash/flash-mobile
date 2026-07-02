import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"

import { RootStackParamList } from "@app/navigation/stack-param-lists"

import { SettingsRow } from "../row"

export const BankAccountsSetting: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  return (
    <SettingsRow
      title="Bank accounts"
      subtitle="Receive & withdraw by bank transfer"
      leftIcon="business-outline"
      action={() => navigation.navigate("BankAccounts")}
    />
  )
}
