/**
 * Settings › Nostr › Advanced › Import nsec — what the form tells the user.
 *
 * Contract under test:
 *  - accepted → Success alert, the signed-in account is stamped as the owner.
 *  - refused (NPUB_NOT_AVAILABLE) → never the Success alert; the error shows
 *    in the form, no owner stamp, `onSubmit` reports failure. Shared phone: B
 *    imports A's nsec, A holds it on the backend.
 */
import React from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Alert } from "react-native"
import * as Keychain from "react-native-keychain"
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools"
import { getNostrKeyOwner } from "@app/nostr/key-owner"
import {
  KEYCHAIN_NOSTRCREDS_KEY,
  NSEC_REGISTERED_ELSEWHERE_ERROR,
} from "@app/components/import-nsec/utils"

const mockUserUpdateNpub = jest.fn()

jest.mock("@rneui/themed", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require("react-native")
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactLib = require("react")
  const Input = ({
    value,
    onChangeText,
    placeholder,
    errorMessage,
  }: {
    value: string
    onChangeText: (t: string) => void
    placeholder: string
    errorMessage: string
  }) =>
    ReactLib.createElement(
      RN.View,
      null,
      ReactLib.createElement(RN.TextInput, { value, onChangeText, placeholder }),
      errorMessage ? ReactLib.createElement(RN.Text, null, errorMessage) : null,
    )
  return {
    Text: RN.Text,
    Input,
    useTheme: () => ({ theme: { colors: {} } }),
    makeStyles: () => () => ({}),
  }
})

jest.mock("@app/graphql/generated", () => ({
  useUserUpdateNpubMutation: () => [mockUserUpdateNpub],
  useHomeAuthedQuery: () => ({ data: { me: { id: "account-b", npub: null } } }),
}))

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NsecInputForm } = require("@app/components/import-nsec/import-nsec-form")

const newKey = () => {
  const sk = generateSecretKey()
  return { nsec: nip19.nsecEncode(sk), npub: nip19.npubEncode(getPublicKey(sk)) }
}

// The first render transforms nostr-tools and the RN form stack; under
// `--runInBand` after other suites that can exceed the default 5s.
jest.setTimeout(30000)

describe("NsecInputForm", () => {
  let alertSpy: jest.SpyInstance
  let onSubmit: jest.Mock

  const submit = (nsec: string) => {
    const screen = render(<NsecInputForm onSubmit={onSubmit} />)
    fireEvent.changeText(screen.getByPlaceholderText("nsec1..."), nsec)
    fireEvent.press(screen.getByText("Submit"))
    return screen
  }

  beforeEach(async () => {
    await AsyncStorage.clear()
    await Keychain.resetInternetCredentials({ server: KEYCHAIN_NOSTRCREDS_KEY })
    jest.clearAllMocks()
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
    onSubmit = jest.fn()
  })

  it("shows success and stamps the signed-in account as owner when accepted", async () => {
    const { nsec, npub } = newKey()
    mockUserUpdateNpub.mockResolvedValue({ data: { userUpdateNpub: { errors: [] } } })
    submit(nsec)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(nsec, true))
    expect(mockUserUpdateNpub).toHaveBeenCalledWith({
      variables: { input: { npub } },
    })
    expect(alertSpy).toHaveBeenCalledWith("Success", "nsec imported successfully!")
    // The owner stamp must flow through the rendered form's wiring
    // (`accountId: dataAuthed?.me?.id`), not only through the util.
    expect(await getNostrKeyOwner(npub)).toBe("account-b")
  })

  it("never shows success when the backend refuses the key", async () => {
    const { nsec, npub } = newKey()
    mockUserUpdateNpub.mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })
    const screen = submit(nsec)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(nsec, false))
    expect(alertSpy).not.toHaveBeenCalled()
    expect(screen.getByText(NSEC_REGISTERED_ELSEWHERE_ERROR)).toBeTruthy()
    expect(await getNostrKeyOwner(npub)).toBeNull()
  })
})
