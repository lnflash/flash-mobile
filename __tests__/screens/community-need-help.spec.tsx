import React from "react"
import { Alert, Linking } from "react-native"

import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { ContextForScreen } from "./helper"

import { NeedHelpSetting } from "../../app/screens/settings-screen/settings/community-need-help"
import { PersistentStateContext } from "../../app/store/persistent-state"
import { SUPPORT_CHAT_PUBKEY } from "../../app/config"
import { loadAllLocales } from "../../app/i18n/i18n-util.sync"

jest.mock("react-native-device-info", () =>
  require("react-native-device-info/jest/react-native-device-info-mock"),
)

const mockNavigate = jest.fn()
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate }),
}))

let mockUserPublicKey: string | null = null
jest.mock("@app/screens/chat/chatContext", () => ({
  useChatContext: () => ({ userPublicKey: mockUserPublicKey }),
}))

// Sorts AFTER the support pubkey (which starts with "06"), so the expected
// groupId below also proves getGroupId's participant sorting is applied.
const USER_PUBKEY = "f".repeat(64)
const EXPECTED_GROUP_ID = `${SUPPORT_CHAT_PUBKEY},${USER_PUBKEY}`

// TypesafeI18n renders nothing until translations are loaded; the app does
// this at startup in app.tsx, so tests that assert on copy must do it too.
beforeAll(() => {
  loadAllLocales()
})

type RenderOptions = {
  chatEnabled?: boolean
  updateState?: jest.Mock
}

const needHelpTree = ({ chatEnabled, updateState = jest.fn() }: RenderOptions) => (
  <ContextForScreen>
    <PersistentStateContext.Provider
      value={{
        persistentState: {
          schemaVersion: 7,
          galoyInstance: { id: "Main" },
          galoyAuthToken: "",
          hasInitializedBreezSDK: false,
          unclaimedDeposits: 0,
          closedQuickStartTypes: [],
          chatEnabled,
        },
        updateState,
        resetState: () => {},
      }}
    >
      <NeedHelpSetting />
    </PersistentStateContext.Provider>
  </ContextForScreen>
)

const openAppChatRow = async () => {
  await act(async () => {})
  // The settings group renders collapsed; expand it first.
  fireEvent.press(screen.getByText("Need help? Contact us."))
  fireEvent.press(screen.getByText("App chat"))
  await act(async () => {})
}

describe("NeedHelpSetting", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserPublicKey = null
  })

  it("renders all support contact options", async () => {
    render(needHelpTree({ chatEnabled: true }))
    await act(async () => {})

    // The settings group renders collapsed; expand it first.
    fireEvent.press(screen.getByText("Need help? Contact us."))

    expect(screen.getByText("App chat")).toBeTruthy()
    expect(screen.getByText("Discord")).toBeTruthy()
    expect(screen.getByText("WhatsApp")).toBeTruthy()
    expect(screen.getByText("Email")).toBeTruthy()
  })

  it("navigates to the support DM with the sorted groupId when chat is enabled", async () => {
    mockUserPublicKey = USER_PUBKEY
    render(needHelpTree({ chatEnabled: true }))

    await openAppChatRow()

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("Primary", {
      screen: "Chat",
      params: { screen: "messages", params: { groupId: EXPECTED_GROUP_ID } },
    })
  })

  it("surfaces an alert with an email fallback instead of navigating when the nostr key is missing", async () => {
    // A restored-device user can have a backend npub but no local key; the
    // support entry point must not be a silent no-op for them.
    const alertSpy = jest.spyOn(Alert, "alert")
    const openUrlSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)
    mockUserPublicKey = null
    render(needHelpTree({ chatEnabled: true }))

    await openAppChatRow()

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledTimes(1)

    // The alert must offer the email channel as a working fallback.
    const buttons = alertSpy.mock.calls[0][2] ?? []
    const emailButton = buttons.find((b) => b.text === "Email")
    expect(emailButton).toBeTruthy()
    emailButton?.onPress?.()
    expect(openUrlSpy).toHaveBeenCalledTimes(1)
    expect(openUrlSpy.mock.calls[0][0]).toContain("mailto:support@getflash.io")
  })

  it("enables chat and defers navigation until chatEnabled is set — no timers involved", async () => {
    mockUserPublicKey = USER_PUBKEY
    const updateState = jest.fn()
    const { rerender } = render(needHelpTree({ chatEnabled: undefined, updateState }))

    await openAppChatRow()

    // Chat gets enabled via an updater that preserves the rest of the state...
    expect(updateState).toHaveBeenCalledTimes(1)
    const updater = updateState.mock.calls[0][0]
    expect(updater({ chatEnabled: false, other: "kept" })).toEqual({
      chatEnabled: true,
      other: "kept",
    })
    expect(updater(undefined)).toBeUndefined()

    // ...and navigation waits for the navigator to have the Chat route.
    expect(mockNavigate).not.toHaveBeenCalled()

    // Once persisted state reflects chatEnabled, the deferred navigation fires.
    rerender(needHelpTree({ chatEnabled: true, updateState }))
    await act(async () => {})

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("Primary", {
      screen: "Chat",
      params: { screen: "messages", params: { groupId: EXPECTED_GROUP_ID } },
    })

    // The pending navigation is one-shot: further state flips must not re-navigate.
    rerender(needHelpTree({ chatEnabled: true, updateState }))
    await act(async () => {})
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })
})
