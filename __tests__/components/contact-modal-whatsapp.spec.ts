import { Linking } from "react-native"
import Toast from "react-native-toast-message"

import {
  buildWhatsAppSupportUrl,
  openWhatsAppAction,
} from "../../app/components/contact-modal/contact-modal.logic"
import { CONTACT_EMAIL_ADDRESS, WHATSAPP_SUPPORT_URL } from "../../app/config"
import { loadAllLocales } from "../../app/i18n/i18n-util.sync"

beforeAll(() => {
  loadAllLocales()
})

describe("WhatsApp support action", () => {
  it("carries the message — the app/device context support triages from", () => {
    // The regression: openWhatsAppAction used to accept the message and drop
    // it, opening a chat with no context (#703). If this fails, support is
    // back to receiving "hi" with no version or device info.
    const url = buildWhatsAppSupportUrl(
      "Flash 0.6.8 (91) · Pixel 7 · account rewards_notifier",
    )
    expect(url).toContain("text=Flash%200.6.8%20(91)")
    expect(decodeURIComponent(url)).toContain("account rewards_notifier")
  })

  it("targets the support number directly via wa.me, not the placeholder page", () => {
    // wa.flashapp.me has served a "support unavailable" card since the 2026-08
    // suspension — routing there delivered neither chat nor message. wa.me with
    // the digits-only number opens the app when installed and a usable page
    // when not; a literal "+" in the wa.me path 404s, and the whatsapp://
    // scheme would reject with no handler installed.
    const url = buildWhatsAppSupportUrl("hello")
    expect(url).toMatch(/^https:\/\/wa\.me\/18762909250\?text=hello$/)
    expect(url).not.toContain("wa.flashapp.me")
    expect(url).not.toContain("+")
  })

  it("openWhatsAppAction opens exactly that URL", () => {
    // Pins the wiring, not just the builder — the original bug WAS the wiring.
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)
    openWhatsAppAction("hi from tests")
    expect(spy).toHaveBeenCalledWith(buildWhatsAppSupportUrl("hi from tests"))
    spy.mockRestore()
  })

  it("surfaces an email-fallback toast instead of an unhandled rejection when the link cannot open", async () => {
    // An Android device with no browser and no WhatsApp (managed/kiosk builds
    // exist) rejects openURL with no activity to handle the intent. A button
    // tap must never become an unhandled rejection — the user gets pointed at
    // the email channel that still works.
    const openSpy = jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("No Activity found to handle Intent"))
    const toastSpy = jest.spyOn(Toast, "show").mockImplementation(() => {})

    await expect(openWhatsAppAction("hi")).resolves.toBeUndefined()

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        text2: expect.stringContaining(CONTACT_EMAIL_ADDRESS),
      }),
    )
    openSpy.mockRestore()
    toastSpy.mockRestore()
  })
})

describe("WHATSAPP_SUPPORT_URL (the shared support-button target)", () => {
  it("targets the support number via wa.me, never the dead placeholder host", () => {
    // Three support buttons (Bank Accounts, Need Help, Bank Transfer) open this
    // constant directly. wa.flashapp.me has served a "support unavailable"
    // placeholder card since the 2026-08 suspension — pointing here again would
    // dead-end all of them (#703).
    expect(WHATSAPP_SUPPORT_URL).toBe("https://wa.me/18762909250")
    expect(WHATSAPP_SUPPORT_URL).not.toContain("wa.flashapp.me")
    expect(WHATSAPP_SUPPORT_URL).not.toContain("+")
  })
})
