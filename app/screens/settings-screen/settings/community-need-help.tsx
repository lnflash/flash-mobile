import React from "react"
import { Linking } from "react-native"
import { getReadableVersion } from "react-native-device-info"

// components
import { SettingsRow } from "../row"
import { SettingsGroup } from "../group"

// hooks
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useOpenSupportChat } from "@app/hooks/use-open-support-chat"

// utils
import { isIos } from "@app/utils/helper"
import { openWhatsAppUrl } from "@app/utils/external"
import { CONTACT_EMAIL_ADDRESS, WHATSAPP_SUPPORT_URL } from "@app/config"

export const NeedHelpSetting: React.FC = () => {
  const { LL } = useI18nContext()

  return (
    <SettingsGroup
      name={LL.support.contactUs()}
      items={[AppChat, Discord, WhatsApp, Email]}
    />
  )
}

// Builds the mailto: URL for the Email row.
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
  const openAppChat = useOpenSupportChat()

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
