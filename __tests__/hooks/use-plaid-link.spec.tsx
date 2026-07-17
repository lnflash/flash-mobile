/**
 * usePlaidLink — Plaid Link + server-side public_token exchange (ENG-524).
 *
 * Contract under test:
 *  - openPlaidLink creates the Plaid session with the backend's linkToken and
 *    opens the native UI.
 *  - onSuccess exchanges { linkToken, publicToken } server-side, then runs
 *    onLinked (webhook-async refetch) and shows the "appears shortly" copy.
 *  - Exchange payload errors and thrown errors alert and never run onLinked;
 *    the activity indicator is always cleared.
 *  - onExit alerts only for real Plaid failures — plain user cancel is silent.
 */

import { Alert } from "react-native"
import { renderHook, act } from "@testing-library/react-hooks"
// Auto-mocked by __mocks__/react-native-plaid-link-sdk.js (native module)
import { create, open } from "react-native-plaid-link-sdk"

const mockExchange = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useBridgeExchangePlaidPublicTokenMutation: () => [mockExchange],
}))

const mockToggleActivityIndicator = jest.fn()
jest.mock("@app/hooks/useActivityIndicator", () => ({
  useActivityIndicator: () => ({
    toggleActivityIndicator: mockToggleActivityIndicator,
  }),
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({
    LL: {
      common: { error: () => "Error" },
      PlaidLink: {
        connectedTitle: () => "Bank connected",
        connectedBody: () => "Your bank is being linked and will appear here shortly.",
        exchangeFailed: () => "Failed to link your bank. Please try again.",
        linkFailed: () => "Bank linking failed. Please try again.",
      },
    },
  }),
}))

import { usePlaidLink } from "@app/hooks/use-plaid-link"

type PlaidHandlers = {
  onSuccess: (success: { publicToken: string }) => Promise<void>
  onExit: (exit: { error?: { errorMessage?: string } }) => void
}

const openLinkAndGetHandlers = (onLinked?: jest.Mock): PlaidHandlers => {
  const { result } = renderHook(() => usePlaidLink({ onLinked }))
  act(() => result.current.openPlaidLink("link-token-1"))
  expect(create).toHaveBeenCalledWith({ token: "link-token-1" })
  expect(open).toHaveBeenCalledTimes(1)
  return (open as jest.Mock).mock.calls[0][0]
}

describe("usePlaidLink", () => {
  const alertSpy = jest.spyOn(Alert, "alert")

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("exchanges the public token server-side, refetches, and confirms", async () => {
    const onLinked = jest.fn().mockResolvedValue(undefined)
    mockExchange.mockResolvedValue({
      data: { bridgeExchangePlaidPublicToken: { errors: [], message: "ok" } },
    })

    const handlers = openLinkAndGetHandlers(onLinked)
    await act(() => handlers.onSuccess({ publicToken: "public-token-1" }))

    expect(mockExchange).toHaveBeenCalledWith({
      variables: {
        input: { linkToken: "link-token-1", publicToken: "public-token-1" },
      },
    })
    expect(onLinked).toHaveBeenCalledTimes(1)
    expect(alertSpy).toHaveBeenCalledWith(
      "Bank connected",
      "Your bank is being linked and will appear here shortly.",
    )
    // Indicator on for the exchange, off before the alert
    expect(mockToggleActivityIndicator).toHaveBeenNthCalledWith(1, true)
    expect(mockToggleActivityIndicator).toHaveBeenNthCalledWith(2, false)
  })

  it("surfaces exchange payload errors and does not refetch", async () => {
    const onLinked = jest.fn()
    mockExchange.mockResolvedValue({
      data: {
        bridgeExchangePlaidPublicToken: {
          errors: [{ code: "BRIDGE_INVALID_PLAID_TOKEN", message: "Invalid token" }],
        },
      },
    })

    const handlers = openLinkAndGetHandlers(onLinked)
    await act(() => handlers.onSuccess({ publicToken: "public-token-1" }))

    expect(alertSpy).toHaveBeenCalledWith("Error", "Invalid token")
    expect(onLinked).not.toHaveBeenCalled()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)
  })

  it("alerts generically and clears the indicator when the exchange throws", async () => {
    const onLinked = jest.fn()
    mockExchange.mockRejectedValue(new Error("network down"))

    const handlers = openLinkAndGetHandlers(onLinked)
    await act(() => handlers.onSuccess({ publicToken: "public-token-1" }))

    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "Failed to link your bank. Please try again.",
    )
    expect(onLinked).not.toHaveBeenCalled()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)
  })

  it("alerts on a real Plaid exit error, using its message when present", () => {
    const handlers = openLinkAndGetHandlers()

    act(() => handlers.onExit({ error: { errorMessage: "INSTITUTION_DOWN" } }))
    expect(alertSpy).toHaveBeenCalledWith("Error", "INSTITUTION_DOWN")

    alertSpy.mockClear()
    act(() => handlers.onExit({ error: { errorMessage: "" } }))
    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "Bank linking failed. Please try again.",
    )
  })

  it("stays silent on a plain user cancel (exit without error)", () => {
    const handlers = openLinkAndGetHandlers()

    act(() => handlers.onExit({}))
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
