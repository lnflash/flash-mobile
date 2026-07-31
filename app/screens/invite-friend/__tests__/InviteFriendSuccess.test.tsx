import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import InviteFriendSuccess from "../InviteFriendSuccess"

// Mock i18n so LL.* resolves synchronously (the real TypesafeI18n loads async).
// invitationSuccessTitle takes an interpolation arg `{ value }`.
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({
    LL: {
      InviteFriend: {
        invitationSuccessTitle: ({ value }: { value: string }) =>
          `Invitation has been sent to ${value}`,
        done: () => "Done",
      },
    },
  }),
}))

// Screen + this component read safe-area insets; provide static insets.
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

const renderSuccess = (params?: { contact?: string; method?: string }) => {
  const popToTop = jest.fn()
  const navigation = { popToTop } as never
  const route = { key: "s", name: "InviteFriendSuccess", params } as never
  const utils = render(
    <ThemeProvider theme={theme}>
      <InviteFriendSuccess navigation={navigation} route={route} />
    </ThemeProvider>,
  )
  return { ...utils, popToTop }
}

describe("InviteFriendSuccess screen", () => {
  afterEach(() => jest.clearAllMocks())

  it("renders the success title with the contact from route params", () => {
    const { getByText } = renderSuccess({
      contact: "friend@example.com",
      method: "EMAIL",
    })
    expect(getByText("Invitation has been sent to friend@example.com")).toBeTruthy()
  })

  it("falls back to a default recipient when no contact is provided", () => {
    const { getByText } = renderSuccess(undefined)
    expect(getByText("Invitation has been sent to your friend")).toBeTruthy()
  })

  it("returns to the top of the stack when Done is pressed", () => {
    const { getByText, popToTop } = renderSuccess({ contact: "a@b.com", method: "EMAIL" })
    fireEvent.press(getByText("Done"))
    expect(popToTop).toHaveBeenCalledTimes(1)
  })
})
