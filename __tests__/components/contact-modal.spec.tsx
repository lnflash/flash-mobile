import React from "react"
import { Linking } from "react-native"

import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { ContextForScreen } from "../screens/helper"

import ContactModal from "../../app/components/contact-modal/contact-modal"
import { buildWhatsAppSupportUrl } from "../../app/components/contact-modal/contact-modal.logic"
import { loadAllLocales } from "../../app/i18n/i18n-util.sync"

// TypesafeI18n renders nothing until translations are loaded; the app does
// this at startup in app.tsx, so tests that assert on copy must do it too.
beforeAll(() => {
  loadAllLocales()
})

describe("ContactModal", () => {
  it("pressing WhatsApp opens the support chat with the messageBody prefilled", async () => {
    // Pins the component call site, not just the exported helper. #703's
    // failure shape — the button handler and the message parting ways — can
    // recur one level up: a refactor that calls openWhatsAppAction("") or
    // drops messageBody at the call site would pass every logic-only test.
    const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)
    const toggleModal = jest.fn()
    const messageBody = "Flash 0.6.8 (91) · Pixel 7 · account rewards_notifier"

    render(
      <ContextForScreen>
        <ContactModal
          isVisible={true}
          toggleModal={toggleModal}
          messageBody={messageBody}
          messageSubject="Support request"
        />
      </ContextForScreen>,
    )
    await act(async () => {})

    fireEvent.press(screen.getByText("WhatsApp"))
    await act(async () => {})

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith(buildWhatsAppSupportUrl(messageBody))
    expect(toggleModal).toHaveBeenCalledTimes(1)
    openSpy.mockRestore()
  })
})
