/**
 * usePlaidLink — Plaid Link + server-side public_token exchange (ENG-524).
 *
 * Contract under test:
 *  - openPlaidLink creates the Plaid session with the backend's linkToken and
 *    opens the native UI; a second call while a session is in flight is a
 *    no-op (the SDK's native module is a singleton — see the hook comment).
 *  - onSuccess exchanges { linkToken, publicToken } server-side; once the
 *    exchange succeeds the link IS established: the onLinked refetch is
 *    best-effort and its failure must never be reported as a link failure.
 *  - Exchange payload errors and thrown errors alert and never run onLinked;
 *    the activity indicator is always cleared.
 *  - onExit alerts only for a REAL Plaid failure, detected by error CONTENT:
 *    the iOS bridge always embeds an all-empty error object on a plain user
 *    cancel (Android omits it) — both cancel shapes must stay silent.
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
  onExit: (exit: {
    error?: { errorCode?: string; errorMessage?: string; displayMessage?: string }
  }) => void
}

const renderPlaidLink = (onLinked?: jest.Mock) =>
  renderHook(() => usePlaidLink({ onLinked }))

const lastHandlers = (): PlaidHandlers =>
  (open as jest.Mock).mock.calls[(open as jest.Mock).mock.calls.length - 1][0]

const openLinkAndGetHandlers = (onLinked?: jest.Mock): PlaidHandlers => {
  const { result } = renderPlaidLink(onLinked)
  act(() => result.current.openPlaidLink("link-token-1"))
  expect(create).toHaveBeenCalledWith({ token: "link-token-1" })
  expect(open).toHaveBeenCalledTimes(1)
  // create() BEFORE open() is the SDK's one hard native precondition:
  // Android throws LinkException("Create must be called before open."),
  // iOS short-circuits open() into an error exit ("Create was not called.").
  expect((create as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (open as jest.Mock).mock.invocationCallOrder[0],
  )
  return lastHandlers()
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

  it("waits for the refetch to SETTLE before announcing success", async () => {
    // Pins settle order, not call order: a fire-and-forget refetch
    // (`onLinked?.()?.catch(...)`) calls onLinked at the same point but
    // alerts while the refetch is still in flight — the user would dismiss
    // "Bank connected" onto a stale account list.
    let resolveRefetch!: () => void
    const onLinked = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefetch = resolve
        }),
    )
    mockExchange.mockResolvedValue({
      data: { bridgeExchangePlaidPublicToken: { errors: [] } },
    })

    const { result } = renderPlaidLink(onLinked)
    act(() => result.current.openPlaidLink("link-token-1"))

    let pending!: Promise<void>
    act(() => {
      pending = lastHandlers().onSuccess({ publicToken: "public-token-1" })
    })
    // Flush past the exchange await and into the refetch
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve()
      }
    })
    expect(onLinked).toHaveBeenCalledTimes(1)
    // Refetch still pending → no success alert yet
    expect(alertSpy).not.toHaveBeenCalled()

    resolveRefetch()
    await act(() => pending)
    expect(alertSpy).toHaveBeenCalledWith(
      "Bank connected",
      "Your bank is being linked and will appear here shortly.",
    )
  })

  it("still reports success when the best-effort refetch rejects", async () => {
    // The exchange succeeded — the webhook will provision the account. A
    // refetch failure reported as a link failure makes users re-link and
    // create duplicate external accounts.
    const onLinked = jest.fn().mockRejectedValue(new Error("network blip"))
    mockExchange.mockResolvedValue({
      data: { bridgeExchangePlaidPublicToken: { errors: [] } },
    })

    const handlers = openLinkAndGetHandlers(onLinked)
    await act(() => handlers.onSuccess({ publicToken: "public-token-1" }))

    expect(alertSpy).toHaveBeenCalledWith(
      "Bank connected",
      "Your bank is being linked and will appear here shortly.",
    )
    expect(alertSpy).not.toHaveBeenCalledWith(
      "Error",
      "Failed to link your bank. Please try again.",
    )
  })

  it("surfaces exchange payload errors, does not refetch, and re-arms for retry", async () => {
    const onLinked = jest.fn()
    mockExchange.mockResolvedValue({
      data: {
        bridgeExchangePlaidPublicToken: {
          errors: [{ code: "BRIDGE_INVALID_PLAID_TOKEN", message: "Invalid token" }],
        },
      },
    })

    const { result } = renderPlaidLink(onLinked)
    act(() => result.current.openPlaidLink("link-token-1"))
    await act(() => lastHandlers().onSuccess({ publicToken: "public-token-1" }))

    expect(alertSpy).toHaveBeenCalledWith("Error", "Invalid token")
    expect(onLinked).not.toHaveBeenCalled()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)

    // The guard must release on the payload-error early-return path, or the
    // user's retry after "Invalid token" silently no-ops until remount.
    act(() => result.current.openPlaidLink("link-token-2"))
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("alerts generically, clears the indicator, and re-arms when the exchange throws", async () => {
    const onLinked = jest.fn()
    mockExchange.mockRejectedValue(new Error("network down"))

    const { result } = renderPlaidLink(onLinked)
    act(() => result.current.openPlaidLink("link-token-1"))
    await act(() => lastHandlers().onSuccess({ publicToken: "public-token-1" }))

    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "Failed to link your bank. Please try again.",
    )
    expect(onLinked).not.toHaveBeenCalled()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)

    // "Please try again" must actually work: the guard releases on the
    // thrown-exchange path too.
    act(() => result.current.openPlaidLink("link-token-2"))
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("ignores a second openPlaidLink while a session is in flight, and re-arms after exit", () => {
    const { result } = renderPlaidLink()
    act(() => result.current.openPlaidLink("link-token-1"))
    act(() => result.current.openPlaidLink("link-token-2"))

    // Second call is a no-op — one native session only
    expect(create).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(1)

    // Session terminated (user cancel) → a new session may open
    act(() => lastHandlers().onExit({}))
    act(() => result.current.openPlaidLink("link-token-2"))
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenLastCalledWith({ token: "link-token-2" })
    // create-before-open holds on the retry session too
    expect((create as jest.Mock).mock.invocationCallOrder[1]).toBeLessThan(
      (open as jest.Mock).mock.invocationCallOrder[1],
    )
  })

  it("re-arms after a completed session (onSuccess settled)", async () => {
    mockExchange.mockResolvedValue({
      data: { bridgeExchangePlaidPublicToken: { errors: [] } },
    })
    const { result } = renderPlaidLink()

    act(() => result.current.openPlaidLink("link-token-1"))
    await act(() => lastHandlers().onSuccess({ publicToken: "public-token-1" }))

    act(() => result.current.openPlaidLink("link-token-2"))
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("alerts on a real Plaid exit error, preferring Plaid's user-facing message", () => {
    const { result } = renderPlaidLink()
    act(() => result.current.openPlaidLink("link-token-1"))

    act(() =>
      lastHandlers().onExit({
        error: {
          errorCode: "INSTITUTION_ERROR",
          errorMessage: "developer detail",
          displayMessage: "Your bank is temporarily unavailable.",
        },
      }),
    )
    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "Your bank is temporarily unavailable.",
    )

    // Real-error exits are exactly where users retry (the bank was down) —
    // the guard must release on this termination path too.
    act(() => result.current.openPlaidLink("link-token-2"))
    expect(create).toHaveBeenCalledTimes(2)

    // Middle rung: no display copy (empty string, the iOS bridge shape) —
    // Plaid's developer message is still more actionable than the generic
    // fallback and must not be skipped over.
    alertSpy.mockClear()
    act(() =>
      lastHandlers().onExit({
        error: {
          errorCode: "ITEM_LOGIN_REQUIRED",
          errorMessage: "developer detail",
          displayMessage: "",
        },
      }),
    )
    expect(alertSpy).toHaveBeenCalledWith("Error", "developer detail")
    act(() => result.current.openPlaidLink("link-token-3"))

    alertSpy.mockClear()
    act(() => lastHandlers().onExit({ error: { errorCode: "-1" } }))
    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "Bank linking failed. Please try again.",
    )
  })

  it("stays silent on user cancel — both platform shapes", () => {
    const handlers = openLinkAndGetHandlers()

    // Android: no error key at all
    act(() => handlers.onExit({}))
    // iOS: always-present error object with all-empty fields
    act(() =>
      handlers.onExit({
        error: { errorCode: "", errorMessage: "", displayMessage: "" },
      }),
    )
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
