import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import InforError from "../../app/components/redeem-flow/InforError"
import { WalletCurrency } from "../../app/graphql/generated"
import {
  BtcMoneyAmount,
  MoneyAmount,
  WalletOrDisplayCurrency,
} from "../../app/types/amounts"

type MoneyAmountLike = { amount: number; currency: string; currencyCode: string }

// Faithful to the real formatMoneyAmount (app/hooks/use-display-currency.ts):
// a cash amount is divided by 100 and printed with the "$" symbol at two
// fraction digits; sats print with "₿" and no fraction digits. Reimplemented
// rather than echoed, so a call that hands it a bare number instead of a
// MoneyAmount produces a visibly wrong string rather than a passing test.
const mockFormatMoneyAmount = jest.fn(
  ({ moneyAmount }: { moneyAmount: MoneyAmountLike }) =>
    moneyAmount.currency === WalletCurrency.Btc
      ? `₿${moneyAmount.amount}`
      : `$${(moneyAmount.amount / 100).toFixed(2)}`,
)

// The redeem screen prices the user's entry in cents before comparing it with
// the one-cent floor. Controlled per test.
const mockConvertMoneyAmount = jest.fn(
  (amount: MoneyAmountLike, _currency?: string): MoneyAmountLike => amount,
)

jest.mock("@app/hooks", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: (...args: unknown[]) =>
      (mockFormatMoneyAmount as (...a: unknown[]) => unknown)(...args),
  }),
  usePriceConversion: () => ({
    convertMoneyAmount: (...args: unknown[]) =>
      (mockConvertMoneyAmount as (...a: unknown[]) => unknown)(...args),
  }),
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const satsAmount = (sats: number): BtcMoneyAmount => ({
  amount: sats,
  currency: WalletCurrency.Btc,
  currencyCode: "BTC",
})

const renderComponent = (
  unitOfAccountAmount: MoneyAmount<WalletOrDisplayCurrency>,
  { amountIsFlexible = false }: { amountIsFlexible?: boolean } = {},
) => {
  const setHasError = jest.fn()
  const view = render(
    <ThemeProvider theme={createTheme()}>
      <InforError
        unitOfAccountAmount={unitOfAccountAmount}
        minWithdrawableSatoshis={satsAmount(10)}
        maxWithdrawableSatoshis={satsAmount(150_000)}
        amountIsFlexible={amountIsFlexible}
        setHasError={setHasError}
      />
    </ThemeProvider>,
  )
  return { ...view, setHasError }
}

beforeAll(() => {
  loadLocale("en")
})

afterEach(() => {
  mockConvertMoneyAmount.mockReset()
  mockConvertMoneyAmount.mockImplementation((amount: MoneyAmountLike) => amount)
  mockFormatMoneyAmount.mockClear()
})

// The redeem flow shares SendBitcoinScreen.minAmountInvoiceError with the send
// flow. That placeholder used to be typed as a number and this call site
// passed a bare `1` — the message read "...minimum amount 1", naming no unit,
// the sibling of the "NaN" the send flow printed. The threshold is one USD
// cent; the message has to say so.
describe("redeem-flow InforError one-cent threshold", () => {
  it("names the floor as $0.01 when the entry is worth less than a cent", async () => {
    mockConvertMoneyAmount.mockImplementation(() => ({
      amount: 0.4,
      currency: WalletCurrency.Usd,
      currencyCode: "USD",
    }))

    const { setHasError, findByText } = renderComponent(satsAmount(1))

    await waitFor(() => expect(setHasError).toHaveBeenCalledWith(true))
    await findByText(/less than minimum amount \$0\.01/)

    // Not the bare "1", and not "$1.00" — a hundred times the real floor.
    expect(mockFormatMoneyAmount).toHaveBeenCalledWith(
      expect.objectContaining({
        moneyAmount: expect.objectContaining({
          amount: 1,
          currency: WalletCurrency.Usd,
        }),
      }),
    )
  })

  it("renders no error at all once the entry clears one cent", async () => {
    mockConvertMoneyAmount.mockImplementation(() => ({
      amount: 25,
      currency: WalletCurrency.Usd,
      currencyCode: "USD",
    }))

    const { setHasError, queryByText } = renderComponent(satsAmount(400))

    await waitFor(() => expect(setHasError).toHaveBeenCalledWith(false))
    expect(setHasError).not.toHaveBeenCalledWith(true)
    expect(queryByText(/minimum amount/)).toBeNull()
  })

  it("treats exactly one cent as clearing the floor", async () => {
    mockConvertMoneyAmount.mockImplementation(() => ({
      amount: 1,
      currency: WalletCurrency.Usd,
      currencyCode: "USD",
    }))

    const { setHasError, queryByText } = renderComponent(satsAmount(16))

    await waitFor(() => expect(setHasError).toHaveBeenCalledWith(false))
    expect(queryByText(/minimum amount/)).toBeNull()
  })

  it("shows the withdrawable range in sats when the amount is flexible", async () => {
    mockConvertMoneyAmount.mockImplementation(() => ({
      amount: 25,
      currency: WalletCurrency.Usd,
      currencyCode: "USD",
    }))

    const { findByText } = renderComponent(satsAmount(400), { amountIsFlexible: true })

    await findByText(/₿10/)
    await findByText(/₿150000/)
  })
})
