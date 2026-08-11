import React from "react"
import { Alert } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import TopupDetails from "../TopupDetails"
import { estimateTopupNet } from "../topup-fee-estimate"

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
// globals query; mock the generated hook the way CardPayment's tests mock
// useHomeAuthedQuery. Default: fee params present, $10 minimum.
const mockUseTransferFlagsQuery = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useTransferFlagsQuery: (...args: unknown[]) => mockUseTransferFlagsQuery(...args),
}))

const FEE_PARAMS = {
  __typename: "FygaroTopupInfo" as const,
  minimumAmount: 10,
  processorFeePercent: 2.99,
  processorFeeFixed: 0.49,
  flashFeePercent: 2,
  flashFeeFixed: 0,
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
} = {}) => {
  const navigation = { navigate } as never
  const route = {
    key: "TopupDetails",
    name: "TopupDetails",
    params: { paymentType },
  } as never
  const utils = render(
    <ThemeProvider theme={theme}>
      <TopupDetails navigation={navigation} route={route} />
    </ThemeProvider>,
  )
  return { ...utils, navigate }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPersistentState.isAdvanceMode = true
  mockUseTransferFlagsQuery.mockReturnValue(flagsResult(FEE_PARAMS))
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

describe("TopupDetails net preview", () => {
  it("shows 'you'll receive' net after fees as the user types (10 → $9.01)", () => {
    const { getByPlaceholderText, queryByText } = renderTopupDetails({
      paymentType: "card",
    })

    fireEvent.changeText(getByPlaceholderText(en.TopupDetails.amountPlaceholder()), "10")

    expect(queryByText(en.TopupDetails.youllReceive({ amount: "$9.01" }))).not.toBeNull()
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
