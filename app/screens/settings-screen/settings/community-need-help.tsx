import React, { useEffect, useState } from "react"
import { Alert, Linking } from "react-native"
import { getReadableVersion } from "react-native-device-info"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

// components
import { SettingsRow } from "../row"
import { SettingsGroup } from "../group"

// hooks
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useChatContext } from "@app/screens/chat/chatContext"
import { usePersistentStateContext } from "@app/store/persistent-state"

// utils
import { isIos } from "@app/utils/helper"
import { openWhatsAppUrl } from "@app/utils/external"
import { getGroupId } from "@app/utils/nostr"
import {
  CONTACT_EMAIL_ADDRESS,
  SUPPORT_CHAT_PUBKEY,
  WHATSAPP_SUPPORT_URL,
} from "@app/config"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

export const NeedHelpSetting: React.FC = () => {
  const { LL } = useI18nContext()

  return (
    <SettingsGroup
      name={LL.support.contactUs()}
      items={[AppChat, Discord, WhatsApp, Email]}
    />
  )
}

// Builds the mailto: URL for the email support channel; shared between the
// Email row and the App chat fallback for users without a local nostr key.
const useSupportEmailUrl = () => {
  const { LL } = useI18nContext()
  const { appConfig } = useAppConfig()
  const bankName = appConfig.galoyInstance.name

  const contactMessageBody = LL.support.defaultSupportMessage({
    os: isIos ? "iOS" : "Android",
    version: getReadableVersion(),
    bankName,
  })
  const contactMessageSubject = LL.support.defaultEmailSubject({ bankName })

  return `mailto:${CONTACT_EMAIL_ADDRESS}?subject=${encodeURIComponent(
    contactMessageSubject,
  )}&body=${encodeURIComponent(contactMessageBody)}`
}

const AppChat = () => {
  const { LL } = useI18nContext()
  const { navigate } = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { userPublicKey } = useChatContext()
  const { persistentState, updateState } = usePersistentStateContext()
  const supportEmailUrl = useSupportEmailUrl()
  // groupId waiting for the Chat tab to mount after chatEnabled flips on.
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)

  const goToSupportChat = (groupId: string) =>
    navigate("Primary", {
      screen: "Chat",
      params: { screen: "messages", params: { groupId } },
    })

  // The Chat tab only mounts once chatEnabled is set. Effects run after the
  // commit in which the navigator re-rendered with the Chat route registered,
  // so navigating from here is deterministic — unlike a timeout, which races
  // the re-render on a busy JS thread.
  useEffect(() => {
    if (pendingGroupId && persistentState.chatEnabled) {
      setPendingGroupId(null)
      goToSupportChat(pendingGroupId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGroupId, persistentState.chatEnabled])

  const openAppChat = () => {
    if (!userPublicKey) {
      // No local nostr key (e.g. account restored on a new device where the
      // backend npub exists but the secret never made it over). Surface the
      // state and offer the email channel instead of silently doing nothing.
      Alert.alert(
        LL.support.chatUnavailableTitle(),
        LL.support.chatUnavailableMessage(),
        [
          { text: LL.common.cancel(), style: "cancel" },
          {
            text: LL.support.email(),
            onPress: () => Linking.openURL(supportEmailUrl),
          },
        ],
      )
      return
    }
    const groupId = getGroupId([userPublicKey, SUPPORT_CHAT_PUBKEY])

    if (persistentState.chatEnabled) {
      goToSupportChat(groupId)
    } else {
      setPendingGroupId(groupId)
      updateState((state) => {
        if (state)
          return {
            ...state,
            chatEnabled: true,
          }
        return undefined
      })
    }
  }

  return (
    <SettingsRow
      title={LL.support.appChat()}
      leftIcon="chatbubbles-outline"
      action={openAppChat}
    />
  )
}

const Discord = () => {
  const { LL } = useI18nContext()

  return (
    <SettingsRow
      title={LL.support.discord()}
      leftIcon="logo-discord"
      action={() => Linking.openURL("https://discord.gg/8jCg8eCRhF")}
    />
  )
}

const WhatsApp = () => {
  const { LL } = useI18nContext()

  return (
    <SettingsRow
      title={LL.support.whatsapp()}
      leftIcon="logo-whatsapp"
      action={() => openWhatsAppUrl(WHATSAPP_SUPPORT_URL)}
    />
  )
}

const Email = () => {
  const { LL } = useI18nContext()
  const supportEmailUrl = useSupportEmailUrl()

  return (
    <SettingsRow
      title={LL.support.email()}
      leftIcon="mail-outline"
      action={() => Linking.openURL(supportEmailUrl)}
    />
  )
}
