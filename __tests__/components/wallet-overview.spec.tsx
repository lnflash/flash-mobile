import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, act } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import WalletOverview from "../../app/components/wallet-overview/wallet-overview"

// The display-currency converter is undefined until the realtime price query
// resolves; that is the ENG-512 race. This handle lets each test drive it.
const mockMoneyToDisplay = jest.fn()

jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: () => "1000 sats",
    displayCurrency: "USD",
    moneyAmountToDisplayCurrencyString: mockMoneyToDisplay,
  }),
}))
jest.mock("@app/hooks", () => ({
  useBreez: () => ({ btcWallet: { balance: 0 } }),
  // A previously-linked card: lnurl + balance are restored from cached HTML on
  // mount, so the flashcard row renders even before any live price/read.
  useFlashcard: () => ({
    lnurl: "lnurl1abc",
    balanceInSats: 12345,
    readFlashcard: jest.fn(),
  }),
}))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    // Seeded from a previous session — the values that must survive the race.
    // Cash "0" and card "$5.00" are distinct so we can tell the rows apart.
    persistentState: {
      isAdvanceMode: false,
      cashDisplayBalance: "0",
      cardDisplayBalance: "$5.00",
    },
    updateState: jest.fn(),
  }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => true }))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useWalletOverviewScreenQuery: () => ({
    data: { me: { defaultAccount: { wallets: [] } } },
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

describe("WalletOverview flashcard balance (ENG-512)", () => {
  afterEach(() => mockMoneyToDisplay.mockReset())

  it("keeps the cached card balance when price conversion isn't ready", async () => {
    // Converter not ready → returns undefined for every wallet, as on cold start.
    mockMoneyToDisplay.mockReturnValue(undefined)

    const screen = renderOverview()
    await act(async () => {})

    // Regression guard: a linked card must keep showing its persisted balance
    // instead of blanking to the empty "Add Flashcard" state (only the card row
    // carries $5.00, so this proves the card row specifically survived).
    expect(screen.queryAllByText(/\$5\.00/).length).toBeGreaterThan(0)
  })

  it("updates the card balance once price conversion resolves", async () => {
    mockMoneyToDisplay.mockReturnValue("$9.99")

    const screen = renderOverview()
    await act(async () => {})

    // Once the price is ready the row refreshes off the stale cached value.
    expect(screen.queryAllByText(/\$9\.99/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/\$5\.00/)).toBeNull()
  })
})
