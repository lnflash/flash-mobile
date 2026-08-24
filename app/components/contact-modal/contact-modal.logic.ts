import { CONTACT_EMAIL_ADDRESS, WHATSAPP_CONTACT_NUMBER } from "@app/config"
import { openWhatsAppUrl } from "@app/utils/external"
import { toastShow } from "@app/utils/toast"

/**
 * The support chat URL with the message prefilled.
 *
 * The message is the whole point: callers pass app version and device context
 * so support starts triage with facts instead of "hi". openWhatsAppAction used
 * to accept it and drop it — and worse, it routed through wa.flashapp.me,
 * which since the 2026-08 account suspension serves a "support unavailable"
 * placeholder page, so the button delivered neither the chat nor the context
 * (#703).
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

// Even a universal link can fail to open — an Android device with no browser
// and no WhatsApp (managed/kiosk builds exist) rejects with no activity to
// handle the intent. Catch it so a button tap never becomes an unhandled
// rejection, and point the user at the email channel that still works.
export const openWhatsAppAction = (message: string) =>
  openWhatsAppUrl(buildWhatsAppSupportUrl(message)).catch(() =>
    toastShow({
      message: (translations) =>
        translations.support.whatsappOpenFailed({ email: CONTACT_EMAIL_ADDRESS }),
    }),
  )
