import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import DetailAmountNote from "../../app/components/send-flow/DetailAmountNote"
import { WalletCurrency } from "../../app/graphql/generated"
import { PaymentDetail } from "../../app/screens/send-bitcoin-screen/payment-details"

jest.mock("@app/hooks", () => ({
  useBreez: () => ({ btcWallet: { balance: 1_633_284 } }),
  // checkErrorMessage bails when convertMoneyAmount is unavailable, so the
  // mock must return a callable even though the BTC branch never invokes it.
  usePriceConversion: () => ({
    convertMoneyAmount: (amount: unknown) => amount,
  }),
  useDisplayCurrency: () => ({ formatDisplayAndWalletAmount: jest.fn() }),
  useFormatSats: () => (sats: number) => `${sats} sats`,
}))

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
