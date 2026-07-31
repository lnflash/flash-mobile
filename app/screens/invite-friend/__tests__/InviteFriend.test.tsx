import React from "react"
import { Alert } from "react-native"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { MockedProvider, MockedResponse } from "@apollo/client/testing"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { CreateInviteDocument, InviteMethod } from "@app/graphql/generated"
import InviteFriend from "../InviteFriend"

// Mock i18n deterministically so LL.* resolves synchronously (the real TypesafeI18n
// loads its dictionary asynchronously, leaving LL-derived labels empty on first render).
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({
    LL: {
      InviteFriend: {
        title: () => "Invite a friend to Flash!",
        subtitle: () => "Enter a phone number or email address to invite a friend.",
        invite: () => "Invite",
        invitationSuccessTitle: () => "Invitation sent",
        done: () => "Done",
      },
      common: {
        cancel: () => "Cancel",
        error: () => "Error",
      },
    },
  }),
}))

// The invite screen only reaches for react-native-contacts / permissions once the
// contact picker is opened. These tests never open it, but the module is imported at
// the top of ContactPicker, so stub the native bridges to keep import side effects inert.
jest.mock("react-native-contacts", () => ({ getAll: jest.fn().mockResolvedValue([]) }))
jest.mock("react-native-permissions", () => ({
  PERMISSIONS: {
    IOS: { CONTACTS: "ios.contacts" },
    ANDROID: { READ_CONTACTS: "android.contacts" },
  },
  RESULTS: {
    GRANTED: "granted",
    DENIED: "denied",
    BLOCKED: "blocked",
    UNAVAILABLE: "unavailable",
  },
  check: jest.fn().mockResolvedValue("denied"),
  request: jest.fn().mockResolvedValue("denied"),
  openSettings: jest.fn(),
}))

const EMAIL_PLACEHOLDER = "friend@email.com"
const INVITE_LABEL = "Invite"
const EMAIL_TAB = "Email"

const inviteResult = (contact: string, method: string) => ({
  createInvite: {
    invite: {
      id: "invite-1",
      contact,
      method,
      status: "SENT",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
    },
    errors: [],
  },
})

const createInviteMock = (
  contact: string,
  method: string,
  override?: Partial<MockedResponse>,
): MockedResponse => ({
  request: {
    query: CreateInviteDocument,
    variables: { input: { contact, method } },
  },
  result: { data: inviteResult(contact, method) },
  ...override,
})

const renderScreen = (mocks: MockedResponse[] = []) => {
  const navigate = jest.fn()
  const navigation = { navigate } as never
  const route = { key: "InviteFriend", name: "InviteFriend", params: undefined } as never
  const utils = render(
    <ThemeProvider theme={theme}>
      <MockedProvider mocks={mocks} addTypename={false}>
        <InviteFriend navigation={navigation} route={route} />
      </MockedProvider>
    </ThemeProvider>,
  )
  return { ...utils, navigate }
}

// Switch to the Email tab and type an address. Returns nothing; asserts happen in tests.
const enterEmail = async (utils: ReturnType<typeof renderScreen>, address: string) => {
  const { getByText, getByPlaceholderText } = utils
  // Wait for i18n + screen to mount (TypesafeI18n gates rendering until the locale loads).
  await waitFor(() => expect(getByText(EMAIL_TAB)).toBeTruthy())
  fireEvent.press(getByText(EMAIL_TAB))
  const emailInput = await waitFor(() => getByPlaceholderText(EMAIL_PLACEHOLDER))
  fireEvent.changeText(emailInput, address)
}

describe("InviteFriend screen", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("renders the three invite methods", async () => {
    const utils = renderScreen()
    const { getByText } = utils
    await waitFor(() => expect(getByText("Contacts")).toBeTruthy())
    expect(getByText("WhatsApp")).toBeTruthy()
    expect(getByText(EMAIL_TAB)).toBeTruthy()
    expect(getByText(INVITE_LABEL)).toBeTruthy()
  })

  it("keeps the submit button disabled until a valid email is entered", async () => {
    const utils = renderScreen()
    const { getByText } = utils
    await enterEmail(utils, "not-an-email")
    expect(getByText(INVITE_LABEL)).toBeDisabled()

    fireEvent.changeText(
      utils.getByPlaceholderText(EMAIL_PLACEHOLDER),
      "friend@example.com",
    )
    await waitFor(() => expect(getByText(INVITE_LABEL)).toBeEnabled())
  })

  it("sends an email invite and navigates to the success screen", async () => {
    const address = "friend@example.com"
    const utils = renderScreen([createInviteMock(address, InviteMethod.Email)])
    await enterEmail(utils, address)

    fireEvent.press(utils.getByText(INVITE_LABEL))

    await waitFor(() =>
      expect(utils.navigate).toHaveBeenCalledWith("InviteFriendSuccess", {
        contact: address,
        method: InviteMethod.Email,
      }),
    )
  })

  it("surfaces a server-side error via an alert", async () => {
    const address = "dup@example.com"
    const mock = createInviteMock(address, InviteMethod.Email, {
      result: { data: { createInvite: { invite: null, errors: ["Already invited"] } } },
    })
    const utils = renderScreen([mock])
    await enterEmail(utils, address)

    fireEvent.press(utils.getByText(INVITE_LABEL))

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Error", "Already invited"),
    )
    expect(utils.navigate).not.toHaveBeenCalled()
  })

  it("handles a network error gracefully", async () => {
    const address = "netfail@example.com"
    const mock = createInviteMock(address, InviteMethod.Email, {
      error: new Error("Network error"),
    })
    const utils = renderScreen([mock])
    await enterEmail(utils, address)

    fireEvent.press(utils.getByText(INVITE_LABEL))

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Error",
        "Unable to send invitation. Please try again.",
      ),
    )
    expect(utils.navigate).not.toHaveBeenCalled()
  })
})
