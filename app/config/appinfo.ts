import Config from "react-native-config"
import { AndroidMarket } from "react-native-rate"

// Flash Support nostr identity (hex pubkey). Customers reach support via
// NIP-17 DMs to this key; the nostr-dm-bridge in flash-support-infra relays
// the conversation into Chatwoot. Overridable via env for staging/test.
// npub1qcesn86prsd9v4y48g4gzxg6gnsunlvhnnuq3kvdhftl7n2yrtyshlsgv9
export const SUPPORT_CHAT_PUBKEY =
  Config.SUPPORT_CHAT_PUBKEY ||
  "0633099f411c1a5654953a2a81191a44e1c9fd979cf808d98dba57ff4d441ac9"

export const WHATSAPP_CONTACT_NUMBER = "+18762909250"
export const WHATSAPP_SUPPORT_URL = "https://wa.flashapp.me"
export const CONTACT_EMAIL_ADDRESS = "support@getflash.io"
export const APP_STORE_LINK =
  "https://apps.apple.com/jm/app/flash-send-spend-and-save/id6451129095"
export const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.lnflash"
export const PREFIX_LINKING = ["https://pay.getflash.io", "flash://"]

// FIXME this should come from globals.lightningAddressDomainAliases
export const LNURL_DOMAINS = ["getflash.io", "pay.flashapp.me", "flashapp.me"]

export const ratingOptions = {
  AppleAppID: "6451129095",
  GooglePackageName: "com.lnflash",
  preferredAndroidMarket: AndroidMarket.Google,
  preferInApp: true,
  openAppStoreIfInAppFails: true,
}

export const FLASH_DEEP_LINK_PREFIX = "flash:/"
