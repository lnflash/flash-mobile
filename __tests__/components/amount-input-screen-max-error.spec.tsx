import * as React from "react"
import { render } from "@testing-library/react-native"

import { WalletCurrency } from "../../app/graphql/generated"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { AmountInputScreen } from "../../app/components/amount-input-screen/amount-input-screen"
import {
  DisplayCurrency,
  MoneyAmount,
  toUsdMoneyAmount,
  WalletOrDisplayCurrency,
} from "../../app/types/amounts"

// The max-exceeded error string must show the FLOORED spendable balance, not
// the raw fractional-cent wallet balance (#690). CashoutDetails passes the raw
// usdBalance as maxAmount; with a wallet holding 109.9346 cents the balance
// row shows "$1.09" (floored) while round-to-nearest formatting of the raw max
// would tell a user typing $1.10 that the maximum is "$1.10" — the exact
// amount just rejected.

// Render only the error message; the full UI pulls in Breez/Apollo/SVG deps
// that are irrelevant to this regression.
jest.mock("../../app/components/amount-input-screen/amount-input-screen-ui", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native")
  return {
    AmountInputScreenUI: ({ errorMessage }: { errorMessage?: string }) =>
      mockReact.createElement(Text, null, errorMessage),
  }
})

// Minor units (cents) -> "$X.XX", rounding to nearest like Intl.NumberFormat.
// If AmountInputScreen did NOT floor before formatting, 109.9346 cents would
// render as "$1.10".
const mockFormatMoneyAmount = ({ moneyAmount }: { moneyAmount: { amount: number } }) =>
  `$${(moneyAmount.amount / 100).toFixed(2)}`

const mockUsdLikeCurrencyInfo = {
  symbol: "$",
  currencyCode: "USD",
  minorUnitToMajorUnitOffset: 2,
  showFractionDigits: true,
}

// One stable hook value: the component memoizes on currencyInfo, so a fresh
// object per call would re-fire its initialAmount effect forever.
const mockUseDisplayCurrencyValue = {
  currencyInfo: {
    USD: mockUsdLikeCurrencyInfo,
    USDT: mockUsdLikeCurrencyInfo,
    BTC: {
      symbol: "₿",
      currencyCode: "sats",
      minorUnitToMajorUnitOffset: 0,
      showFractionDigits: false,
    },
    DisplayCurrency: mockUsdLikeCurrencyInfo,
  },
  getSecondaryAmountIfCurrencyIsDifferent: () => undefined,
  formatMoneyAmount: mockFormatMoneyAmount,
  zeroDisplayAmount: {
    amount: 0,
    currency: "DisplayCurrency",
    currencyCode: "USD",
  },
}

jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => mockUseDisplayCurrencyValue,
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

// Identity USD<->display conversion, mirroring the use-price-conversion
// identity path (USD wallet amounts and a USD display currency share minor
// units), which is exactly the CashoutDetails setup.
const mockConvertMoneyAmount = <W extends WalletOrDisplayCurrency>(
  moneyAmount: MoneyAmount<WalletOrDisplayCurrency>,
  toCurrency: W,
): MoneyAmount<W> => ({
  amount: moneyAmount.amount,
  currency: toCurrency,
  currencyCode: toCurrency === WalletCurrency.Btc ? "sats" : "USD",
})

const renderWithMaxAmount = ({
  enteredDisplayAmount,
  maxAmount,
}: {
  enteredDisplayAmount: number
  maxAmount: MoneyAmount<WalletOrDisplayCurrency>
}) =>
  render(
    <AmountInputScreen
      goBack={jest.fn()}
      initialAmount={{
        amount: enteredDisplayAmount,
        currency: DisplayCurrency,
        currencyCode: "USD",
      }}
      setAmount={jest.fn()}
      walletCurrency={WalletCurrency.Usd}
      convertMoneyAmount={mockConvertMoneyAmount}
      maxAmount={maxAmount}
    />,
  )

beforeAll(() => {
  loadLocale("en")
})

describe("AmountInputScreen max-exceeded error floors wallet balances (#690)", () => {
  it("shows the floored spendable max, not the rejected round-to-nearest amount", () => {
    // Wallet holds 109.9346 cents; balance rows show "$1.09"; user types $1.10
    const screen = renderWithMaxAmount({
      enteredDisplayAmount: 110,
      maxAmount: toUsdMoneyAmount(109.9346),
    })

    expect(screen.queryByText(/Amount must not exceed \$1\.09\./)).toBeTruthy()
    expect(screen.queryByText(/\$1\.10/)).toBeNull()
  })

  it("shows $0.00 for post-MAX sub-cent residue, not $0.01", () => {
    const screen = renderWithMaxAmount({
      enteredDisplayAmount: 1,
      maxAmount: toUsdMoneyAmount(0.9346),
    })

    expect(screen.queryByText(/Amount must not exceed \$0\.00\./)).toBeTruthy()
    expect(screen.queryByText(/\$0\.01/)).toBeNull()
  })

  it("still validates against the raw balance (validation unchanged)", () => {
    // $1.09 entered against a raw max of 109.9346 cents is allowed — no error
    const screen = renderWithMaxAmount({
      enteredDisplayAmount: 109,
      maxAmount: toUsdMoneyAmount(109.9346),
    })

    expect(screen.queryByText(/Amount must not exceed/)).toBeNull()
  })

  it("leaves display-currency max amounts untouched", () => {
    const screen = renderWithMaxAmount({
      enteredDisplayAmount: 250,
      maxAmount: { amount: 200, currency: DisplayCurrency, currencyCode: "USD" },
    })

    expect(screen.queryByText(/Amount must not exceed \$2\.00\./)).toBeTruthy()
  })
})
