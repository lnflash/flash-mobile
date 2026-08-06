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
 *  - onExit acts only on a REAL Plaid failure, detected by error CONTENT: the
 *    iOS bridge always embeds an all-empty error object on a plain user cancel
 *    (Android omits it) — both cancel shapes must stay silent.
 *  - A real Plaid failure happens INSIDE the webview (rate limit, IP block,
 *    institution error) and never reaches the backend, so onExit logs the
 *    errorCode (the only place it is observable) and, when the caller provides
 *    onManualEntry, auto-routes to the manual bank-details form (with a toast)
 *    instead of dead-ending the user. Without onManualEntry it falls back to a
 *    plain error alert.
 */

import { Alert } from "react-native"
import { renderHook, act } from "@testing-library/react-hooks"
// Auto-mocked by __mocks__/react-native-plaid-link-sdk.js (native module)
import { create, open } from "react-native-plaid-link-sdk"

const mockExchange = jest.fn()
const mockAddExternalAccount = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useBridgeExchangePlaidPublicTokenMutation: () => [mockExchange],
  useBridgeAddExternalAccountMutation: () => [mockAddExternalAccount],
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
        linkTokenFailed: () => "Failed to get external account link. Please try again.",
        unavailableBody: () =>
          "Bank linking is unavailable right now — enter your bank details manually instead.",
      },
    },
  }),
}))

jest.mock("@app/utils/analytics", () => ({ logPlaidLinkFailure: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))

import { usePlaidLink } from "@app/hooks/use-plaid-link"
import { logPlaidLinkFailure } from "@app/utils/analytics"
import { toastShow } from "@app/utils/toast"

const mockLogPlaidLinkFailure = logPlaidLinkFailure as jest.Mock
const mockToastShow = toastShow as jest.Mock

type PlaidHandlers = {
  onSuccess: (success: { publicToken: string }) => Promise<void>
  onExit: (exit: {
    error?: { errorCode?: string; errorMessage?: string; displayMessage?: string }
  }) => void
}

const renderPlaidLink = (onLinked?: jest.Mock, onManualEntry?: jest.Mock) =>
  renderHook(() => usePlaidLink({ onLinked, onManualEntry }))

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

  it("logs the errorCode even on the alert path (no onManualEntry)", () => {
    const { result } = renderPlaidLink()
    act(() => result.current.openPlaidLink("link-token-1"))

    act(() =>
      lastHandlers().onExit({
        error: { errorCode: "INSTITUTION_ERROR", displayMessage: "Bank down." },
      }),
    )

    // The in-webview failure is only observable here — record it regardless of
    // whether a manual-entry fallback exists.
    expect(mockLogPlaidLinkFailure).toHaveBeenCalledWith({
      errorCode: "INSTITUTION_ERROR",
    })
    expect(alertSpy).toHaveBeenCalledWith("Error", "Bank down.")
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  it("auto-navigates to manual entry (with toast) and logs on a real Plaid failure", () => {
    const onManualEntry = jest.fn()
    const { result } = renderPlaidLink(undefined, onManualEntry)
    act(() => result.current.openPlaidLink("link-token-1"))

    act(() =>
      lastHandlers().onExit({
        error: {
          errorCode: "RATE_LIMIT_EXCEEDED",
          displayMessage: "rate limit exceeded",
        },
      }),
    )

    expect(mockLogPlaidLinkFailure).toHaveBeenCalledWith({
      errorCode: "RATE_LIMIT_EXCEEDED",
    })
    // Auto-routes straight to the manual form — no blocking prompt/alert.
    expect(onManualEntry).toHaveBeenCalledTimes(1)
    expect(alertSpy).not.toHaveBeenCalled()
    // A non-blocking toast explains why the form opened.
    expect(mockToastShow).toHaveBeenCalledWith({
      type: "warning",
      message:
        "Bank linking is unavailable right now — enter your bank details manually instead.",
    })

    // The guard still releases on this termination path — a retry can re-open.
    act(() => result.current.openPlaidLink("link-token-2"))
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("records UNKNOWN when a real Plaid error carries no errorCode", () => {
    const onManualEntry = jest.fn()
    const { result } = renderPlaidLink(undefined, onManualEntry)
    act(() => result.current.openPlaidLink("link-token-1"))

    act(() =>
      lastHandlers().onExit({
        error: { errorCode: "", displayMessage: "Something went wrong" },
      }),
    )

    expect(mockLogPlaidLinkFailure).toHaveBeenCalledWith({ errorCode: "UNKNOWN" })
    expect(onManualEntry).toHaveBeenCalledTimes(1)
  })

  it("linkBankAccount requests a token and opens Plaid with it", async () => {
    mockAddExternalAccount.mockResolvedValue({
      data: {
        bridgeAddExternalAccount: {
          errors: [],
          externalAccount: { linkToken: "server-token", expiresAt: "later" },
        },
      },
    })

    const { result } = renderPlaidLink()
    await act(() => result.current.linkBankAccount())

    expect(mockAddExternalAccount).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({ token: "server-token" })
    expect(open).toHaveBeenCalledTimes(1)
    // Indicator paired around the token request
    expect(mockToggleActivityIndicator).toHaveBeenNthCalledWith(1, true)
    expect(mockToggleActivityIndicator).toHaveBeenNthCalledWith(2, false)
  })

  it("linkBankAccount falls back to manual entry on BRIDGE_PLAID_NOT_AVAILABLE and re-arms", async () => {
    const onManualEntry = jest.fn()
    mockAddExternalAccount.mockResolvedValue({
      data: {
        bridgeAddExternalAccount: {
          errors: [{ code: "BRIDGE_PLAID_NOT_AVAILABLE", message: "no plaid" }],
        },
      },
    })

    const { result } = renderPlaidLink(undefined, onManualEntry)
    await act(() => result.current.linkBankAccount())

    expect(onManualEntry).toHaveBeenCalledTimes(1)
    expect(alertSpy).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()

    // Guard released — a retry reaches the mutation again
    await act(() => result.current.linkBankAccount())
    expect(mockAddExternalAccount).toHaveBeenCalledTimes(2)
  })

  it("linkBankAccount alerts other payload errors and re-arms", async () => {
    mockAddExternalAccount.mockResolvedValue({
      data: { bridgeAddExternalAccount: { errors: [{ code: "X", message: "boom" }] } },
    })

    const { result } = renderPlaidLink()
    await act(() => result.current.linkBankAccount())
    expect(alertSpy).toHaveBeenCalledWith("Error", "boom")

    await act(() => result.current.linkBankAccount())
    expect(mockAddExternalAccount).toHaveBeenCalledTimes(2)
  })

  it("linkBankAccount alerts when no linkToken is returned and re-arms", async () => {
    mockAddExternalAccount.mockResolvedValue({
      data: { bridgeAddExternalAccount: { errors: [], externalAccount: null } },
    })

    const { result } = renderPlaidLink()
    await act(() => result.current.linkBankAccount())
    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "Failed to get external account link. Please try again.",
    )

    await act(() => result.current.linkBankAccount())
    expect(mockAddExternalAccount).toHaveBeenCalledTimes(2)
  })

  it("linkBankAccount alerts, clears the indicator, and re-arms when the mutation throws", async () => {
    mockAddExternalAccount.mockRejectedValueOnce(new Error("network"))

    const { result } = renderPlaidLink()
    await act(() => result.current.linkBankAccount())
    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "Failed to get external account link. Please try again.",
    )
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)

    mockAddExternalAccount.mockResolvedValueOnce({
      data: {
        bridgeAddExternalAccount: {
          errors: [],
          externalAccount: { linkToken: "t2" },
        },
      },
    })
    await act(() => result.current.linkBankAccount())
    expect(create).toHaveBeenCalledWith({ token: "t2" })
  })

  it("linkBankAccount holds one guard across token request + session (double-tap mints one token)", async () => {
    let resolveAdd!: (v: unknown) => void
    mockAddExternalAccount.mockReturnValue(
      new Promise((resolve) => {
        resolveAdd = resolve
      }),
    )

    const { result } = renderPlaidLink()
    let first!: Promise<void>
    act(() => {
      first = result.current.linkBankAccount()
    })
    // Second tap while the token request is in flight — must not mint a token
    act(() => {
      result.current.linkBankAccount()
    })
    expect(mockAddExternalAccount).toHaveBeenCalledTimes(1)

    resolveAdd({
      data: {
        bridgeAddExternalAccount: {
          errors: [],
          externalAccount: { linkToken: "t1" },
        },
      },
    })
    await act(() => first)
    expect(create).toHaveBeenCalledTimes(1)

    // Session open → still guarded
    act(() => {
      result.current.linkBankAccount()
    })
    expect(mockAddExternalAccount).toHaveBeenCalledTimes(1)

    // Session exits → re-armed
    act(() => lastHandlers().onExit({}))
    mockAddExternalAccount.mockResolvedValue({
      data: {
        bridgeAddExternalAccount: {
          errors: [],
          externalAccount: { linkToken: "t2" },
        },
      },
    })
    await act(() => result.current.linkBankAccount())
    expect(mockAddExternalAccount).toHaveBeenCalledTimes(2)
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
    // A cancel is not a failure — nothing is logged and no fallback fires.
    expect(mockLogPlaidLinkFailure).not.toHaveBeenCalled()
    expect(mockToastShow).not.toHaveBeenCalled()
  })
})
