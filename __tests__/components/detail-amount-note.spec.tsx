import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import DetailAmountNote from "../../app/components/send-flow/DetailAmountNote"
import { WalletCurrency } from "../../app/graphql/generated"
import { PaymentDetail } from "../../app/screens/send-bitcoin-screen/payment-details"

type MoneyAmountLike = { amount: number; currency: string; currencyCode: string }

// Controllable per-suite: the BTC cases only need convertMoneyAmount to be
// callable, but the cash-wallet cases (ENG-556) depend on what it converts to.
const mockConvertMoneyAmount = jest.fn(
  (amount: MoneyAmountLike, _currency?: string): MoneyAmountLike => amount,
)
const mockFormatDisplayAndWalletAmount = jest.fn()

jest.mock("@app/hooks", () => ({
  useBreez: () => ({ btcWallet: { balance: 1_633_284 } }),
  // checkErrorMessage bails when convertMoneyAmount is unavailable, so the
  // mock must return a callable even though the BTC branch never invokes it.
  usePriceConversion: () => ({
    convertMoneyAmount: (...args: unknown[]) =>
      (mockConvertMoneyAmount as (...a: unknown[]) => unknown)(...args),
  }),
  useDisplayCurrency: () => ({
    formatDisplayAndWalletAmount: (...args: unknown[]) =>
      (mockFormatDisplayAndWalletAmount as (...a: unknown[]) => unknown)(...args),
  }),
  useFormatSats: () => (sats: number) => `${sats} sats`,
}))

afterEach(() => {
  mockConvertMoneyAmount.mockImplementation((amount: MoneyAmountLike) => amount)
  mockFormatDisplayAndWalletAmount.mockReset()
})

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

// The amount/note inputs pull in their own hook trees — irrelevant to the
// limit-validation behavior under test.
jest.mock("@app/components/amount-input/amount-input", () => ({
  AmountInput: () => null,
}))
jest.mock("@app/components/note-input", () => ({
  NoteInput: () => null,
}))

const makeBtcPaymentDetail = (
  overrides: Partial<PaymentDetail<WalletCurrency>> = {},
): PaymentDetail<WalletCurrency> =>
  ({
    sendingWalletDescriptor: { id: "btc-wallet-id", currency: WalletCurrency.Btc },
    paymentType: "intraledger",
    canSetAmount: true,
    canSendMax: false,
    isSendingMax: false,
    canSetMemo: false,
    memo: undefined,
    settlementAmount: {
      amount: 1_391_690,
      currency: WalletCurrency.Btc,
      currencyCode: "BTC",
    },
    unitOfAccountAmount: {
      amount: 1_391_690,
      currency: WalletCurrency.Btc,
      currencyCode: "BTC",
    },
    convertMoneyAmount: (amount: unknown) => amount,
    setAmount: jest.fn(),
    ...overrides,
  } as unknown as PaymentDetail<WalletCurrency>)

const renderComponent = (
  paymentDetail: PaymentDetail<WalletCurrency>,
  receiverLimits: { minSats: number; maxSats: number } | null,
) => {
  const setAsyncErrorMessage = jest.fn()
  render(
    <ThemeProvider theme={createTheme()}>
      <DetailAmountNote
        usdWallet={undefined}
        paymentDetail={paymentDetail}
        setPaymentDetail={jest.fn()}
        setAsyncErrorMessage={setAsyncErrorMessage}
        receiverLimits={receiverLimits}
      />
    </ThemeProvider>,
  )
  return { setAsyncErrorMessage }
}

beforeAll(() => {
  loadLocale("en")
})

describe("DetailAmountNote BTC receiver-limit validation", () => {
  it("flags an amount above the receiver's max (the 150k-sat cap regression)", async () => {
    const { setAsyncErrorMessage } = renderComponent(makeBtcPaymentDetail(), {
      minSats: 1,
      maxSats: 150_000,
    })

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenCalledWith(
        "The most this recipient can receive per payment is 150000 sats",
      ),
    )
  })

  it("flags an amount below the receiver's min", async () => {
    const paymentDetail = makeBtcPaymentDetail({
      settlementAmount: {
        amount: 5,
        currency: WalletCurrency.Btc,
        currencyCode: "BTC",
      },
    } as Partial<PaymentDetail<WalletCurrency>>)
    const { setAsyncErrorMessage } = renderComponent(paymentDetail, {
      minSats: 10,
      maxSats: 150_000,
    })

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenCalledWith(
        "The minimum this recipient can receive is 10 sats",
      ),
    )
  })

  it("clears the error when the amount is within the receiver's limits", async () => {
    const paymentDetail = makeBtcPaymentDetail({
      settlementAmount: {
        amount: 50_000,
        currency: WalletCurrency.Btc,
        currencyCode: "BTC",
      },
    } as Partial<PaymentDetail<WalletCurrency>>)
    const { setAsyncErrorMessage } = renderComponent(paymentDetail, {
      minSats: 1,
      maxSats: 150_000,
    })

    await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalledWith(""))
  })

  it("does not flag anything while the receiver's limits are unknown", async () => {
    const { setAsyncErrorMessage } = renderComponent(makeBtcPaymentDetail(), null)

    await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalledWith(""))
    expect(setAsyncErrorMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("recipient can receive"),
    )
  })

  it("applies the same validation to lnurl payments from the BTC wallet", async () => {
    const paymentDetail = makeBtcPaymentDetail({
      paymentType: "lnurl",
    } as Partial<PaymentDetail<WalletCurrency>>)
    const { setAsyncErrorMessage } = renderComponent(paymentDetail, {
      minSats: 1,
      maxSats: 150_000,
    })

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenCalledWith(
        "The most this recipient can receive per payment is 150000 sats",
      ),
    )
  })
})

// ENG-556, reproduced from production (v0.6.6, USD wallet -> rastafari@strike.me):
// nothing under $1.00 could be sent, and the error named the minimum as "NaN".
//
// LUD-06 bounds are SATS; a cash wallet's settlementAmount is CENTS. Comparing
// them directly read Strike's 100-sat floor as 100 cents, so the app demanded
// $1.00 for a receiver whose real minimum is worth single-digit cents.
describe("DetailAmountNote cash-wallet LNURL bounds (ENG-556)", () => {
  // 100 sats at ~$65k/BTC. The mock converts explicitly so the test does not
  // depend on a live rate.
  const CENTS_PER_SAT = 0.065
  const convertMoneyAmount = (amount: MoneyAmountLike, currency = "USD") => {
    if (amount.currencyCode === "SAT" && (currency === "USD" || currency === "USDT")) {
      return {
        ...amount,
        amount: amount.amount * CENTS_PER_SAT,
        currency,
        currencyCode: "USD",
      }
    }
    return amount
  }

  const makeUsdLnurlDetail = (cents: number, minSats: number, maxSats: number) =>
    ({
      sendingWalletDescriptor: { id: "usd-wallet-id", currency: WalletCurrency.Usd },
      paymentType: "lnurl",
      canSetAmount: true,
      canSendMax: false,
      isSendingMax: false,
      canSetMemo: false,
      lnurlParams: { min: minSats, max: maxSats },
      settlementAmount: {
        amount: cents,
        currency: WalletCurrency.Usd,
        currencyCode: "USD",
      },
      unitOfAccountAmount: {
        amount: cents,
        currency: WalletCurrency.Usd,
        currencyCode: "USD",
      },
      convertMoneyAmount,
      setAmount: jest.fn(),
    } as unknown as PaymentDetail<WalletCurrency>)

  beforeEach(() => {
    mockConvertMoneyAmount.mockImplementation(convertMoneyAmount)
    mockFormatDisplayAndWalletAmount.mockImplementation(
      ({ walletAmount }: { walletAmount: MoneyAmountLike }) =>
        `$0.07 (${walletAmount.amount} sats)`,
    )
  })

  it("allows 50c to Strike, whose floor is 100 sats (~7c)", async () => {
    // The production report: this was refused outright.
    const { setAsyncErrorMessage } = renderComponent(
      makeUsdLnurlDetail(50, 100, 16_000_000),
      null,
    )

    await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
    expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
  })

  it("still flags an amount genuinely below the receiver's floor", async () => {
    // 5c is under 100 sats (~7c), so this one really is too small.
    const { setAsyncErrorMessage } = renderComponent(
      makeUsdLnurlDetail(5, 100, 16_000_000),
      null,
    )

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith(
        expect.stringContaining("less than minimum amount"),
      ),
    )
  })

  it("names the minimum instead of saying NaN", async () => {
    const { setAsyncErrorMessage } = renderComponent(
      makeUsdLnurlDetail(5, 100, 16_000_000),
      null,
    )

    await waitFor(() => {
      const message = setAsyncErrorMessage.mock.calls.at(-1)?.[0] as string
      expect(message).not.toMatch(/NaN/)
      expect(message).toContain("100 sats")
    })
  })

  it("flags an amount above the receiver's ceiling", async () => {
    // The max check was equally broken: comparing cents to sats meant it only
    // fired above $160,000 for a 16M-sat ceiling, so it never protected anyone.
    const { setAsyncErrorMessage } = renderComponent(
      makeUsdLnurlDetail(2_000_000, 100, 16_000_000),
      null,
    )

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith(
        expect.stringContaining("greater than maximum amount"),
      ),
    )
  })
})
