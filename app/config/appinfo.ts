import Config from "react-native-config"
import { nip19 } from "nostr-tools"
import { AndroidMarket } from "react-native-rate"

// Flash Support nostr identity (hex pubkey). Customers reach support via
// NIP-17 DMs to this key; the nostr-dm-bridge in flash-support-infra relays
// the conversation into Chatwoot. Overridable via env for staging/test.
// npub1qcesn86prsd9v4y48g4gzxg6gnsunlvhnnuq3kvdhftl7n2yrtyshlsgv9
const DEFAULT_SUPPORT_CHAT_PUBKEY =
  "0633099f411c1a5654953a2a81191a44e1c9fd979cf808d98dba57ff4d441ac9"

// The messages screen treats groupId segments as hex pubkeys, so an npub (or
// garbage) here would make support DMs silently go nowhere. Accept hex as-is,
// decode the npub form, and reject anything else back to the baked-in default.
export const normalizeSupportChatPubkey = (raw: string | undefined): string => {
  if (!raw) return DEFAULT_SUPPORT_CHAT_PUBKEY
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw.toLowerCase()
  if (raw.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(raw)
      if (decoded.type === "npub") return decoded.data as string
    } catch {
      // fall through to the rejection below
    }
  }
  console.warn(
    `SUPPORT_CHAT_PUBKEY override "${raw}" is neither a 64-char hex pubkey nor a valid npub; using the default support pubkey`,
  )
  return DEFAULT_SUPPORT_CHAT_PUBKEY
}

export const SUPPORT_CHAT_PUBKEY = normalizeSupportChatPubkey(Config.SUPPORT_CHAT_PUBKEY)

export const WHATSAPP_CONTACT_NUMBER = "+18762909250"
// Derived from the support number, not wa.flashapp.me: that host has served a
// static "WhatsApp support is temporarily unavailable" placeholder since the
// 2026-08 account suspension (#703), dead-ending every button that opened it.
// wa.me requires the number digits-only — a literal "+" in the path 404s.
export const WHATSAPP_SUPPORT_URL = `https://wa.me/${WHATSAPP_CONTACT_NUMBER.replace(
  /\D/g,
  "",
)}`
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
