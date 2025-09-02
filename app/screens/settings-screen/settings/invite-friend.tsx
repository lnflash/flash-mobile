import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { SettingsRow } from "../row"

export const InviteFriendSetting: React.FC = () => {
  const { LL } = useI18nContext()
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList, "InviteFriend">>()

  const onNavigate = () => {
    navigation.navigate("InviteFriend")
  }

  return (
    <SettingsRow
      title={"Invite a friend"}
      leftIcon="person-add-outline"
      action={onNavigate}
    />
  )
}
