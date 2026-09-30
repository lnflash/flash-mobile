import { useOpenFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

import { SettingsRow } from "../row"

export const AccountFlashcard: React.FC = () => {
  const { LL } = useI18nContext()
  // The same rule as the Home tile (ENG-616): see app/hooks/use-tap-flashcard.ts.
  const openFlashcard = useOpenFlashcard()

  return (
    <SettingsRow
      title={LL.SettingsScreen.flashcard()}
      leftIcon="card"
      action={openFlashcard}
    />
  )
}
