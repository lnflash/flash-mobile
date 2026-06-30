import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"

import { RootStackParamList } from "@app/navigation/stack-param-lists"

import { SettingsRow } from "../row"

export const BridgeAccountRoutingSetting: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  return (
    <SettingsRow
      title="Your account and routing number"
      subtitle="Receive USD bank transfers"
      leftIcon="business-outline"
      action={() => navigation.navigate("BridgeAccountRouting")}
    />
  )
}
