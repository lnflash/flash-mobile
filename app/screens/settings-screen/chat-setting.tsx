import { usePersistentStateContext } from "@app/store/persistent-state"
import { SettingsRow } from "./row"
import { Switch } from "@rneui/themed"
import React from "react"
import { useI18nContext } from "@app/i18n/i18n-react"

export const ChatSetting: React.FC = () => {
  const { persistentState, updateState } = usePersistentStateContext()
  const { LL } = useI18nContext()
  return (
    <SettingsRow
      title={LL.SettingsScreen.enableChat()}
      leftIcon="chatbubbles-outline"
      action={() => {}}
      rightIcon={
        <Switch
          value={!!persistentState.chatEnabled}
          onValueChange={(enabled) => {
            updateState((state: any) => {
              if (state)
                return {
                  ...state,
                  chatEnabled: enabled,
                }
              return undefined
            })
          }}
        />
      }
    />
  )
}
