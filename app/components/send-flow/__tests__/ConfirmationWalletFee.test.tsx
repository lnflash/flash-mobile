import React from "react"
import { render, waitFor } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import ConfirmationWalletFee from "../ConfirmationWalletFee"
import { fetchBreezFee } from "@app/utils/breez-sdk"

// Without this, i18nObject("en") resolves every key to "" and message
// assertions match arbitrary empty strings.
loadAllLocales()

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

// The galoy fee probe hook. The component must pass null for Breez BTC sends
// (the probe queries galoy with a non-galoy wallet id) and the real getFee for
// USD/USDT sends.
const mockUseFee = jest.fn()
jest.mock("@app/screens/send-bitcoin-screen/use-fee", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFee(...args),
}))

jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatDisplayAndWalletAmount: ({
      walletAmount,
    }: {
      walletAmount: { amount: number }
    }) => `J$ (${walletAmount.amount} sats)`,
  }),
}))

jest.mock("@app/hooks/use-format-sats", () => ({
  useFormatSats: () => (sats: number) => `${sats} sats`,
}))

// Override the global moduleNameMapper mock with a controllable jest.fn.
jest.mock("@app/utils/breez-sdk", () => ({
  fetchBreezFee: jest.fn(),
}))

jest.mock("@app/graphql/generated", () => ({
  WalletCurrency: { Btc: "BTC", Usd: "USD", Usdt: "USDT" },
}))

// Type-only import in the component; keep the deep payment-details module
// graph (apollo, galoy client) out of the test.
jest.mock("@app/screens/send-bitcoin-screen/payment-details", () => ({}))

const mockFetchBreezFee = fetchBreezFee as jest.Mock

/* eslint-disable @typescript-eslint/no-explicit-any */
const basePaymentDetail: any = {
  sendingWalletDescriptor: { currency: "BTC" },
  getFee: jest.fn(),
  settlementAmount: { amount: 6007, currency: "BTC", currencyCode: "BTC" },
  paymentType: "onchain",
  destination: "bc1qexampledestination",
  convertMoneyAmount: (amount: any) => amount,
}

type Overrides = Partial<React.ComponentProps<typeof ConfirmationWalletFee>>

const makeElement = (
  setFee: jest.Mock,
  setPaymentError: jest.Mock,
  overrides: Overrides = {},
) => (
  <ThemeProvider theme={theme}>
    <ConfirmationWalletFee
      paymentDetail={basePaymentDetail}
      btcWalletText="J$844.35 (8,453 sats)"
      usdWalletText="$0.00"
      selectedFeeType="medium"
      fee={{ status: "loading" }}
      setFee={setFee}
      setPaymentError={setPaymentError}
      {...overrides}
    />
  </ThemeProvider>
)

const renderFee = (overrides: Overrides = {}) => {
  const setFee = jest.fn()
  const setPaymentError = jest.fn()
  const utils = render(makeElement(setFee, setPaymentError, overrides))
  const rerenderWith = (next: Overrides) =>
    utils.rerender(makeElement(setFee, setPaymentError, next))
  return { setFee, setPaymentError, rerenderWith, ...utils }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseFee.mockReturnValue({ status: "unset" })
})

describe("ConfirmationWalletFee — Breez BTC sends", () => {
  it("clears a stale fee error once a later fetch succeeds", async () => {
    mockFetchBreezFee
      .mockResolvedValueOnce({ fee: null, err: { kind: "sdk", message: "boom" } })
      .mockResolvedValueOnce({ fee: 1230, err: null })

    const { setFee, setPaymentError, rerenderWith } = renderFee()

    await waitFor(() =>
      expect(setPaymentError).toHaveBeenLastCalledWith(
        expect.stringMatching(/could not calculate the network fee/i),
      ),
    )

    // A dep change (user picks another speed) triggers a fresh fetch.
    rerenderWith({ selectedFeeType: "fast" })

    await waitFor(() => expect(setPaymentError).toHaveBeenLastCalledWith(""))
    expect(setFee).toHaveBeenLastCalledWith({
      status: "set",
      amount: { amount: 1230, currency: "BTC", currencyCode: "BTC" },
    })
  })

  it("drops a stale in-flight result instead of overwriting a newer one", async () => {
    let resolveFirst!: (value: { fee: number | null; err: unknown }) => void
    mockFetchBreezFee
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce({ fee: 1230, err: null })

    const { setFee, setPaymentError, rerenderWith } = renderFee()
    rerenderWith({ selectedFeeType: "fast" })

    await waitFor(() =>
      expect(setFee).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "set" }),
      ),
    )
    const feeCalls = setFee.mock.calls.length
    const errorCalls = setPaymentError.mock.calls.length

    // The first (superseded) fetch fails late — it must not touch state.
    resolveFirst({ fee: null, err: { kind: "sdk", message: "stale failure" } })
    await waitFor(() => expect(mockFetchBreezFee).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(setFee.mock.calls.length).toBe(feeCalls)
    expect(setPaymentError.mock.calls.length).toBe(errorCalls)
    expect(setFee).toHaveBeenLastCalledWith(expect.objectContaining({ status: "set" }))
  })

  it("never runs the galoy fee probe for Breez BTC sends", async () => {
    mockFetchBreezFee.mockResolvedValue({ fee: 1230, err: null })
    renderFee()
    await waitFor(() => expect(mockFetchBreezFee).toHaveBeenCalled())
    expect(mockUseFee).toHaveBeenCalledWith(null)
  })
})

describe("ConfirmationWalletFee — galoy USD sends", () => {
  it("uses the galoy probe result and skips the Breez fetch", async () => {
    const probeFee = {
      status: "set",
      amount: { amount: 5, currency: "USD", currencyCode: "USD" },
    }
    mockUseFee.mockReturnValue(probeFee)

    const { setFee } = renderFee({
      paymentDetail: {
        ...basePaymentDetail,
        sendingWalletDescriptor: { currency: "USD" },
      },
    })

    await waitFor(() => expect(setFee).toHaveBeenCalledWith(probeFee))
    expect(mockFetchBreezFee).not.toHaveBeenCalled()
    expect(mockUseFee).toHaveBeenCalledWith(basePaymentDetail.getFee)
  })
})
