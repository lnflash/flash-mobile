import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { replyText } from "../cards/card-parts"
import { helpAnswerText } from "./reply-presentation"
import { screenDestinationTitle } from "./screen-destinations"
import { pricePresentation, PriceDisplay } from "./price-presentation"
import type { ThreadEntry } from "./thread-store"
loadLocale("en")
const english = i18nObject("en")
export type SpokenReply = { text: string; locale: string; automatic: boolean }
const automaticReplies = new Set([
  "Assistant.unknownIntent",
  "Assistant.actionsOffline",
  "Assistant.toolFailed",
  "Assistant.noSavedData",
])
export const spokenReplyFor = (
  entry: ThreadEntry,
  {
    LL,
    locale,
    display,
  }: { LL: TranslationFunctions; locale: string; display: PriceDisplay },
): SpokenReply | undefined => {
  const speechLocale = (text: string, base: string) =>
    text === base ? "en-US" : locale.replace("_", "-")
  const manual = (text: string): SpokenReply => ({
    text,
    locale: "en-US",
    automatic: false,
  })
  switch (entry.kind) {
    case "user":
    case "card":
      return undefined
    case "help": {
      const text = helpAnswerText(LL, entry.topic)
      const base = helpAnswerText(english, entry.topic)
      // Limits/status guidance can disclose the existence of financial activity.
      return {
        text,
        locale: speechLocale(text, base),
        automatic:
          entry.topic !== "limits" &&
          entry.topic !== "paymentStatus" &&
          entry.topic !== "address",
      }
    }
    case "screen": {
      const title = screenDestinationTitle(LL, entry.destination)
      return {
        text: LL.AskFlashHelp.screenLocation({ screen: title }),
        // The navigation sentence currently falls back to English in other locales.
        locale: "en-US",
        automatic: true,
      }
    }
    case "reply": {
      if (entry.replyKey === "Assistant.amountUnclear") return undefined
      const text = replyText(LL, entry.replyKey)
      return {
        text,
        locale: speechLocale(text, replyText(english, entry.replyKey)),
        automatic: automaticReplies.has(entry.replyKey),
      }
    }
    default:
      break
  }
  // Financial narration is English-only in v1, until matching localized number
  // and currency speech templates are available. Guidance supports its actual language.
  if (!locale.toLowerCase().startsWith("en")) return undefined
  const saved =
    "stale" in entry && entry.stale
      ? entry.kind === "address"
        ? LL.AskFlashHelp.addressSaved()
        : entry.asOf
        ? LL.AskFlashHelp.savedAt({ time: new Date(entry.asOf).toLocaleString(locale) })
        : LL.AskFlash.staleBadge()
      : ""
  switch (entry.kind) {
    case "balances": {
      const rows = entry.payload.balances.map((row) =>
        row.state === "ok"
          ? `${display.formatMoneyAmount({
              moneyAmount: row.balance,
              noSymbol: true,
              noSuffix: true,
            })} ${
              row.wallet === "BTC"
                ? LL.AskFlashSpeech.satoshis()
                : row.wallet === "USD"
                ? LL.AskFlashSpeech.usDollars()
                : LL.AskFlashSpeech.usdt()
            }`
          : replyText(LL, row.replyKey),
      )
      return manual(
        [saved, LL.AskFlashSpeech.balanceTitle(), ...rows].filter(Boolean).join(". "),
      )
    }
    case "price": {
      const value = pricePresentation(entry.payload, display)
      if (!value) return undefined
      const currency =
        entry.payload.currency === "JMD"
          ? LL.AskFlashSpeech.jamaicanDollars()
          : entry.payload.currency === "USD"
          ? LL.AskFlashSpeech.usDollars()
          : entry.payload.currency
      return manual(
        LL.AskFlashSpeech.price({
          value,
          currency,
          time: new Date(entry.payload.timestamp * 1000).toLocaleString(locale),
        }),
      )
    }
    case "address":
      return manual(
        entry.state === "available" && entry.address
          ? [
              saved,
              LL.AskFlashHelp.addressTitle(),
              entry.address
                .replace(/@/g, " at ")
                .replace(/\./g, " dot ")
                .replace(/_/g, " underscore ")
                .replace(/-/g, " dash "),
            ]
              .filter(Boolean)
              .join(". ")
          : entry.state === "notSet"
          ? LL.AskFlashHelp.addressNotSet()
          : entry.stale
          ? LL.AskFlashHelp.addressOfflineUnavailable()
          : LL.AskFlashHelp.addressUnavailable(),
      )
    case "transactions":
      return manual(
        [
          saved,
          entry.stale ? LL.AskFlashHelp.incompleteHistory() : "",
          LL.AskFlashSpeech.history(),
        ]
          .filter(Boolean)
          .join(". "),
      )
    case "details":
      return manual([saved, LL.AskFlashSpeech.details()].filter(Boolean).join(". "))
    case "limits":
      return manual([saved, LL.AskFlashSpeech.limits()].filter(Boolean).join(". "))
  }
}
