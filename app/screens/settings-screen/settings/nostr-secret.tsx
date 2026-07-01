import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { SettingsRow } from "../row"

export const NostrSecret: React.FC = () => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const handleNavigateToNostrScreen = () => {
    navigation.navigate("NostrSettingsScreen")
  }

  return (
    <>
      <SettingsRow
        title={LL.SettingsScreen.showNostrSecret() || "Nostr Account"}
        leftIcon="globe-outline"
        rightIcon="chevron-forward"
        action={handleNavigateToNostrScreen}
      />
    </>
  )
}
