import React from "react"
import { Linking, StyleSheet } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { ContextForScreen } from "../screens/helper"

import ContactModal from "../../app/components/contact-modal/contact-modal"
import { buildWhatsAppSupportUrl } from "../../app/components/contact-modal/contact-modal.logic"
import { loadAllLocales } from "../../app/i18n/i18n-util.sync"

// The sheet pads by the safe-area inset (ENG-605). The provider mock feeds
// `useSafeAreaInsets` from context so a test can pin that the sheet applies it.
jest.mock("react-native-safe-area-context", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactActual = require("react")
  const actual = jest.requireActual("react-native-safe-area-context")
  const ZERO = { top: 0, bottom: 0, left: 0, right: 0 }
  const NO_FRAME = { x: 0, y: 0, width: 0, height: 0 }
  return {
    ...actual,
    useSafeAreaInsets: () => ReactActual.useContext(actual.SafeAreaInsetsContext) ?? ZERO,
    // Provides the frame context too: react-navigation's header (inside
    // ContextForScreen) reads `useSafeAreaFrame` and throws without it.
    SafeAreaProvider: ({
      children,
      initialMetrics,
    }: {
      children: React.ReactNode
      initialMetrics?: { insets: typeof ZERO; frame?: typeof NO_FRAME }
    }) =>
      ReactActual.createElement(
        actual.SafeAreaFrameContext.Provider,
        { value: initialMetrics?.frame ?? NO_FRAME },
        ReactActual.createElement(
          actual.SafeAreaInsetsContext.Provider,
          { value: initialMetrics?.insets ?? ZERO },
          children,
        ),
      ),
  }
})

// Android 15 3-button nav under edge-to-edge.
const THREE_BUTTON_NAV = { top: 24, bottom: 48, left: 0, right: 0 }

// TypesafeI18n renders nothing until translations are loaded; the app does
// this at startup in app.tsx, so tests that assert on copy must do it too.
beforeAll(() => {
  loadAllLocales()
})

describe("ContactModal", () => {
  it("pads the sheet by the bottom safe-area inset (ENG-605)", async () => {
    // Inline (coverScreen={false}) means the list reaches the physical window
    // edge, so the wrapper must clear the nav bar itself. It has no padding of
    // its own, so the inset is the whole value.
    render(
      <SafeAreaProvider
        initialMetrics={{
          insets: THREE_BUTTON_NAV,
          frame: { x: 0, y: 0, width: 0, height: 0 },
        }}
      >
        <ContextForScreen>
          <ContactModal
            isVisible={true}
            toggleModal={jest.fn()}
            messageBody="body"
            messageSubject="subject"
          />
        </ContextForScreen>
      </SafeAreaProvider>,
    )
    await act(async () => {})

    const sheet = screen.getByTestId("contact-modal-sheet")
    expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(
      THREE_BUTTON_NAV.bottom,
    )
  })

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
