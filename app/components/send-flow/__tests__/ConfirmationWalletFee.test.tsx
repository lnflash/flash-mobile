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

// The instance's own lightning node ids consumed by the fee-from-amount
// disclosure. Mutable so individual cases can pin a node and exercise the
// Flash-to-Flash suppression; reset in beforeEach.
let mockLnNodePubkeys: string[] = []
jest.mock("@app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: { galoyInstance: { lnNodePubkeys: mockLnNodePubkeys } },
  }),
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
  mockLnNodePubkeys = []
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

  it("does not clear an error it never set when the quote succeeds", async () => {
    // Confirm is enabled while the fee is still loading, so the screen can
    // set a send-failure paymentError while the mount-time quote is in
    // flight. The quote resolving successfully must not wipe that message —
    // hasAttemptedSend never resets on the BTC branch, so the user would be
    // stuck at a disabled Confirm with no visible reason.
    mockFetchBreezFee.mockResolvedValueOnce({ fee: 1230, err: null })

    const { setFee, setPaymentError } = renderFee()

    await waitFor(() =>
      expect(setFee).toHaveBeenLastCalledWith(expect.objectContaining({ status: "set" })),
    )
    expect(setPaymentError).not.toHaveBeenCalled()
  })

  it("clears a fee error only once — later successes leave other errors alone", async () => {
    mockFetchBreezFee
      .mockResolvedValueOnce({ fee: null, err: { kind: "sdk", message: "boom" } })
      .mockResolvedValueOnce({ fee: 1230, err: null })
      .mockResolvedValueOnce({ fee: 999, err: null })

    const { setFee, setPaymentError, rerenderWith } = renderFee()

    await waitFor(() => expect(setPaymentError).toHaveBeenCalled())
    rerenderWith({ selectedFeeType: "fast" })
    await waitFor(() => expect(setPaymentError).toHaveBeenLastCalledWith(""))
    const clearCalls = setPaymentError.mock.calls.length

    // The fee error was already cleared; a further successful quote must not
    // issue another clear (which could wipe a send failure set in between).
    rerenderWith({ selectedFeeType: "slow" })
    await waitFor(() =>
      expect(setFee).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "set",
          amount: expect.objectContaining({ amount: 999 }),
        }),
      ),
    )
    expect(setPaymentError.mock.calls).toHaveLength(clearCalls)
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
      expect(setFee).toHaveBeenLastCalledWith(expect.objectContaining({ status: "set" })),
    )
    const feeCalls = setFee.mock.calls.length
    const errorCalls = setPaymentError.mock.calls.length

    // The first (superseded) fetch fails late — it must not touch state.
    resolveFirst({ fee: null, err: { kind: "sdk", message: "stale failure" } })
    await waitFor(() => expect(mockFetchBreezFee).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(setFee.mock.calls).toHaveLength(feeCalls)
    expect(setPaymentError.mock.calls).toHaveLength(errorCalls)
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

  // Render-level coverage for the fee-from-amount disclosure (#694). The
  // predicate is unit-tested in __tests__/components/fee-from-amount.spec.ts;
  // these cases pin the component wiring — e.g. passing `fee.amount` (the
  // object) instead of `fee.amount?.amount` would make `feeAmount === 0`
  // always false, silently killing the feature while the predicate's own
  // tests stay green.
  const usdLightningDetail = {
    ...basePaymentDetail,
    sendingWalletDescriptor: { currency: "USD" },
    paymentType: "lightning",
  }
  const probedZeroFee = {
    status: "set",
    amount: { amount: 0, currency: "USD", currencyCode: "USD" },
  } as const

  it("renders the fee-from-amount disclosure under a probed-zero fee", () => {
    const { getByTestId } = renderFee({
      paymentDetail: usdLightningDetail,
      fee: probedZeroFee,
    })
    expect(getByTestId("Fee From Amount Disclosure")).toBeTruthy()
  })

  it("keeps the disclosure absent when the probe priced a real fee", () => {
    const { queryByTestId } = renderFee({
      paymentDetail: usdLightningDetail,
      fee: {
        status: "set",
        amount: { amount: 5, currency: "USD", currencyCode: "USD" },
      } as const,
    })
    expect(queryByTestId("Fee From Amount Disclosure")).toBeNull()
  })

  it("suppresses the disclosure when the held invoice pays the instance's own node", () => {
    // A real bolt11 minted by the Test instance (2026-08-24, long expired —
    // expiry is irrelevant to decoding); its payee is the pinned Test node.
    // Exercises the full wiring: paymentRequest → payeeNodePubkey →
    // lnNodePubkeys from useAppConfig → predicate suppression.
    const flashTestInvoice =
      "lnbc14060n1p4gclcjpp555k59jc4xn0x3mej3gzmuj7lg66u0rtkq73vtvwqtrmd8luemprqdpvvejk2ttswfhkyefqwejhy6txd93kzarfdahzqgek8y6qcqzzsxqzpusp5rprrqnqhclwmc7au9vqf306mg6wndelar076yu6f8nr7md6kzv9q9qxpqysgqnpc09nfh90rew3z7d06pu3056nu24e809j5sj6qn0ytquu252h0sp2dkd6gc3qudwduecfvxw7m6vlt6mc0s3seqv0nvet4u9xpq6wsqfhuttw"
    mockLnNodePubkeys = [
      "02004d8933df4f002fa95d8c37ca43eb9c175d310aad55cc6d442e4accc3740029",
    ]
    const { queryByTestId } = renderFee({
      paymentDetail: { ...usdLightningDetail, paymentRequest: flashTestInvoice },
      fee: probedZeroFee,
    })
    expect(queryByTestId("Fee From Amount Disclosure")).toBeNull()
  })
})
