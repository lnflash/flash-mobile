import React from "react"
import { Alert } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import TopupDetails from "../TopupDetails"
import { estimateTopupNet } from "../topup-fee-estimate"
import { AccountLevel, LevelContextProvider } from "@app/graphql/level-context"

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

// The screen reads the Fygaro fee params + minimum from the transferFlags
// globals query, and the per-level daily caps from the separate
// cardTopupLimits query (isolated so an old backend failing it cannot take
// transferFlags — and the home screen's Transfer button — down with it).
const mockUseTransferFlagsQuery = jest.fn()
const mockUseCardTopupLimitsQuery = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useTransferFlagsQuery: (...args: unknown[]) => mockUseTransferFlagsQuery(...args),
  useCardTopupLimitsQuery: (...args: unknown[]) => mockUseCardTopupLimitsQuery(...args),
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
  // Default NonAuth mirrors the bare context default: without a level the
  // screen applies no client-side daily cap (the webhook still gates).
  level = AccountLevel.NonAuth as AccountLevel,
} = {}) => {
  const navigation = { navigate } as never
  const route = {
    key: "TopupDetails",
    name: "TopupDetails",
    params: { paymentType },
  } as never
  const utils = render(
    <ThemeProvider theme={theme}>
      <LevelContextProvider
        value={{
          isAtLeastLevelZero: level !== AccountLevel.NonAuth,
          isAtLeastLevelOne:
            level !== AccountLevel.NonAuth && level !== AccountLevel.Zero,
          currentLevel: level,
        }}
      >
        <TopupDetails navigation={navigation} route={route} />
      </LevelContextProvider>
    </ThemeProvider>,
  )
  return { ...utils, navigate }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPersistentState.isAdvanceMode = true
  mockUseTransferFlagsQuery.mockReturnValue(flagsResult(FEE_PARAMS))
  mockUseCardTopupLimitsQuery.mockReturnValue(limitsResult(DAILY_LIMITS))
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
      "Invalid Amount",
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
      "Invalid Amount",
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
      "Invalid Amount",
      en.TopupDetails.dailyLimitAmount({ amount: "$125.00" }),
    )
    alertSpy.mockRestore()
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
      "Upgrade Required",
      en.TopupDetails.upgradeRequired(),
    )
    alertSpy.mockRestore()
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
