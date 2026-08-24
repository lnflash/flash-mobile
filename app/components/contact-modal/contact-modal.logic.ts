import { WHATSAPP_CONTACT_NUMBER } from "@app/config"
import { openWhatsAppUrl } from "@app/utils/external"

/**
 * The support chat URL with the message prefilled.
 *
 * The message is the whole point: callers pass app version and device context
 * so support starts triage with facts instead of "hi". openWhatsAppAction used
 * to accept it and drop it — and worse, it routed through WHATSAPP_SUPPORT_URL
 * (wa.flashapp.me), which since the 2026-08 account suspension serves a
 * "support unavailable" placeholder page, so the button delivered neither the
 * chat nor the context (#703).
 *
 * `wa.me` rather than the `whatsapp://` scheme deliberately: the scheme
 * rejects when WhatsApp is not installed (an unhandled rejection out of a
 * button handler), while the universal link opens the app when present and
 * falls back to a browser page that offers the chat. wa.me requires the number
 * digits-only — a literal `+` in the path 404s.
 */
export const buildWhatsAppSupportUrl = (message: string): string => {
  const number = WHATSAPP_CONTACT_NUMBER.replace(/[^0-9]/g, "")
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export const openWhatsAppAction = (message: string) =>
  openWhatsAppUrl(buildWhatsAppSupportUrl(message))
