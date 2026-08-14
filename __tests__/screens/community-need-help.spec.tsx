import React from "react"

import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { ContextForScreen } from "./helper"

import { NeedHelpSetting } from "../../app/screens/settings-screen/settings/community-need-help"

jest.mock("react-native-device-info", () =>
  require("react-native-device-info/jest/react-native-device-info-mock"),
)

// TypesafeI18n renders nothing until translations are loaded; the app does
// this at startup in app.tsx, so tests that assert on copy must do it too.
beforeAll(() => {
  const { loadAllLocales } = require("../../app/i18n/i18n-util.sync")
  loadAllLocales()
})

describe("NeedHelpSetting", () => {
  it("renders all support contact options", async () => {
    render(
      <ContextForScreen>
        <NeedHelpSetting />
      </ContextForScreen>,
    )
    await act(async () => {})

    // The settings group renders collapsed; expand it first.
    fireEvent.press(screen.getByText("Need help? Contact us."))

    expect(screen.getByText("App chat")).toBeTruthy()
    expect(screen.getByText("Discord")).toBeTruthy()
    expect(screen.getByText("WhatsApp")).toBeTruthy()
    expect(screen.getByText("Email")).toBeTruthy()
  })

  it("does not crash when App chat is pressed before the nostr key is ready", async () => {
    // Outside ChatContextProvider, userPublicKey is the context default (""),
    // so the handler must be a safe no-op rather than navigating with a
    // malformed groupId.
    render(
      <ContextForScreen>
        <NeedHelpSetting />
      </ContextForScreen>,
    )
    await act(async () => {})

    fireEvent.press(screen.getByText("Need help? Contact us."))
    fireEvent.press(screen.getByText("App chat"))
    await act(async () => {})
  })
})
