/**
 * The amount keypad end to end: AmountInput, its modal, the amount screen and
 * the screen's header are all real. Hooks and the keyboard are stubbed at
 * their edges.
 */
import * as React from "react"
import { Modal } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { AmountInput, AmountInputProps } from "../../app/components/amount-input"
import { WalletCurrency } from "../../app/graphql/generated"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { ConvertMoneyAmount } from "../../app/screens/send-bitcoin-screen/payment-details"
import { MoneyAmount, WalletOrDisplayCurrency } from "../../app/types/amounts"

loadLocale("en")
const LL = i18nObject("en")

// Test rate: 1 sat = 2 cents. The self-custodial wallet holds 1,234 sats
// ($24.68) and the Cash wallet $50.00, so the header names its wallet by its
// figure alone.
const SAT_TO_CENTS = 2
const mockBreezSats = 1_234
const mockCashCents = 5_000

const mockDollars = (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) => {
  const cents =
    moneyAmount.currency === WalletCurrency.Btc
      ? moneyAmount.amount * SAT_TO_CENTS
      : moneyAmount.amount
  return `$${(cents / 100).toFixed(2)}`
}

const mockUseDisplayCurrency = () => ({
  currencyInfo: {
    DisplayCurrency: {
      symbol: "$",
      minorUnitToMajorUnitOffset: 2,
      showFractionDigits: true,
      currencyCode: "USD",
    },
    BTC: {
      symbol: "",
      minorUnitToMajorUnitOffset: 0,
      showFractionDigits: false,
      currencyCode: "SAT",
    },
    USD: {
      symbol: "$",
      minorUnitToMajorUnitOffset: 2,
      showFractionDigits: true,
      currencyCode: "USD",
    },
  },
  zeroDisplayAmount: { amount: 0, currency: "DisplayCurrency", currencyCode: "USD" },
  formatMoneyAmount: ({
    moneyAmount,
  }: {
    moneyAmount: MoneyAmount<WalletOrDisplayCurrency>
  }) => mockDollars(moneyAmount),
  getSecondaryAmountIfCurrencyIsDifferent: () => undefined,
  moneyAmountToDisplayCurrencyString: ({
    moneyAmount,
  }: {
    moneyAmount: MoneyAmount<WalletOrDisplayCurrency>
  }) => mockDollars(moneyAmount),
})

// AmountInput and the amount screen import the concrete module…
jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => mockUseDisplayCurrency(),
}))
// …while the screen's header imports from the hooks barrel.
jest.mock("@app/hooks", () => ({
  useBreez: () => ({ btcWallet: { balance: mockBreezSats } }),
  useDisplayCurrency: () => mockUseDisplayCurrency(),
}))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useWalletOverviewScreenQuery: () => ({
    data: {
      me: {
        defaultAccount: {
          wallets: [{ id: "cash", walletCurrency: "USD", balance: mockCashCents }],
        },
      },
    },
  }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/components/currency-keyboard", () => ({ CurrencyKeyboard: () => null }))

const convertMoneyAmount = (<W extends WalletOrDisplayCurrency>(
  moneyAmount: MoneyAmount<WalletOrDisplayCurrency>,
  toCurrency: W,
): MoneyAmount<W> => {
  const inSats =
    moneyAmount.currency === WalletCurrency.Btc
      ? moneyAmount.amount
      : moneyAmount.amount / SAT_TO_CENTS
  return {
    amount: toCurrency === WalletCurrency.Btc ? inSats : inSats * SAT_TO_CENTS,
    currency: toCurrency,
    currencyCode: toCurrency === WalletCurrency.Btc ? "SAT" : "USD",
  }
}) as ConvertMoneyAmount

// A keypad for sats that opened itself, as the Cashu card top-up's does.
const renderKeypad = (props: Partial<AmountInputProps> = {}) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <AmountInput
        walletCurrency={WalletCurrency.Btc}
        convertMoneyAmount={convertMoneyAmount}
        initiallyOpen
        {...props}
      />
    </ThemeProvider>,
  )

const keypadIsUp = () => screen.queryByText(LL.AmountInputScreen.setAmount()) !== null

describe("the amount keypad", () => {
  it("heads a sats keypad paid from the Cash wallet with that wallet's balance, not the self-custodial one's", () => {
    renderKeypad({ balanceWalletCurrency: WalletCurrency.Usd })
    expect(screen.getByText("$50.00")).toBeTruthy()
    expect(screen.queryByText("$24.68")).toBeNull()
  })

  it("heads a sats keypad with the self-custodial wallet's balance unless told otherwise, as the send flows have it", () => {
    renderKeypad()
    expect(screen.getByText("$24.68")).toBeTruthy()
    expect(screen.queryByText("$50.00")).toBeNull()
  })

  it("names its close button for a screen reader, and the button closes it", () => {
    renderKeypad()
    expect(keypadIsUp()).toBe(true)

    fireEvent.press(screen.getByRole("button", { name: LL.common.close() }))
    expect(keypadIsUp()).toBe(false)
  })

  it("closes on Android's back key, back on the field", () => {
    renderKeypad()
    expect(keypadIsUp()).toBe(true)

    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose")
    expect(keypadIsUp()).toBe(false)
    expect(screen.getByText(LL.AmountInputButton.tapToSetAmount())).toBeTruthy()
  })
})
