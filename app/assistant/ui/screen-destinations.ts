import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { normalize, textOf } from "../grammar/normalize"

// Only stable, named entry screens. A detail, payment, or edit flow that needs
// an account, contact, amount, or confirmation is intentionally not listed.
export const SCREEN_DESTINATIONS = {
  home: ["home", "home screen", "dashboard"],
  support: ["support", "support chat", "in app support", "inapp support", "help center"],
  contacts: ["contacts", "my contacts", "contact list", "contact profile"],
  map: ["map", "merchant map", "nearby map"],
  chat: ["chat", "chats", "messages", "chat list"],
  chatProfile: ["chat profile", "my chat profile", "social profile", "my profile"],
  settings: ["settings", "app settings"],
  account: ["account", "account settings", "my account"],
  bankAccounts: ["bank accounts", "my bank accounts"],
  transfers: ["transfer", "transfers", "top up", "cash out", "settlements"],
  receive: ["receive", "receive screen", "receive money"],
  scanner: ["scanner", "qr scanner", "scan qr code"],
  history: ["payment history", "transaction history", "history"],
  card: ["card", "flashcard", "my card"],
  invite: ["invite friends", "invite a friend", "invite friend"],
  referrals: ["referrals", "my referrals"],
  notifications: ["notifications", "notification settings"],
  language: ["language", "language settings"],
  currency: ["currency", "currency settings"],
  theme: ["theme", "appearance", "theme settings"],
  backup: ["backup", "wallet backup", "backup options"],
  security: ["security", "security settings"],
  limits: ["transaction limits", "account limits"],
  defaultWallet: ["default wallet", "wallet settings"],
  socialSettings: ["chat settings", "social settings"],
  bitcoinPrice: ["bitcoin price", "price chart"],
  bitcoinWallet: ["bitcoin wallet", "btc wallet"],
  bitcoinWalletOn: [],
  bitcoinWalletOff: [],
} as const

export type ScreenDestination = keyof typeof SCREEN_DESTINATIONS

/** Match the entire destination phrase: a payment with a named payee never becomes navigation. */
export const readScreenDestination = (
  utterance: string,
): ScreenDestination | undefined => {
  const text = textOf(normalize(utterance).tokens).replace(/(?: (?:please|again))+$/, "")
  // Bare "bitcoin price" is an existing live-price read, not a request to open a chart.
  if (text === "bitcoin price") return undefined
  if (
    /^(?:turn on|enable|activate) (?:my |the )?(?:bitcoin|btc) (?:wallet|account)$|^(?:turn on|enable) (?:my |the )?advance(?:d)? mode$/.test(
      text,
    )
  )
    return "bitcoinWalletOn"
  if (
    /^(?:turn off|disable|deactivate) (?:my |the )?(?:bitcoin|btc) (?:wallet|account)$|^(?:turn off|disable) (?:my |the )?advance(?:d)? mode$/.test(
      text,
    )
  )
    return "bitcoinWalletOff"
  if (/^show (?:my |the )?(?:bitcoin|btc) wallet$/.test(text)) return "bitcoinWallet"
  const match =
    /^(?:please )?(?:(?:can you|could you|would you) )?(?:(?:open|go to|navigate to|take me to|bring me to|show me|find|where is|where are|where do i find|how do i find|how can i find|where can i find|how do i get to|i want to see) )?(.+?)(?: screen| page| tab)?$/.exec(
      text,
    )
  if (!match) return undefined
  const phrase = match[1].replace(/^the /, "")
  const phrases = [phrase, phrase.replace(/^my /, "")]
  return (Object.keys(SCREEN_DESTINATIONS) as ScreenDestination[]).find((destination) =>
    phrases.some((candidate) =>
      (SCREEN_DESTINATIONS[destination] as readonly string[]).includes(candidate),
    ),
  )
}

export const screenDestinationTitle = (
  LL: TranslationFunctions,
  destination: ScreenDestination,
): string => {
  switch (destination) {
    case "home":
      return LL.HomeScreen.title()
    case "support":
      return LL.support.appChat()
    case "contacts":
      return LL.ContactsScreen.title()
    case "map":
      return LL.MapScreen.title()
    case "chat":
      return LL.ChatScreen.title()
    case "chatProfile":
      return LL.Nostr.editProfile()
    case "settings":
      return LL.SettingsScreen.title()
    case "account":
      return LL.common.account()
    case "bankAccounts":
      return LL.BankAccountsScreen.title()
    case "transfers":
      return LL.HomeScreen.transfer()
    case "receive":
      return LL.ReceiveScreen.title()
    case "scanner":
      return LL.ScanningQRCodeScreen.title()
    case "history":
      return LL.TransactionScreen.transactionHistoryTitle()
    case "card":
      return LL.FlashcardV2.title()
    case "invite":
      return LL.SettingsScreen.inviteFriend()
    case "referrals":
      return LL.MyReferrals.title()
    case "notifications":
      return LL.NotificationSettingsScreen.title()
    case "language":
      return LL.common.languagePreference()
    case "currency":
      return LL.common.currency()
    case "theme":
      return LL.ThemeScreen.title()
    case "backup":
      return LL.BackupOptions.title()
    case "security":
      return LL.common.security()
    case "limits":
      return LL.common.transactionLimits()
    case "defaultWallet":
      return LL.DefaultWalletScreen.title()
    case "socialSettings":
      return LL.SettingsScreen.showNostrSecret()
    case "bitcoinPrice":
      return LL.common.bitcoinPrice()
    case "bitcoinWallet":
    case "bitcoinWalletOn":
    case "bitcoinWalletOff":
      return LL.common.btcAccount()
  }
}
