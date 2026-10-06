import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { StyleSheet } from "react-native"
import { act, fireEvent, render, screen, within } from "@testing-library/react-native"

import WalletOverview from "../../app/components/wallet-overview/wallet-overview"
import { attachedCard } from "../../app/hooks/use-attached-cashu-card"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import type { KnownCard } from "../../app/store/redux/slices/flashcardV2Slice"

const card = (over: Partial<KnownCard> = {}): KnownCard => ({
  pubkey: "02" + "51".repeat(32),
  version: "0.4",
  pinState: "unset",
  lastBalance: 1289,
  lastSeenAt: 1_000,
  unit: "sat",
  ...over,
})

let mockAttachedCard: KnownCard | undefined
let mockSessionCard: { pubkey: string } | undefined
const mockTap = jest.fn()
const mockNavigate = jest.fn()
const mockMoneyToDisplay = jest.fn()

jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: ({ moneyAmount }: { moneyAmount: { amount: number } }) =>
      `${moneyAmount.amount} sats`,
    displayCurrency: "USD",
    moneyAmountToDisplayCurrencyString: mockMoneyToDisplay,
  }),
}))
jest.mock("@app/hooks", () => ({
  // Not zero: a Bitcoin zero converted on Home can only be the card's.
  useBreez: () => ({ btcWallet: { balance: 2_100 } }),
  // No BoltCard: only the Cashu card can show a Flashcard row.
  useFlashcard: () => ({
    lnurl: undefined,
    balanceInSats: undefined,
    cashuCard: mockSessionCard,
  }),
  useOpenFlashcard: () => jest.fn(),
  useTapFlashcard: () => mockTap,
  useAttachedCashuCard: () => mockAttachedCard,
}))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    persistentState: { isAdvanceMode: false, cashDisplayBalance: "0" },
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
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate }),
}))

loadLocale("en")
const LL = i18nObject("en")

const renderOverview = async () => {
  render(
    <ThemeProvider theme={createTheme({})}>
      <WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />
    </ThemeProvider>,
  )
  await act(async () => {})
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAttachedCard = undefined
  mockSessionCard = undefined
  // Only the card's figure converts to something the other rows never show.
  mockMoneyToDisplay.mockImplementation(
    ({ moneyAmount }: { moneyAmount: { amount: number; currency: string } }) =>
      moneyAmount.currency === "BTC" && moneyAmount.amount === 1289 ? "$1.08" : "$0.00",
  )
})

describe("WalletOverview: the Cashu card row", () => {
  it("shows no Flashcard row when no card is attached", async () => {
    await renderOverview()
    expect(screen.queryByTestId("home-cashu-card")).toBeNull()
    expect(screen.queryByText(LL.HomeScreen.flashcard())).toBeNull()
  })

  it("shows the attached card with the balance it held at its last read", async () => {
    mockAttachedCard = card()
    await renderOverview()

    expect(screen.getByTestId("home-cashu-card")).toBeTruthy()
    expect(screen.getByText(LL.HomeScreen.flashcard())).toBeTruthy()
    expect(screen.getByText(/\$1\.08/)).toBeTruthy()
    expect(mockMoneyToDisplay).toHaveBeenCalledWith({
      moneyAmount: expect.objectContaining({ amount: 1289, currency: "BTC" }),
    })
  })

  it("draws the Bearer card as the row's thumbnail, the icon's width, with no shadow and hidden from screen readers", async () => {
    mockAttachedCard = card()
    await renderOverview()

    const row = screen.getByTestId("home-cashu-card")
    const art = within(row).getByTestId("home-cashu-card-art")
    const style = StyleSheet.flatten(art.props.style)
    expect(style.width).toBe(54)
    expect(style.elevation).toBe(0)
    expect(style.shadowOpacity).toBe(0)

    const hidden = within(row).UNSAFE_getByProps({
      importantForAccessibility: "no-hide-descendants",
    })
    expect(hidden.props.accessibilityElementsHidden).toBe(true)
    expect(within(hidden).getByTestId("home-cashu-card-art")).toBe(art)
  })

  it("reads a USD card's balance as cents", async () => {
    mockAttachedCard = card({ unit: "usd", lastBalance: 250 })
    await renderOverview()

    expect(mockMoneyToDisplay).toHaveBeenCalledWith({
      moneyAmount: expect.objectContaining({ amount: 250, currency: "USD" }),
    })
  })

  it("shows the card's own figure, with no currency code, before the price is in", async () => {
    mockMoneyToDisplay.mockReturnValue(undefined)
    mockAttachedCard = card()
    await renderOverview()

    // An exact match: "1289 sats USD" would not match.
    expect(screen.getByText("1289 sats")).toBeTruthy()
  })

  it("says the unit is unknown for a card whose unit the mint has not named", async () => {
    mockAttachedCard = card({ unit: undefined, lastBalance: 500 })
    await renderOverview()

    expect(screen.getByText(LL.FlashcardV2.unitUnknown({ amount: "500" }))).toBeTruthy()
    expect(screen.getByText(LL.HomeScreen.flashcard())).toBeTruthy()
  })

  it("shows an empty card as zero in the display currency, though the mint named no unit", async () => {
    // An empty card holds no proofs, so no unit is ever named for it. Only a
    // Bitcoin zero converts to "$0.00" here: a USD zero, or any other row,
    // would show "$9.99".
    mockMoneyToDisplay.mockImplementation(
      ({ moneyAmount }: { moneyAmount: { amount: number; currency: string } }) =>
        moneyAmount.currency === "BTC" && moneyAmount.amount === 0 ? "$0.00" : "$9.99",
    )
    mockAttachedCard = card({ unit: undefined, lastBalance: 0 })
    await renderOverview()

    expect(mockMoneyToDisplay).toHaveBeenCalledWith({
      moneyAmount: expect.objectContaining({ amount: 0, currency: "BTC" }),
    })
    const row = within(screen.getByTestId("home-cashu-card"))
    expect(row.getByText(/\$0\.00/)).toBeTruthy()
    expect(row.queryByText(LL.FlashcardV2.unitUnknown({ amount: "0" }))).toBeNull()
  })

  it("opens the card read this session at once, and otherwise asks for a tap", async () => {
    mockAttachedCard = card()
    mockSessionCard = { pubkey: card().pubkey }
    await renderOverview()
    fireEvent.press(screen.getByText(LL.HomeScreen.flashcard()))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2")
    expect(mockTap).not.toHaveBeenCalled()

    screen.unmount()
    jest.clearAllMocks()
    mockSessionCard = undefined
    await renderOverview()
    fireEvent.press(screen.getByText(LL.HomeScreen.flashcard()))
    expect(mockTap).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe("attachedCard", () => {
  it("is the card attached to the app, and none once it is detached, whatever else is on record", () => {
    const older = card({ pubkey: "03" + "ae".repeat(32), lastSeenAt: 1_000 })
    const current = card({ lastSeenAt: 2_000 })
    const cards = { [older.pubkey]: older, [current.pubkey]: current }
    expect(attachedCard({ cards, attachedPubkey: current.pubkey })).toBe(current)
    expect(attachedCard({ cards, attachedPubkey: older.pubkey })).toBe(older)
    // Remove card detached it: an older card on record never shows instead.
    expect(attachedCard({ cards })).toBeUndefined()
    expect(attachedCard({ cards: {} })).toBeUndefined()
  })
})
