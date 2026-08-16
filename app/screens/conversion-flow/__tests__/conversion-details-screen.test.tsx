import React from "react"
import { act, render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import { ConversionDetailsScreen } from "../conversion-details-screen"

// Without this, i18nObject("en") resolves every key to "" and text queries
// match arbitrary empty text nodes.
loadAllLocales()

const LL = i18nObject("en")

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const mockPrepareBtcToUsd = jest.fn()
const mockPrepareUsdToBtc = jest.fn()
const mockToggleActivityIndicator = jest.fn()

jest.mock("@app/hooks", () => ({
  useSwap: () => ({
    prepareBtcToUsd: (...args: unknown[]) => mockPrepareBtcToUsd(...args),
    prepareUsdToBtc: (...args: unknown[]) => mockPrepareUsdToBtc(...args),
  }),
  useActivityIndicator: () => ({
    toggleActivityIndicator: (...args: unknown[]) => mockToggleActivityIndicator(...args),
  }),
  useBreez: () => ({ btcWallet: { id: "btc-wallet-id", balance: 8453 } }),
  usePriceConversion: () => ({
    convertMoneyAmount: (amount: { amount: number }) => amount,
  }),
  useDisplayCurrency: () => ({
    formatDisplayAndWalletAmount: () => "J$0.00",
    zeroDisplayAmount: { amount: 0, currency: "DisplayCurrency", currencyCode: "JMD" },
  }),
}))

jest.mock("@app/graphql/generated", () => ({
  WalletCurrency: { Btc: "BTC", Usd: "USD", Usdt: "USDT" },
  useRealtimePriceQuery: () => ({ data: undefined }),
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

// Stubs that expose exactly what these tests drive: a way to set a valid
// amount, and the amount-validation error the Next button is allowed to gate on.
jest.mock("@app/components/swap-flow", () => {
  const react = jest.requireActual("react")
  const { Text, TouchableOpacity } = jest.requireActual("react-native")
  return {
    SwapWallets: () => null,
    ConversionAmountError: ({ errorMsg }: { errorMsg?: string }) =>
      errorMsg ? react.createElement(Text, null, `amount-error:${errorMsg}`) : null,
    PercentageAmount: ({
      setAmountToBalancePercentage,
    }: {
      setAmountToBalancePercentage: (p: number) => void
    }) =>
      react.createElement(
        TouchableOpacity,
        { onPress: () => setAmountToBalancePercentage(100) },
        react.createElement(Text, null, "set-max"),
      ),
  }
})

// Renders the disabled state as text so the button gate is directly assertable.
jest.mock("@app/components/buttons", () => {
  const react = jest.requireActual("react")
  const { Text, TouchableOpacity } = jest.requireActual("react-native")
  return {
    PrimaryBtn: ({
      label,
      disabled,
      onPress,
    }: {
      label: string
      disabled?: boolean
      onPress: () => void
    }) =>
      react.createElement(
        TouchableOpacity,
        { onPress, disabled },
        react.createElement(Text, null, `${label}:${disabled ? "disabled" : "enabled"}`),
      ),
  }
})

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

const NEXT_ENABLED = `${LL.common.next()}:enabled`
const NEXT_DISABLED = `${LL.common.next()}:disabled`

const renderScreen = () => {
  const navigate = jest.fn()
  const navigation = { navigate } as never
  const route = { key: "d", name: "conversionDetails", params: undefined } as never

  const utils = render(
    <ThemeProvider theme={theme}>
      <ConversionDetailsScreen navigation={navigation} route={route} />
    </ThemeProvider>,
  )
  return { ...utils, navigate }
}

const setMaxAmount = (getByText: (t: string) => unknown) => {
  act(() => {
    fireEvent.press(getByText("set-max") as never)
  })
}

const pressNext = async (getByText: (t: string) => unknown) => {
  await act(async () => {
    fireEvent.press(getByText(NEXT_ENABLED) as never)
  })
}

beforeEach(() => jest.clearAllMocks())

describe("ConversionDetailsScreen", () => {
  it("navigates to confirmation when the prepare step succeeds", async () => {
    mockPrepareBtcToUsd.mockResolvedValue({
      data: {
        moneyAmount: { amount: 8453, currency: "BTC", currencyCode: "BTC" },
        sendingFee: 1,
        receivingFee: 0,
        lnInvoice: "lnbc-invoice",
      },
      err: null,
    })

    const { getByText, navigate } = renderScreen()
    setMaxAmount(getByText)
    await pressNext(getByText)

    expect(navigate).toHaveBeenCalledWith(
      "conversionConfirmation",
      expect.objectContaining({ lnInvoice: "lnbc-invoice", fromWalletCurrency: "BTC" }),
    )
  })

  it("shows a probe error without permanently greying out the Next button", async () => {
    // The probe error must not land in the state that gates the button:
    // `ConversionAmountError` only clears that state when the amount changes, so
    // a submit-time error parked there left Next dead with no way out.
    mockPrepareBtcToUsd.mockResolvedValue({
      data: null,
      err: "An error occurred. Contact support",
    })

    const { getByText, queryByText, navigate } = renderScreen()
    setMaxAmount(getByText)
    await pressNext(getByText)

    expect(getByText("An error occurred. Contact support")).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
    expect(queryByText(NEXT_DISABLED)).toBeNull()
    expect(getByText(NEXT_ENABLED)).toBeTruthy()

    // And the retry actually reaches the hook — not a dead button.
    await pressNext(getByText)
    expect(mockPrepareBtcToUsd).toHaveBeenCalledTimes(2)
  })

  it("clears the spinner and reports the failure when the prepare step rejects", async () => {
    // `receivePaymentBreez` and the Apollo fee probe both reject on a network
    // failure; without a catch the spinner stayed up forever and the rejection
    // went unhandled.
    mockPrepareBtcToUsd.mockRejectedValue(new Error("probe timed out"))

    const { getByText, navigate } = renderScreen()
    setMaxAmount(getByText)
    await pressNext(getByText)

    expect(getByText("probe timed out")).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)
    expect(getByText(NEXT_ENABLED)).toBeTruthy()
  })

  it("falls back to a translated message when the prepare step rejects with a non-Error", async () => {
    mockPrepareBtcToUsd.mockRejectedValue("not an Error")

    const { getByText } = renderScreen()
    setMaxAmount(getByText)
    await pressNext(getByText)

    expect(getByText(LL.errors.generic())).toBeTruthy()
    expect(mockToggleActivityIndicator).toHaveBeenLastCalledWith(false)
  })

  it("still lets the amount-validation error gate the Next button", () => {
    // The separation must not disable the gate that is supposed to exist: with
    // no amount entered, Next stays disabled.
    const { getByText } = renderScreen()

    expect(getByText(NEXT_DISABLED)).toBeTruthy()
  })
})
