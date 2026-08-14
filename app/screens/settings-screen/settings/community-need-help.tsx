import React from "react"
import { Linking } from "react-native"
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

const AppChat = () => {
  const { LL } = useI18nContext()
  const { navigate } = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { userPublicKey } = useChatContext()
  const { persistentState, updateState } = usePersistentStateContext()

  const openAppChat = () => {
    if (!userPublicKey) return
    const groupId = getGroupId([userPublicKey, SUPPORT_CHAT_PUBKEY])
    const goToSupportChat = () =>
      navigate("Primary", {
        screen: "Chat",
        params: { screen: "messages", params: { groupId } },
      })

    if (persistentState.chatEnabled) {
      goToSupportChat()
    } else {
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            chatEnabled: true,
          }
        return undefined
      })
      // The Chat tab only mounts once chatEnabled is set; defer navigation
      // until the navigator has re-rendered with the Chat route registered.
      setTimeout(goToSupportChat, 300)
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
  const { appConfig } = useAppConfig()

  const bankName = appConfig.galoyInstance.name
  const contactMessageBody = LL.support.defaultSupportMessage({
    os: isIos ? "iOS" : "Android",
    version: getReadableVersion(),
    bankName,
  })

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
  const { appConfig } = useAppConfig()
  const bankName = appConfig.galoyInstance.name

  const contactMessageBody = LL.support.defaultSupportMessage({
    os: isIos ? "iOS" : "Android",
    version: getReadableVersion(),
    bankName,
  })

  const contactMessageSubject = LL.support.defaultEmailSubject({
    bankName,
  })

  return (
    <SettingsRow
      title={LL.support.email()}
      leftIcon="mail-outline"
      action={() =>
        Linking.openURL(
          `mailto:${CONTACT_EMAIL_ADDRESS}?subject=${encodeURIComponent(
            contactMessageSubject,
          )}&body=${encodeURIComponent(contactMessageBody)}`,
        )
      }
    />
  )
}
