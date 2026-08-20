import React from "react"
import { Alert } from "react-native"
import { NetworkStatus } from "@apollo/client"
import { act, render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import TopupDetails, { formatHoldExpiry } from "../TopupDetails"
import { estimateTopupNet } from "../topup-fee-estimate"
import { AccountLevel } from "@app/graphql/level-context"

// Without this, i18nObject("en") resolves every key to "" and text queries
// match arbitrary empty text nodes.
loadAllLocales()

// Deterministic, synchronous i18n (the real TypesafeI18n loads its dictionary
// asynchronously, leaving LL-derived labels empty on first render).
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const mockPersistentState = { isAdvanceMode: true }
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({ persistentState: mockPersistentState }),
}))

// The real useFocusEffect reads a navigation object that only exists inside a
// NavigationContainer. This stand-in keeps its two behaviours that matter here:
// it runs the callback on mount (a pushed screen mounts focused) and again on
// every subsequent focus — which `returnToScreen()` drives, standing in for the
// customer coming back from CardPayment.
let focusHandler: (() => void) | undefined
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native")
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useEffect } = require("react")
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => {
      focusHandler = callback
      useEffect(() => callback(), [callback])
    },
  }
})

const returnToScreen = () =>
  act(() => {
    focusHandler?.()
  })

// The screen reads the Fygaro fee params + minimum from the transferFlags
// globals query, the per-level daily caps from the separate cardTopupLimits
// query (isolated so an old backend failing it cannot take transferFlags —
// and the home screen's Transfer button — down with it), and the account
// level from the level query, fetched cache-and-network directly by
// useCardTopupLimit (NOT via the cache-only useLevel() context, whose
// cold-start "NonAuth" reading once let level-0 users past the card gate).
const mockUseTransferFlagsQuery = jest.fn()
const mockUseCardTopupLimitsQuery = jest.fn()
const mockUseLevelQuery = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useTransferFlagsQuery: (...args: unknown[]) => mockUseTransferFlagsQuery(...args),
  useCardTopupLimitsQuery: (...args: unknown[]) => mockUseCardTopupLimitsQuery(...args),
  useLevelQuery: (...args: unknown[]) => mockUseLevelQuery(...args),
  useFygaroTopupAllowanceQuery: (...args: unknown[]) =>
    mockUseFygaroTopupAllowanceQuery(...args),
}))

// Default: the allowance cannot be established, so these tests exercise the
// FLAT per-level cap fallback they were written against. The allowance path
// has its own cases below.
const mockUseFygaroTopupAllowanceQuery: jest.Mock = jest.fn(() => ({
  data: undefined,
  loading: false,
  refetch: jest.fn(),
}))

const networkStatusFor = ({
  refetching,
  failed,
}: {
  refetching: boolean
  failed: boolean
}) => {
  if (failed) return NetworkStatus.error
  return refetching ? NetworkStatus.refetch : NetworkStatus.ready
}

const allowanceResult = ({
  limit,
  held,
  remaining,
  holdsExpireAt = null,
  // What Apollo reports while a refetch is in flight with
  // `notifyOnNetworkStatusChange: true`: the PREVIOUS data is still served, so
  // the figure on screen is the stale one and the screen must not gate on it.
  refetching = false,
  // What Apollo reports when that refetch REJECTS — which is the failure this
  // mock never used to be able to express. A rejected refetch never passes
  // through `NetworkStatus.refetch` at all: `ObservableQuery.reportError` hands
  // it to useQuery's error observer, which sets `{ data: previousResult.data,
  // error, loading: false, networkStatus: NetworkStatus.error }`. So the stale
  // figure is STILL served, nothing is loading, nothing is refetching, and
  // nothing in the result says the number is old.
  failed = false,
}: {
  limit: number
  held: number
  remaining: number
  holdsExpireAt?: number | null
  refetching?: boolean
  failed?: boolean
}) => ({
  data: {
    fygaroTopupAllowance: {
      __typename: "FygaroTopupAllowance" as const,
      limit,
      held,
      remaining,
      holdsExpireAt,
    },
  },
  loading: !failed && refetching,
  error: failed ? new Error("Network request failed") : undefined,
  networkStatus: networkStatusFor({ refetching, failed }),
  refetch: jest.fn(),
})

let mockIsAuthed = true
jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => mockIsAuthed,
}))

const FEE_PARAMS = {
  __typename: "FygaroTopupInfo" as const,
  minimumAmount: 10,
  processorFeePercent: 2.99,
  processorFeeFixed: 0.49,
  flashFeePercent: 2,
  flashFeeFixed: 0,
}

const DAILY_LIMITS = {
  __typename: "FygaroTopupInfo" as const,
  l1DailyLimit: 125,
  l2DailyLimit: 1000,
  l3DailyLimit: 2500,
}

const flagsResult = (fygaroTopup: typeof FEE_PARAMS | null) => ({
  data: {
    globals: {
      __typename: "Globals",
      topupEnabled: true,
      cashoutEnabled: true,
      bridgeEnabled: false,
      fygaroTopup,
    },
  },
  loading: false,
  refetch: jest.fn(() => Promise.resolve()),
})

const limitsResult = (fygaroTopup: typeof DAILY_LIMITS | null) => ({
  data: { globals: { __typename: "Globals", fygaroTopup } },
  loading: false,
})

// What an old backend (schema without the daily-limit fields) produces: the
// query fails validation, so there is no data at all.
const limitsUnavailableResult = () => ({
  data: undefined,
  loading: false,
  error: new Error("GRAPHQL_VALIDATION_FAILED"),
})

const levelResult = (
  level: "ZERO" | "ONE" | "TWO" | "THREE" | null,
  loading = false,
) => ({
  data:
    level === null
      ? undefined
      : {
          me: {
            __typename: "User" as const,
            id: "user-1",
            defaultAccount: {
              __typename: "ConsumerAccount" as const,
              id: "acct-1",
              level,
            },
          },
        },
  loading,
})

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

const en = i18nObject("en")

const renderTopupDetails = ({
  paymentType = "card" as "card" | "bankTransfer" | "bridge",
  navigate = jest.fn(),
  // Default NonAuth = an authed user whose level query SETTLED without a
  // level (e.g. network failure): the documented degrade path — no
  // client-side daily cap, the webhook still gates. A level still in flight
  // is a different state ("levelLoading" below) and must hold the flow.
  level = AccountLevel.NonAuth as AccountLevel,
  levelLoading = false,
} = {}) => {
  mockUseLevelQuery.mockReturnValue(
    levelLoading
      ? levelResult(null, true)
      : levelResult(level === AccountLevel.NonAuth ? null : level),
  )
  const navigation = { navigate } as never
  const route = {
    key: "TopupDetails",
    name: "TopupDetails",
    params: { paymentType },
  } as never
  // A fresh element each time: React bails out of re-rendering a subtree whose
  // element is referentially identical, so reusing one would make
  // `rerenderScreen` a no-op.
  const element = () => (
    <ThemeProvider theme={theme}>
      <TopupDetails navigation={navigation} route={route} />
    </ThemeProvider>
  )
  const utils = render(element())
  return {
    ...utils,
    navigate,
    // Stands in for Apollo delivering new data and re-rendering the screen —
    // the thing a refetch actually causes.
    rerenderScreen: () => utils.rerender(element()),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  focusHandler = undefined
  mockPersistentState.isAdvanceMode = true
  mockIsAuthed = true
  mockUseTransferFlagsQuery.mockReturnValue(flagsResult(FEE_PARAMS))
  // Reset per test: mockReturnValue survives clearAllMocks, so one case
  // supplying an allowance would silently change every case after it.
  mockUseFygaroTopupAllowanceQuery.mockReturnValue({
    data: undefined,
    loading: false,
    refetch: jest.fn(),
  })
  mockUseCardTopupLimitsQuery.mockReturnValue(limitsResult(DAILY_LIMITS))
  mockUseLevelQuery.mockReturnValue(levelResult(null))
})

describe("TopupDetails wallet options", () => {
  it("offers only the USD wallet for card payments, even in advance mode", () => {
    const { queryAllByText, getAllByText } = renderTopupDetails({
      paymentType: "card",
    })

    expect(getAllByText(en.TopupDetails.usdWallet()).length).toBeGreaterThan(0)
    expect(queryAllByText(en.TopupDetails.btcWallet())).toHaveLength(0)
    expect(getAllByText(en.TopupDetails.usdOnlyNotice()).length).toBeGreaterThan(0)
  })

  it("still offers the BTC wallet for bridge transfers in advance mode", () => {
    const { queryAllByText, getAllByText } = renderTopupDetails({
      paymentType: "bridge",
    })

    expect(getAllByText(en.TopupDetails.btcWallet()).length).toBeGreaterThan(0)
    expect(queryAllByText(en.TopupDetails.usdOnlyNotice())).toHaveLength(0)
  })
})

describe("TopupDetails card continue", () => {
  it("always navigates to CardPayment with the USD wallet", () => {
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "10")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("CardPayment", {
      amount: 10,
      wallet: "USD",
    })
  })
})

describe("TopupDetails $10 minimum", () => {
  it("rejects a $5 card top-up and states the real minimum", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "5")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      // Localized like the body it sits above — it used to be a raw English
      // literal on a translated message.
      en.TopupDetails.invalidAmountTitle(),
      en.TopupDetails.minimumAmount({ amount: "$10.00" }),
    )
    alertSpy.mockRestore()
  })

  it("falls back to a $10 minimum when fygaroTopup is null", () => {
    mockUseTransferFlagsQuery.mockReturnValue(flagsResult(null))
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "5")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      // Localized like the body it sits above — it used to be a raw English
      // literal on a translated message.
      en.TopupDetails.invalidAmountTitle(),
      en.TopupDetails.minimumAmount({ amount: "$10.00" }),
    )
    alertSpy.mockRestore()
  })
})

describe("TopupDetails against a backend without the daily-limit fields", () => {
  // Regression pin for the test-env outage: the limits live in their own
  // query precisely so an old backend failing it degrades to "no client-side
  // cap" — top-ups keep working and no limit label is shown.
  it("still allows card top-ups and shows no limit label", () => {
    mockUseCardTopupLimitsQuery.mockReturnValue(limitsUnavailableResult())
    const { getByPlaceholderText, getAllByText, queryByText, navigate } =
      renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    expect(queryByText(en.TopupDetails.dailyLimitInfo({ amount: "$125.00" }))).toBeNull()

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "130")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("CardPayment", { amount: 130, wallet: "USD" })
  })
})

describe("TopupDetails limit info labels", () => {
  it("shows the user's daily card limit under the amount field", () => {
    const { queryByText } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    expect(
      queryByText(en.TopupDetails.dailyLimitInfo({ amount: "$125.00" })),
    ).not.toBeNull()
  })

  it("shows no limit label when the level is unknown (no guessed number)", () => {
    const { queryByText } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.NonAuth,
    })

    expect(queryByText(en.TopupDetails.dailyLimitInfo({ amount: "$125.00" }))).toBeNull()
  })

  it("shows remaining, the hold, and when the hold lapses", () => {
    // "You've spent nothing and $65 is left of $125" reads as a bug on its own.
    // The hold explains the gap; the expiry answers the question the hold
    // immediately provokes — when do I get the rest back?
    const holdsExpireAt = Date.UTC(2026, 7, 18, 21, 30) / 1000
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({ limit: 12500, held: 6000, remaining: 6500, holdsExpireAt }),
    )
    const { queryByText } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    expect(
      queryByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$65.00", limit: "$125.00" }),
      ),
    ).not.toBeNull()
    expect(queryByText(en.TopupDetails.allowanceHeld({ held: "$60.00" }))).not.toBeNull()
    expect(
      queryByText(
        en.TopupDetails.allowanceResets({
          when: formatHoldExpiry(new Date(holdsExpireAt * 1000)),
        }),
      ),
    ).not.toBeNull()
  })

  it("shows no hold-expiry line when nothing is held", () => {
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({
        limit: 12500,
        held: 0,
        remaining: 12500,
        holdsExpireAt: Date.UTC(2026, 7, 18, 21, 30) / 1000,
      }),
    )
    const { queryByText } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    expect(
      queryByText(
        en.TopupDetails.allowanceResets({
          when: formatHoldExpiry(new Date(Date.UTC(2026, 7, 18, 21, 30))),
        }),
      ),
    ).toBeNull()
  })

  it("shows the ACH minimum-deposit notice in the bridge flow", () => {
    const { queryByText } = renderTopupDetails({
      paymentType: "bridge",
      level: AccountLevel.One,
    })

    expect(queryByText(en.BankTransfer.achMinimumNotice())).not.toBeNull()
  })

  it("does not show the ACH notice in the card flow", () => {
    const { queryByText } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    expect(queryByText(en.BankTransfer.achMinimumNotice())).toBeNull()
  })
})

describe("TopupDetails per-level daily limit", () => {
  it("rejects a card top-up over the L1 daily cap and states the limit", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "130")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      // Was a hard-coded English "Invalid Amount"; now localized like the rest.
      en.TopupDetails.cannotTopUp(),
      en.TopupDetails.dailyLimitAmount({ amount: "$125.00" }),
    )
    alertSpy.mockRestore()
  })

  it("holds Continue while the allowance is still in flight", async () => {
    // The allowance is network-only (always a round trip); the level resolves
    // instantly from cache. That gap used to be a window where Continue was
    // enabled and the screen quoted the FLAT cap — inviting a $125 top-up from
    // someone with $25 left, then refusing it a moment later.
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      data: undefined,
      loading: true,
      refetch: jest.fn(),
    })
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, queryAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "60")

    // Continue is in its loading state, so there is no label to press — the
    // flow is held rather than waved through on a number we do not have yet.
    expect(queryAllByText(en.TopupDetails.continue())).toHaveLength(0)
    expect(navigate).not.toHaveBeenCalled()
    // And it does not advertise the flat cap it is about to contradict.
    expect(
      queryAllByText(en.TopupDetails.dailyLimitInfo({ amount: "$125.00" }), {
        exact: false,
      }),
    ).toHaveLength(0)
    alertSpy.mockRestore()
  })

  it("stops holding Continue once the allowance has had long enough", async () => {
    // Nothing in the stack ever times this query out: it is network-only, React
    // Native sets no default network timeout on Android, and this app's HttpLink
    // passes no AbortController — so a stalled connection hangs rather than
    // rejects and `loading` stays true forever. Held on that, Continue is a
    // permanent unlabelled spinner and handleContinue early-returns: the card
    // top-up flow becomes unstartable, with no error and no escape, on a screen
    // that worked before the allowance was added. Past the deadline the
    // documented flat-cap fallback applies.
    jest.useFakeTimers()
    try {
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        data: undefined,
        loading: true,
        refetch: jest.fn(),
      })
      const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
        paymentType: "card",
        level: AccountLevel.One,
      })

      act(() => {
        jest.advanceTimersByTime(6_000)
      })

      fireEvent.changeText(
        getByPlaceholderText(en.TopupDetails.amountPlaceholder()),
        "60",
      )
      // $60 is under the flat $125 L1 cap, so the fallback gate lets it through.
      fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

      expect(navigate).toHaveBeenCalledWith("CardPayment", {
        amount: 60,
        wallet: "USD",
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it("still applies the flat cap after the allowance deadline, rather than no cap", async () => {
    // Degrading to "no limit" would be the other overcorrection: the flat cap is
    // weaker than the allowance but it is what this screen enforced before the
    // allowance existed, and it still refuses before any card is charged.
    jest.useFakeTimers()
    try {
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        data: undefined,
        loading: true,
        refetch: jest.fn(),
      })
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
      const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
        paymentType: "card",
        level: AccountLevel.One,
      })

      act(() => {
        jest.advanceTimersByTime(6_000)
      })

      fireEvent.changeText(
        getByPlaceholderText(en.TopupDetails.amountPlaceholder()),
        "200",
      )
      fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

      expect(navigate).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith(
        en.TopupDetails.cannotTopUp(),
        en.TopupDetails.dailyLimitAmount({ amount: "$125.00" }),
      )
      alertSpy.mockRestore()
    } finally {
      jest.useRealTimers()
    }
  })

  it("does not name a remaining figure the customer cannot actually spend", () => {
    // $5 left against a $10 minimum. "$5.00 of $125.00 left today" is true and
    // useless: every amount it invites is below the minimum and refused. That
    // is offer-then-refuse — the thing the pre-charge check exists to stop —
    // relocated into copy.
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({ limit: 12500, held: 12000, remaining: 500 }),
    )
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, queryAllByText, navigate } =
      renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    expect(
      queryAllByText(en.TopupDetails.allowanceExhausted({ limit: "$125.00" })).length,
    ).toBeGreaterThan(0)
    expect(
      queryAllByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$5.00", limit: "$125.00" }),
      ),
    ).toHaveLength(0)

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "20")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.cannotTopUp(),
      en.TopupDetails.allowanceExhausted({ limit: "$125.00" }),
    )
    alertSpy.mockRestore()
  })

  it("blocks against what is REMAINING, not the flat cap — the jaceth2009 case", () => {
    // 2026-08-16: $100, $80 and $60 all passed the client against a $125 cap,
    // because each is individually under it and the app had no idea $180 was
    // already spent. Two were captured by Fygaro and never credited.
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({ limit: 12500, held: 0, remaining: 2500 }),
    )
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    // $60 is comfortably under the $125 cap and would have sailed through
    // before; only $25 is actually left.
    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "60")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.cannotTopUp(),
      // Names what is LEFT. Telling them the limit is $125 invites the same
      // amount again.
      en.TopupDetails.allowanceRemaining({ remaining: "$25.00", limit: "$125.00" }),
    )
    alertSpy.mockRestore()
  })

  it("allows an amount within the remaining allowance", () => {
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({ limit: 12500, held: 0, remaining: 2500 }),
    )
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "25")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalled()
  })

  it("does NOT apply the card allowance to a bank transfer", () => {
    // The Fygaro allowance is the CARD allowance. Applying it to a wire capped
    // a $500 bank transfer at whatever was left of a $125 card limit — and the
    // limit note is card-only, so the refusal arrived out of nowhere with a
    // number the customer had never been shown.
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({ limit: 12500, held: 0, remaining: 2500 }),
    )
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "bankTransfer",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "500")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(alertSpy).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith("BankTransfer", {
      amount: 500,
      wallet: "USD",
      paymentType: "bankTransfer",
    })
    alertSpy.mockRestore()
  })

  it("does NOT apply the card allowance to a Bridge deposit", () => {
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({ limit: 12500, held: 0, remaining: 2500 }),
    )
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "bridge",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "500")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(alertSpy).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith("BankTransfer", {
      amount: 500,
      wallet: "USD",
      paymentType: "bridge",
    })
    alertSpy.mockRestore()
  })

  it("does not even ask for the card allowance off the card flow", () => {
    renderTopupDetails({ paymentType: "bankTransfer", level: AccountLevel.One })

    expect(mockUseFygaroTopupAllowanceQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    )
  })

  it("asks for the allowance in the only two ways that make the refresh work", () => {
    // Both options are load-bearing and neither is observable through this
    // mock, which hand-writes `networkStatus` into its fixture rather than
    // getting it from Apollo. Without an assertion here, deleting either line
    // from use-card-topup-allowance.ts leaves all of these tests green while
    // production breaks:
    //
    //  - `notifyOnNetworkStatusChange: true` is what makes the on-focus refetch
    //    visible. Without it `useQuery` stops re-rendering on loading-state
    //    changes, `networkStatus` never reaches `refetch`, `refreshing` is
    //    permanently false — and Continue is waved through on exactly the
    //    stale figure the refetch was added to replace.
    //  - `network-only` is what makes it a REFRESH. A cached allowance is a
    //    stale allowance, and staleness is the entire failure this query
    //    exists to end.
    renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    expect(mockUseFygaroTopupAllowanceQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: false,
        fetchPolicy: "network-only",
        notifyOnNetworkStatusChange: true,
      }),
    )
  })

  it("allows a card top-up landing exactly ON the L1 cap (inclusive)", () => {
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "125")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("CardPayment", { amount: 125, wallet: "USD" })
  })

  it("applies the cap for the user's own level ($130 clears L2)", () => {
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.Two,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "130")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("CardPayment", { amount: 130, wallet: "USD" })
  })

  it("hides the net preview for an over-cap amount (Continue would refuse it)", () => {
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "130")

    expect(queryByText(en.TopupDetails.feeNote())).toBeNull()
  })

  it("applies no client-side cap when the level is unknown (server still gates)", () => {
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.NonAuth,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "130")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("CardPayment", { amount: 130, wallet: "USD" })
  })

  it("applies no client-side cap for a leveled user when fygaroTopup is null", () => {
    // The other half of the documented degrade path: a known level (L1) but
    // missing Fygaro settings must mean "no client-side cap" (the webhook
    // still gates), not a crash and not a spurious block on missing metadata.
    // Settings-unavailable nulls fygaroTopup in BOTH queries.
    mockUseTransferFlagsQuery.mockReturnValue(flagsResult(null))
    mockUseCardTopupLimitsQuery.mockReturnValue(limitsResult(null))
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "130")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("CardPayment", { amount: 130, wallet: "USD" })
  })

  it("refuses card top-up outright for level 0 (webhook fails closed for L0)", () => {
    // Level 0 must NOT fall into the "no client-side cap" degrade bucket: the
    // webhook has no daily limit for level 0 and fails closed, so a level-0
    // charge would be captured and stranded in manual review. The home
    // screen hides the Transfer button for level 0, but this screen cannot
    // rely on that cross-file invariant (deep links, future UI changes).
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.Zero,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "50")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.upgradeRequiredTitle(),
      en.TopupDetails.upgradeRequired(),
    )
    alertSpy.mockRestore()
  })

  it("holds Continue while an authed user's level is still resolving (cold start)", () => {
    // The cold-start/deep-link window: the level query is still in flight, so
    // the screen cannot yet distinguish a level-0 user (refuse) from a
    // leveled one (allow). It must hold — Continue shows a spinner and cannot
    // be pressed — rather than degrade to "no block" and let a level-0 charge
    // be captured by Fygaro and stranded in manual review.
    const { getByPlaceholderText, queryAllByText, navigate } = renderTopupDetails({
      paymentType: "card",
      levelLoading: true,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "50")

    // PrimaryBtn's loading state replaces the label with a spinner and
    // disables the touchable — there is no Continue to press.
    expect(queryAllByText(en.TopupDetails.continue())).toHaveLength(0)
    expect(navigate).not.toHaveBeenCalled()
  })

  it("does not hold bank transfers on a still-loading level (the hold is card-only)", () => {
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "bankTransfer",
      levelLoading: true,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "50")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("BankTransfer", {
      amount: 50,
      wallet: "USD",
      paymentType: "bankTransfer",
    })
  })

  it("fetches the level cache-and-network for an authed user (not cache-only)", () => {
    // Pin of the fix itself: the level must be fetched directly with
    // cache-and-network, not read from the cache-only useLevel() context —
    // the context reports "NonAuth" for an authed level-0 user on a cold
    // start, which is exactly the gap that let a charge through.
    renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    expect(mockUseLevelQuery).toHaveBeenCalledWith(
      expect.objectContaining({ fetchPolicy: "cache-and-network", skip: false }),
    )
  })

  it("skips the level query when signed out", () => {
    mockIsAuthed = false
    renderTopupDetails({ paymentType: "card" })

    expect(mockUseLevelQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    )
  })

  it("does not block level-0 bank transfers (the refusal is card-only)", () => {
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "bankTransfer",
      level: AccountLevel.Zero,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "50")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("BankTransfer", {
      amount: 50,
      wallet: "USD",
      paymentType: "bankTransfer",
    })
  })

  it("does not cap bank transfers", () => {
    const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
      paymentType: "bankTransfer",
      level: AccountLevel.One,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "130")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("BankTransfer", {
      amount: 130,
      wallet: "USD",
      paymentType: "bankTransfer",
    })
  })
})

describe("TopupDetails allowance refresh on return", () => {
  it("re-asks for the allowance when the customer comes back, and gates on the NEW figure", () => {
    // This screen is not unmounted when it pushes CardPayment, and asking for a
    // checkout MINTS a reservation. $65 left, enter $60, tap Continue: the
    // server now holds $60, so $5 is left. Both ways back from a refusal call
    // goBack() — the refusal screen's "Change amount" and the refusal alert's
    // OK — landing the customer on a screen still rendering "$65.00 of $125.00
    // left today" and still gating Continue against $65. They are invited to
    // try again and refused again: exactly the "app invites a top-up that will
    // be refused" failure the allowance was added to end.
    const refetch = jest.fn(() => {
      // What the server says once that $60 reservation exists.
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        ...allowanceResult({ limit: 12500, held: 10000, remaining: 2500 }),
        refetch,
      })
    })
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      ...allowanceResult({ limit: 12500, held: 6000, remaining: 6500 }),
      refetch,
    })
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, queryByText, navigate, rerenderScreen } =
      renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "60")
    expect(
      queryByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$65.00", limit: "$125.00" }),
      ),
    ).not.toBeNull()
    // The mount fetch is already network-only, so the first focus has nothing
    // to refresh and must not duplicate the request already in flight.
    expect(refetch).not.toHaveBeenCalled()

    returnToScreen()
    rerenderScreen()

    expect(refetch).toHaveBeenCalledTimes(1)
    // The rendered figure moves...
    expect(
      queryByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$25.00", limit: "$125.00" }),
      ),
    ).not.toBeNull()
    expect(
      queryByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$65.00", limit: "$125.00" }),
      ),
    ).toBeNull()

    // ...and so does the gate: the same $60 is refused here, for free, instead
    // of on a payment page that would refuse it again.
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.cannotTopUp(),
      en.TopupDetails.allowanceRemaining({ remaining: "$25.00", limit: "$125.00" }),
    )
    alertSpy.mockRestore()
  })

  it("holds Continue while that refresh is still in flight, instead of gating on the stale figure", () => {
    // The other half of the loop the on-focus refetch opened. Apollo keeps
    // serving the PREVIOUS data through a refetch, and without
    // `notifyOnNetworkStatusChange` it does not even flip `loading` — so for
    // the whole round trip after the customer comes back from a refusal the
    // screen still renders "$65.00 of $125.00 left today" and still gates
    // against $65. Tapping Continue in that window — precisely what someone
    // just told to change their amount does — used to be waved through, into
    // another reservation the server refuses.
    const refetch = jest.fn(() => {
      // The refetch is now IN FLIGHT: stale $65 still served, network busy.
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        ...allowanceResult({
          limit: 12500,
          held: 6000,
          remaining: 6500,
          refetching: true,
        }),
        refetch,
      })
    })
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      ...allowanceResult({ limit: 12500, held: 6000, remaining: 6500 }),
      refetch,
    })
    const {
      getByPlaceholderText,
      getAllByText,
      queryAllByText,
      navigate,
      rerenderScreen,
    } = renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "60")
    // Before leaving, $60 against $65 is allowed.
    expect(getAllByText(en.TopupDetails.continue()).length).toBeGreaterThan(0)

    returnToScreen()
    rerenderScreen()

    // Continue is in its loading state, so there is no label to press: the
    // flow is held on a number we know is being replaced, rather than waved
    // through on one we know is too high.
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(queryAllByText(en.TopupDetails.continue())).toHaveLength(0)
    expect(navigate).not.toHaveBeenCalled()

    // And once the answer lands, the screen gates on the NEW figure.
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      ...allowanceResult({ limit: 12500, held: 10000, remaining: 2500 }),
      refetch,
    })
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    rerenderScreen()

    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.cannotTopUp(),
      en.TopupDetails.allowanceRemaining({ remaining: "$25.00", limit: "$125.00" }),
    )
    alertSpy.mockRestore()
  })

  it("does not hold Continue for ever if the refresh never answers", () => {
    // The same reason the first-load hold has a deadline: nothing in the stack
    // times this query out, so a stalled connection would otherwise leave
    // Continue a permanent unlabelled spinner on a screen the customer cannot
    // start a top-up from.
    jest.useFakeTimers()
    try {
      const refetch = jest.fn()
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        ...allowanceResult({
          limit: 12500,
          held: 6000,
          remaining: 6500,
          refetching: true,
        }),
        refetch,
      })
      const { getByPlaceholderText, getAllByText, navigate } = renderTopupDetails({
        paymentType: "card",
        level: AccountLevel.One,
      })

      act(() => {
        jest.advanceTimersByTime(6_000)
      })

      fireEvent.changeText(
        getByPlaceholderText(en.TopupDetails.amountPlaceholder()),
        "60",
      )
      fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

      expect(navigate).toHaveBeenCalledWith("CardPayment", {
        amount: 60,
        wallet: "USD",
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it("DISCARDS the superseded figure past the deadline instead of quoting it", () => {
    // The deadline releases the hold for both reasons the figure can be
    // untrustworthy, and only one of them has a safe fallback. On a first load
    // there is no number at all and the flat cap applies — documented, fine.
    // On a REFRESH there is a number, and it is the pre-reservation one: this
    // is the return from CardPayment, where asking for a checkout has just
    // minted a $60 hold. Gating and quoting on it means the screen still says
    // "$65.00 of $125.00 left today" after the server has already taken $60,
    // waves the same $60 through, mints a SECOND hold, is refused again, and
    // extends the customer's lockout — reopening the exact loop the on-focus
    // refetch was added to close.
    jest.useFakeTimers()
    try {
      const refetch = jest.fn()
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        ...allowanceResult({
          limit: 12500,
          held: 6000,
          remaining: 6500,
          refetching: true,
        }),
        refetch,
      })
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
      const {
        getByPlaceholderText,
        getAllByText,
        queryAllByText,
        queryByText,
        navigate,
      } = renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

      // Before the deadline the flow is simply HELD: Continue is a spinner with
      // no label, so nothing can be acted on either way.
      expect(queryAllByText(en.TopupDetails.continue())).toHaveLength(0)

      act(() => {
        jest.advanceTimersByTime(6_000)
      })

      // Past the deadline the screen is usable again — and it quotes the FLAT
      // cap, not the number it knows the server has already superseded.
      expect(
        queryByText(
          en.TopupDetails.allowanceRemaining({ remaining: "$65.00", limit: "$125.00" }),
        ),
      ).toBeNull()
      expect(queryByText(en.TopupDetails.allowanceHeld({ held: "$60.00" }))).toBeNull()
      expect(
        queryByText(en.TopupDetails.dailyLimitInfo({ amount: "$125.00" })),
      ).not.toBeNull()

      // And the gate is the flat cap too: $200 is refused, naming $125 rather
      // than a "$65.00 left" that has not been true since the hold was minted.
      fireEvent.changeText(
        getByPlaceholderText(en.TopupDetails.amountPlaceholder()),
        "200",
      )
      fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

      expect(navigate).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith(
        en.TopupDetails.cannotTopUp(),
        en.TopupDetails.dailyLimitAmount({ amount: "$125.00" }),
      )
      alertSpy.mockRestore()
    } finally {
      jest.useRealTimers()
    }
  })

  it("DISCARDS the figure when the refresh FAILS, instead of re-promising it", () => {
    // The failure door the deadline leaves open, and it is the refetch's MOST
    // LIKELY failure, not an exotic one. A rejected refetch never passes
    // through `NetworkStatus.refetch`, so `refreshing` is false, no deadline is
    // ever armed, and the pre-reservation figure is served back as if it were
    // fresh (see `stale` in use-card-topup-allowance).
    //
    // The loop that reopens, exactly as the on-focus refetch was written to
    // close it: L1, $125 cap, nothing held. The customer enters $60, Continue
    // mints a $60 server hold, they back out of the Fygaro page. The focus
    // refetch fires and their connection drops for that one round trip. The
    // screen re-renders "$125.00 of $125.00 left today", shows no held line,
    // gates against $125, and waves through another $65 — a SECOND hold, $125
    // held, $0 available, and the customer locked out of card top-ups until
    // both lapse.
    const refetch = jest.fn(() => {
      // The refresh died on the wire: the PRE-hold figure is still served, and
      // nothing in the result admits it.
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        ...allowanceResult({
          limit: 12500,
          held: 0,
          remaining: 12500,
          failed: true,
        }),
        refetch,
      })
    })
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      ...allowanceResult({ limit: 12500, held: 0, remaining: 12500 }),
      refetch,
    })
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, queryByText, navigate, rerenderScreen } =
      renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    // Before leaving, the settled figure is quoted — that half must not change.
    expect(
      queryByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$125.00", limit: "$125.00" }),
      ),
    ).not.toBeNull()

    returnToScreen()
    rerenderScreen()

    expect(refetch).toHaveBeenCalledTimes(1)
    // The screen stops repeating a number it knows the server has superseded,
    // and falls back to the flat cap — the same place the stalled-refresh and
    // first-load cases land.
    expect(
      queryByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$125.00", limit: "$125.00" }),
      ),
    ).toBeNull()
    expect(
      queryByText(en.TopupDetails.dailyLimitInfo({ amount: "$125.00" })),
    ).not.toBeNull()

    // And Continue stops consulting the stale figure too: $200 is refused
    // naming the flat cap, not a "$125.00 of $125.00 left today" that has not
    // been true since the hold was minted.
    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "200")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.cannotTopUp(),
      en.TopupDetails.dailyLimitAmount({ amount: "$125.00" }),
    )
    alertSpy.mockRestore()
  })

  it("hides the HELD line too when the refresh fails, rather than under-reporting it", () => {
    // The held line is the other half of the same promise. A stale figure taken
    // after one hold and before the next still says "$60.00 is held" while the
    // server is holding $120 — a sentence that reads as authoritative and is
    // simply wrong. Nothing partial survives a figure we know is superseded.
    const refetch = jest.fn(() => {
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        ...allowanceResult({
          limit: 12500,
          held: 6000,
          remaining: 6500,
          holdsExpireAt: Date.UTC(2026, 7, 18, 21, 30) / 1000,
          failed: true,
        }),
        refetch,
      })
    })
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      ...allowanceResult({
        limit: 12500,
        held: 6000,
        remaining: 6500,
        holdsExpireAt: Date.UTC(2026, 7, 18, 21, 30) / 1000,
      }),
      refetch,
    })
    const { queryByText, rerenderScreen } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.One,
    })

    returnToScreen()
    rerenderScreen()

    expect(queryByText(en.TopupDetails.allowanceHeld({ held: "$60.00" }))).toBeNull()
    expect(
      queryByText(
        en.TopupDetails.allowanceResets({
          when: formatHoldExpiry(new Date(Date.UTC(2026, 7, 18, 21, 30))),
        }),
      ),
    ).toBeNull()
    expect(
      queryByText(en.TopupDetails.dailyLimitInfo({ amount: "$125.00" })),
    ).not.toBeNull()
  })

  it("does not hold Continue after a failed refresh — there is nothing left to wait for", () => {
    // A failed refresh is SETTLED: no round trip is in flight, so holding the
    // flow on it would be a permanent unlabelled spinner. The figure is
    // discarded; the screen stays usable on the flat cap.
    const refetch = jest.fn(() => {
      mockUseFygaroTopupAllowanceQuery.mockReturnValue({
        ...allowanceResult({
          limit: 12500,
          held: 0,
          remaining: 12500,
          failed: true,
        }),
        refetch,
      })
    })
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      ...allowanceResult({ limit: 12500, held: 0, remaining: 12500 }),
      refetch,
    })
    const { getByPlaceholderText, getAllByText, navigate, rerenderScreen } =
      renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    returnToScreen()
    rerenderScreen()

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "60")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).toHaveBeenCalledWith("CardPayment", { amount: 60, wallet: "USD" })
  })

  it("keeps quoting and gating on the allowance when NO refresh is in flight", () => {
    // The other half: discarding a superseded figure must not discard a settled
    // one. With the query at rest the allowance is the best number the screen
    // has, and the flat cap would invite a $60 top-up against $25 remaining.
    mockUseFygaroTopupAllowanceQuery.mockReturnValue(
      allowanceResult({ limit: 12500, held: 0, remaining: 2500 }),
    )
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { getByPlaceholderText, getAllByText, queryByText, navigate } =
      renderTopupDetails({ paymentType: "card", level: AccountLevel.One })

    expect(
      queryByText(
        en.TopupDetails.allowanceRemaining({ remaining: "$25.00", limit: "$125.00" }),
      ),
    ).not.toBeNull()

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "60")
    fireEvent.press(getAllByText(en.TopupDetails.continue())[0])

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.cannotTopUp(),
      en.TopupDetails.allowanceRemaining({ remaining: "$25.00", limit: "$125.00" }),
    )
    alertSpy.mockRestore()
  })

  it("does not re-ask for the CARD allowance on a bank transfer", () => {
    // Same reason the query is skipped there in the first place: the Fygaro
    // allowance says nothing about a wire, and Apollo's own refetch ignores
    // `skip`.
    const refetch = jest.fn()
    mockUseFygaroTopupAllowanceQuery.mockReturnValue({
      ...allowanceResult({ limit: 12500, held: 0, remaining: 2500 }),
      refetch,
    })
    renderTopupDetails({ paymentType: "bankTransfer", level: AccountLevel.One })

    returnToScreen()

    expect(refetch).not.toHaveBeenCalled()
  })
})

describe("TopupDetails net preview", () => {
  it("shows 'you'll receive' net after fees as the user types (10 → $9.01)", () => {
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "10")

    expect(queryByText(en.TopupDetails.youllReceive({ amount: "$9.01" }))).not.toBeNull()
  })

  it("reproduces the backend's cent rounding on non-round amounts (10.25 → $9.24)", () => {
    // Guards against the float model, which would over-promise $9.25 here while
    // the backend credits $9.24.
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(
      getByPlaceholderText(en.TopupDetails.amountPlaceholder()),
      "10.25",
    )

    expect(queryByText(en.TopupDetails.youllReceive({ amount: "$9.24" }))).not.toBeNull()
    expect(queryByText(en.TopupDetails.youllReceive({ amount: "$9.25" }))).toBeNull()
  })

  it("hides the net line for amounts below the enforced minimum", () => {
    // A $5 card top-up is below the $10 floor and Continue will refuse it, so
    // the screen must not promise a concrete receive figure for it.
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "5")

    expect(queryByText(en.TopupDetails.feeNote())).toBeNull()
  })

  it("hides the net line for level 0 on the card flow (Continue would refuse it)", () => {
    // A level-0 card top-up is refused outright by handleContinue (the webhook
    // fails closed for level 0), so the screen must not first promise a
    // concrete receive figure for an amount Continue will then refuse.
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
      level: AccountLevel.Zero,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "50")

    expect(queryByText(en.TopupDetails.feeNote())).toBeNull()
  })

  it("hides the net line while the level is still resolving (card flow)", () => {
    // A still-loading level may yet resolve to 0, whose card top-up Continue
    // refuses — so the screen must not promise a receive figure meanwhile.
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
      levelLoading: true,
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "50")

    expect(queryByText(en.TopupDetails.feeNote())).toBeNull()
  })

  it("hides the net line when fygaroTopup is null (no guessed number)", () => {
    mockUseTransferFlagsQuery.mockReturnValue(flagsResult(null))
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "10")

    expect(queryByText(en.TopupDetails.feeNote())).toBeNull()
  })

  it("does not show the net line for bank transfers", () => {
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "bankTransfer",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "10")

    expect(queryByText(en.TopupDetails.feeNote())).toBeNull()
  })
})

describe("estimateTopupNet", () => {
  it("subtracts processor (%+fixed) and flash (%+fixed) fees from the gross", () => {
    // 10 - (10*2.99% + 0.49) - (10*2%) = 10 - 0.789 - 0.20 = 9.011
    const net = estimateTopupNet(10, {
      processorFeePercent: 2.99,
      processorFeeFixed: 0.49,
      flashFeePercent: 2,
      flashFeeFixed: 0,
    })
    expect(net.toFixed(2)).toBe("9.01")
  })

  it("matches the backend's per-component cent rounding on non-round amounts", () => {
    // The float model (round only the final total) yields $9.25 here; the
    // backend rounds each fee to the nearest cent first:
    //   gross      = 1025c
    //   processor  = round(1025*2.99/100)=31 + round(0.49*100)=49 = 80c
    //   flash      = round(1025*2/100)=21 + 0                     = 21c
    //   net        = 1025 - 80 - 21                               = 924c
    // so the credited amount is $9.24, not $9.25.
    const net = estimateTopupNet(10.25, {
      processorFeePercent: 2.99,
      processorFeeFixed: 0.49,
      flashFeePercent: 2,
      flashFeeFixed: 0,
    })
    expect(net.toFixed(2)).toBe("9.24")
  })

  it("never returns a negative net when fixed fees exceed the gross", () => {
    const net = estimateTopupNet(0.25, {
      processorFeePercent: 2.99,
      processorFeeFixed: 0.49,
      flashFeePercent: 2,
      flashFeeFixed: 0,
    })
    expect(net).toBe(0)
  })
})
