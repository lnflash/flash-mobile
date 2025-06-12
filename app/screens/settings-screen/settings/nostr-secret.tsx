import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { SettingsRow } from "../row"

export const NostrSecret: React.FC = () => {
  const { LL } = useI18nContext()
  const navigation = useNavigation()

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
