import { Linking } from "react-native"
import { getReadableVersion } from "react-native-device-info"

// components
import { SettingsRow } from "../row"
import { SettingsGroup } from "../group"

// hooks
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// utils
import { isIos } from "@app/utils/helper"
import { openWhatsApp } from "@app/utils/external"
import { CONTACT_EMAIL_ADDRESS, WHATSAPP_CONTACT_NUMBER } from "@app/config"

export const NeedHelpSetting: React.FC = () => {
  const { LL } = useI18nContext()

  return (
    <SettingsGroup name={LL.support.contactUs()} items={[Discord, WhatsApp, Email]} />
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
      action={() => openWhatsApp(WHATSAPP_CONTACT_NUMBER, contactMessageBody)}
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
