import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, act } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import WalletOverview from "../../app/components/wallet-overview/wallet-overview"

// The API can report the USD cash-wallet balance in fractional cents
// (109.9346 = $1.099346 held at IBEX, #690). Driven per-test below.
let mockUsdBalance = 109.9346

// Realistic-enough formatter: minor units (cents) -> "$X.XX", rounding to
// nearest like Intl.NumberFormat. If WalletOverview did NOT floor before
// formatting, 109.9346 cents would render as "$1.10".
const mockToDollarString = ({ moneyAmount }: { moneyAmount: { amount: number } }) =>
  `$${(moneyAmount.amount / 100).toFixed(2)}`

jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: mockToDollarString,
    displayCurrency: "USD",
    moneyAmountToDisplayCurrencyString: mockToDollarString,
  }),
}))
jest.mock("@app/hooks", () => ({
  useBreez: () => ({ btcWallet: { balance: 0 } }),
  useFlashcard: () => ({
    lnurl: undefined,
    balanceInSats: undefined,
    readFlashcard: jest.fn(),
  }),
}))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    persistentState: { isAdvanceMode: false },
    updateState: jest.fn(),
  }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => true }))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useWalletOverviewScreenQuery: () => ({
    data: {
      me: {
        defaultAccount: {
          wallets: [{ id: "usd-wallet", walletCurrency: "USD", balance: mockUsdBalance }],
        },
      },
    },
  }),
  useHideBalanceQuery: () => ({ data: { hideBalance: false } }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}))

const renderOverview = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />
    </ThemeProvider>,
  )

describe("WalletOverview cash balance floors to spendable minor units (#690)", () => {
  it("renders a fractional-cent balance floored, never rounded up", async () => {
    mockUsdBalance = 109.9346 // $1.099346 spendable

    const screen = renderOverview()
    await act(async () => {})

    // $1.09 is spendable; $1.10 is the round-to-nearest bug users could not send
    expect(screen.queryAllByText(/\$1\.09/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/\$1\.10/)).toBeNull()
  })

  it("renders sub-cent residue after a MAX drain as $0.00, not $0.01", async () => {
    mockUsdBalance = 0.9346

    const screen = renderOverview()
    await act(async () => {})

    expect(screen.queryAllByText(/\$0\.00/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/\$0\.01/)).toBeNull()
  })
})
