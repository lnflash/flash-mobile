/**
 * ENG-616: the Flashcard v2 (Cashu card) screen renders what the last tap read
 * and tells the truth about the card's PIN state.
 */
import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import {
  FlashcardV2Screen,
  shortPubkey,
} from "../../app/screens/card-screen/flashcard-v2"
import { CashuCardInfo } from "../../app/utils/cashu-card"

loadLocale("en")

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockAddListener = jest.fn(() => jest.fn())
const mockReadFlashcard = jest.fn(async () => ({}))
const mockResetFlashcard = jest.fn()
let mockCashuCard: CashuCardInfo | undefined
let mockIsAuthed = true

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    addListener: mockAddListener,
  }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/graphql/generated", () => ({
  useHideBalanceQuery: () => ({ data: { hideBalance: false } }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => mockIsAuthed,
}))
jest.mock("@app/hooks", () => ({
  useFlashcard: () => ({
    cashuCard: mockCashuCard,
    readFlashcard: mockReadFlashcard,
    resetFlashcard: mockResetFlashcard,
  }),
}))

const PUBKEY = "02" + "ab".repeat(32)

const card = (overrides: Partial<CashuCardInfo> = {}): CashuCardInfo => ({
  version: "0.2",
  maxSlots: 32,
  unspent: 3,
  spent: 5,
  empty: 24,
  secp256k1Native: true,
  schnorr: true,
  pinState: "set",
  pubkey: PUBKEY,
  balance: 1500,
  ...overrides,
})

const renderScreen = () =>
  render(
    <ThemeProvider
      theme={createTheme({
        mode: "light",
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      <FlashcardV2Screen />
    </ThemeProvider>,
  )

describe("FlashcardV2Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAuthed = true
    mockCashuCard = card()
  })

  it("shows the on-card balance, slot summary, applet version and a short card id", () => {
    renderScreen()

    expect(screen.getByTestId("flashcard-v2-balance").props.children).toBe("1,500")
    expect(screen.getByText("3 loaded · 24 free of 32")).toBeTruthy()
    expect(screen.getByText("v0.2")).toBeTruthy()
    expect(screen.getByTestId("flashcard-v2-card-id").props.children).toBe(
      shortPubkey(PUBKEY),
    )
    // The full 66-char key is never on screen; the short form is enough to
    // tell two cards apart.
    expect(screen.queryByText(PUBKEY)).toBeNull()
  })

  it("re-reads the card from the refresh control", () => {
    renderScreen()

    fireEvent.press(screen.getByTestId("flashcard-v2-refresh"))

    expect(mockReadFlashcard).toHaveBeenCalledWith(false)
  })

  it("says nothing about the PIN when one is set", () => {
    renderScreen()

    expect(screen.queryByTestId("flashcard-v2-no-pin")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-blocked")).toBeNull()
  })

  it("warns that a card with no PIN spends for whoever holds it", () => {
    mockCashuCard = card({ pinState: "unset" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-no-pin")).toBeTruthy()
    expect(screen.getByText(/Anyone holding this card can spend/)).toBeTruthy()
  })

  it("tells a blocked card the truth: it cannot be unblocked and must be replaced", () => {
    // No unblock path exists on this applet (ENG-617); the screen must not
    // offer one or imply one is coming.
    mockCashuCard = card({ pinState: "blocked" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-blocked")).toBeTruthy()
    expect(screen.getByText(/cannot be unblocked/)).toBeTruthy()
    expect(screen.queryByText(/unblock now/i)).toBeNull()
  })

  it("offers Remove card only when signed in, and it forgets the card", () => {
    renderScreen()

    fireEvent.press(screen.getByText(/Remove/))

    expect(mockResetFlashcard).toHaveBeenCalledTimes(1)
  })

  it("hides Remove card when signed out and forgets the card on leaving instead", () => {
    mockIsAuthed = false

    renderScreen()

    expect(screen.queryByText(/Remove/)).toBeNull()
    expect(mockAddListener).toHaveBeenCalledWith("beforeRemove", expect.any(Function))
  })

  it("leaves the screen when there is no card to show", () => {
    mockCashuCard = undefined

    renderScreen()

    expect(mockGoBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("flashcard-v2-balance")).toBeNull()
  })
})

describe("shortPubkey", () => {
  it("keeps the first eight and last six hex chars", () => {
    expect(shortPubkey(PUBKEY)).toBe("02ababab…ababab")
  })

  it("leaves anything short alone", () => {
    expect(shortPubkey("02abcd")).toBe("02abcd")
  })
})
