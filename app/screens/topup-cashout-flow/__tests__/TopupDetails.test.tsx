import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import TopupDetails from "../TopupDetails"

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
