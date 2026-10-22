import { useEffect, useState } from "react"
import { Alert, Linking } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import { getReadableVersion } from "react-native-device-info"

import { CONTACT_EMAIL_ADDRESS, SUPPORT_CHAT_PUBKEY } from "@app/config"
import { useAppConfig } from "@app/hooks/use-app-config"
import { useI18nContext } from "@app/i18n/i18n-react"
import type { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useChatContext } from "@app/screens/chat/chatContext"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { isIos } from "@app/utils/helper"
import { getGroupId } from "@app/utils/nostr"

/** Open the existing support conversation, enabling Chat before navigating if needed. */
export const useOpenSupportChat = () => {
  const { LL } = useI18nContext()
  const { navigate } = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { userPublicKey } = useChatContext()
  const { persistentState, updateState } = usePersistentStateContext()
  const { appConfig } = useAppConfig()
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)

  const goToSupportChat = (groupId: string) =>
    navigate("Primary", {
      screen: "Chat",
      params: { screen: "messages", params: { groupId } },
    })

  // The Chat tab mounts after chatEnabled changes. Navigate after that render.
  useEffect(() => {
    if (pendingGroupId && persistentState.chatEnabled) {
      setPendingGroupId(null)
      goToSupportChat(pendingGroupId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGroupId, persistentState.chatEnabled])

  return () => {
    if (!userPublicKey) {
      const bankName = appConfig.galoyInstance.name
      const subject = LL.support.defaultEmailSubject({ bankName })
      const body = LL.support.defaultSupportMessage({
        os: isIos ? "iOS" : "Android",
        version: getReadableVersion(),
        bankName,
      })
      const emailUrl = `mailto:${CONTACT_EMAIL_ADDRESS}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`
      Alert.alert(
        LL.support.chatUnavailableTitle(),
        LL.support.chatUnavailableMessage(),
        [
          { text: LL.common.cancel(), style: "cancel" },
          { text: LL.support.email(), onPress: () => Linking.openURL(emailUrl) },
        ],
      )
      return
    }
    const groupId = getGroupId([userPublicKey, SUPPORT_CHAT_PUBKEY])
    if (persistentState.chatEnabled) {
      goToSupportChat(groupId)
    } else {
      setPendingGroupId(groupId)
      updateState((state) => (state ? { ...state, chatEnabled: true } : undefined))
    }
  }
}
