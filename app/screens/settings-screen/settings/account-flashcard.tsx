import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

import { SettingsRow } from "../row"

export const AccountFlashcard: React.FC = () => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { lnurl, readFlashcard } = useFlashcard()

  const onPressFlashcard = () => {
    if (lnurl) navigation.navigate("Card")
    else readFlashcard()
  }

  return (
    <SettingsRow
      title={LL.SettingsScreen.flashcard()}
      leftIcon="card"
      action={onPressFlashcard}
    />
  )
}
