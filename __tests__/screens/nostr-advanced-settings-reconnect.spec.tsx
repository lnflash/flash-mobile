/**
 * Settings › Nostr › Advanced › Reconnect profile — the alert the user sees.
 *
 * Contract under test:
 *  - ok       → success alert, then the screen refreshes.
 *  - refused  → refused copy (never success), screen still refreshes.
 *  - no-key   → no-profile alert, no refresh.
 *  - rejected mutation → relink-failed copy.
 *  - a refresh that rejects AFTER a successful write must not turn the
 *    success into a "try again" error.
 */
import React from "react"
import { Alert } from "react-native"
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { nip19 } from "nostr-tools"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

const mockUserUpdateNpub = jest.fn()
const mockGetSigner = jest.fn()

jest.mock("@rneui/themed", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Text } = require("react-native")
  return {
    Text,
    useTheme: () => ({ theme: { colors: {} } }),
    makeStyles: () => () => ({}),
  }
})

jest.mock("react-native-vector-icons/Ionicons", () => () => null)

jest.mock("@app/graphql/generated", () => ({
  useUserUpdateNpubMutation: () => [mockUserUpdateNpub],
}))

jest.mock("@app/hooks/use-nostr-profile", () => () => ({
  deleteNostrKeys: jest.fn(),
}))

jest.mock("@app/components/import-nsec/import-nsec-modal", () => ({
  ImportNsecModal: () => null,
}))

jest.mock("@app/screens/settings-screen/nostr-settings/key-modal", () => ({
  KeyModal: () => null,
}))

jest.mock("@app/screens/chat/chatContext", () => ({
  useChatContext: () => ({
    resetChat: jest.fn(),
    refreshUserProfile: jest.fn(),
    contactsEvent: null,
  }),
}))

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/utils/nostr", () => ({
  createContactListEvent: jest.fn(),
}))

jest.mock("@app/nostr/signer", () => ({
  getSigner: () => mockGetSigner(),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const advancedSettingsModule = require("@app/screens/settings-screen/nostr-settings/advanced-settings")
const { AdvancedSettings } = advancedSettingsModule

loadLocale("en")
const LL = i18nObject("en")

const LOCAL_HEX = "a".repeat(64)
const LOCAL_NPUB = nip19.npubEncode(LOCAL_HEX)

describe("AdvancedSettings › Reconnect profile", () => {
  let alertSpy: jest.SpyInstance
  let onReconnect: jest.Mock

  const pressReconnect = () => {
    const screen = render(
      <AdvancedSettings
        expandAdvanced
        copyToClipboard={jest.fn()}
        onReconnect={onReconnect}
        accountLinked={false}
      />,
    )
    fireEvent.press(screen.getByText(LL.Nostr.reconnectProfile()))
    return screen
  }

  beforeEach(() => {
    jest.clearAllMocks()
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
    onReconnect = jest.fn().mockResolvedValue(undefined)
    mockGetSigner.mockResolvedValue({ getPublicKey: async () => LOCAL_HEX })
  })

  it("reports success and refreshes when the backend accepts the key", async () => {
    mockUserUpdateNpub.mockResolvedValue({ data: { userUpdateNpub: { errors: [] } } })
    pressReconnect()
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
    expect(mockUserUpdateNpub).toHaveBeenCalledWith({
      variables: { input: { npub: LOCAL_NPUB } },
    })
    expect(alertSpy).toHaveBeenCalledWith(
      LL.common.success(),
      LL.Nostr.profileReconnected(),
    )
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it("reports the refusal, never success, when another account holds the key", async () => {
    mockUserUpdateNpub.mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })
    pressReconnect()
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
    expect(alertSpy).toHaveBeenCalledWith(
      LL.common.error(),
      LL.Nostr.keyMismatchRelinkRefused(),
    )
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it("says there is no profile when the device has no key", async () => {
    mockGetSigner.mockRejectedValue(new Error("No signer available"))
    pressReconnect()
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
    expect(alertSpy).toHaveBeenCalledWith(LL.Nostr.noProfileIdExists())
    expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    expect(onReconnect).not.toHaveBeenCalled()
  })

  it("reports a failed relink when the mutation rejects", async () => {
    mockUserUpdateNpub.mockRejectedValue(new Error("network"))
    pressReconnect()
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
    expect(alertSpy).toHaveBeenCalledWith(
      LL.common.error(),
      LL.Nostr.keyMismatchRelinkFailed(),
    )
    expect(onReconnect).not.toHaveBeenCalled()
  })

  it("keeps the success when the refresh rejects after a successful write", async () => {
    mockUserUpdateNpub.mockResolvedValue({ data: { userUpdateNpub: { errors: [] } } })
    onReconnect.mockRejectedValue(new Error("connection dropped"))
    pressReconnect()
    await waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(1))
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(alertSpy).toHaveBeenCalledWith(
      LL.common.success(),
      LL.Nostr.profileReconnected(),
    )
    expect(alertSpy).not.toHaveBeenCalledWith(
      LL.common.error(),
      LL.Nostr.keyMismatchRelinkFailed(),
    )
  })
})
