import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

import { SettingsRow } from "../row"

export const AccountFlashcard: React.FC = () => {
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { lnurl, cashuCard, readFlashcard } = useFlashcard()

  const onPressFlashcard = async () => {
    // A card this session already knows opens straight away — the same
    // shortcut the BoltCard path takes on `lnurl`. Otherwise tap to read, and
    // route on what the tap turned out to be; a BoltCard sets `lnurl` and the
    // existing watchers take it from there.
    if (cashuCard) return navigation.navigate("FlashcardV2")
    if (lnurl) return navigation.navigate("Card")
    const { cashuCard: read } = await readFlashcard()
    if (read) navigation.navigate("FlashcardV2")
  }

  return (
    <SettingsRow
      title={LL.SettingsScreen.flashcard()}
      leftIcon="card"
      action={onPressFlashcard}
    />
  )
}
