import { Linking } from "react-native"

import {
  buildWhatsAppSupportUrl,
  openWhatsAppAction,
} from "../../app/components/contact-modal/contact-modal.logic"

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
})
