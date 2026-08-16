import React from "react"
import { act, render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import { ConversionConfirmationScreen } from "../conversion-confirmation-screen"
import { toastShow } from "@app/utils/toast"

// Without this, i18nObject("en") resolves every key to "" and text queries
// match arbitrary empty text nodes.
loadAllLocales()

const LL = i18nObject("en")

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const mockSwap = jest.fn()
const mockToggleActivityIndicator = jest.fn()

jest.mock("@app/hooks", () => ({
  useSwap: () => ({ swap: (...args: unknown[]) => mockSwap(...args) }),
  useActivityIndicator: () => ({
    toggleActivityIndicator: (...args: unknown[]) => mockToggleActivityIndicator(...args),
  }),
  useBreez: () => ({ btcWallet: { id: "btc-wallet-id", balance: 8453 } }),
}))

jest.mock("@app/graphql/generated", () => ({
  useConversionScreenQuery: () => ({
    data: {
      me: {
        defaultAccount: {
          wallets: [{ id: "usd-wallet-id", walletCurrency: "USD", balance: 541 }],
        },
      },
    },
  }),
}))

jest.mock("@app/graphql/wallets-utils", () => ({
  getCashWallet: (wallets: { id: string }[] | undefined) => wallets?.[0],
}))

jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))

const mockRecordError = jest.fn()
jest.mock("@react-native-firebase/crashlytics", () => ({
  getCrashlytics: () => ({
    recordError: (...args: unknown[]) => mockRecordError(...args),
  }),
}))

// ConfirmationDetails only renders amounts; it is not what these tests assert.
jest.mock("@app/components/swap-flow", () => {
  const react = jest.requireActual("react")
  return { ConfirmationDetails: () => react.createElement(react.Fragment, null) }
})

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

const mockToastShow = toastShow as jest.Mock

const renderScreen = (overrides: { lnInvoice?: string } = {}) => {
  const dispatch = jest.fn()
  const navigation = { dispatch } as never
  const route = {
    key: "c",
    name: "conversionConfirmation",
    params: {
      moneyAmount: { amount: 100, currency: "USD", currencyCode: "USD" },
      sendingFee: 1,
      receivingFee: 0,
      lnInvoice: "lnbc-invoice",
      fromWalletCurrency: "USD",
      ...overrides,
    },
  } as never

  const utils = render(
    <ThemeProvider theme={theme}>
      <ConversionConfirmationScreen navigation={navigation} route={route} />
    </ThemeProvider>,
  )
  return { ...utils, dispatch }
}

// `navigation.dispatch` is called with a reducer; run it to see the routes the
// screen actually asks for.
const dispatchedRoutes = (dispatch: jest.Mock) => {
  const reducer = dispatch.mock.calls[0][0] as (state: unknown) => {
    payload: { routes: { name: string; params?: { pending?: boolean } }[] }
  }
  return reducer({ routes: [], index: 0 }).payload.routes
}

const pressConvert = async (getByText: (text: string) => unknown) => {
  await act(async () => {
    fireEvent.press(getByText(LL.common.convert()) as never)
  })
}

beforeEach(() => jest.clearAllMocks())

describe("ConversionConfirmationScreen", () => {
  it("routes a settled conversion to the success screen with pending false", async () => {
    mockSwap.mockResolvedValue({ status: "success" })

    const { getByText, dispatch } = renderScreen()
    await pressConvert(getByText)

    const routes = dispatchedRoutes(dispatch)
    expect(routes[routes.length - 1]).toEqual({
      name: "conversionSuccess",
      params: { pending: false },
    })
  })

  it("routes an unsettled conversion to the success screen with pending true", async () => {
    // The regression: a PENDING swap navigated to the same screen as a settled
    // one, so a conversion that moved no funds read as "Conversion successful".
    mockSwap.mockResolvedValue({ status: "pending" })

    const { getByText, dispatch } = renderScreen()
    await pressConvert(getByText)

    const routes = dispatchedRoutes(dispatch)
    expect(routes[routes.length - 1]).toEqual({
      name: "conversionSuccess",
      params: { pending: true },
    })
  })

  it("reports a failed swap and does not navigate", async () => {
    mockSwap.mockRejectedValue(new Error("no route to destination"))

    const { getByText, dispatch } = renderScreen()
    await pressConvert(getByText)

    expect(dispatch).not.toHaveBeenCalled()
    expect(mockRecordError).toHaveBeenCalledTimes(1)
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: "no route to destination" }),
    )
    expect(getByText("no route to destination")).toBeTruthy()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)
  })

  it("surfaces a non-Error rejection instead of leaving the spinner up", async () => {
    mockSwap.mockRejectedValue("not an Error")

    const { getByText } = renderScreen()
    await pressConvert(getByText)

    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: LL.errors.generic() }),
    )
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)
  })

  it("still reports a non-Error rejection to Crashlytics, carrying the raw value", async () => {
    // The least diagnosable failure is the one that most needs a crash report:
    // the user only ever sees the generic copy, so without this the cause is
    // lost entirely.
    mockSwap.mockRejectedValue("not an Error")

    const { getByText } = renderScreen()
    await pressConvert(getByText)

    expect(mockRecordError).toHaveBeenCalledTimes(1)
    const [recorded] = mockRecordError.mock.calls[0]
    expect(recorded).toBeInstanceOf(Error)
    expect((recorded as Error).message).toContain("not an Error")
  })

  it("is not a silent dead tap when the prepared invoice is empty", async () => {
    // `prepareBtcToUsd` can hand this screen `lnInvoice: ""`. The button used to
    // be wrapped in `if (lnInvoice)`, so the tap did nothing at all — no
    // spinner, no toast, no crash report.
    mockSwap.mockRejectedValue(new Error(LL.errors.generic()))

    const { getByText } = renderScreen({ lnInvoice: "" })
    await pressConvert(getByText)

    expect(mockSwap).toHaveBeenCalledTimes(1)
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: LL.errors.generic() }),
    )
  })
})
