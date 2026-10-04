/**
 * ENG-616: the Flashcard v2 (Cashu card) screen renders what the last tap read
 * and tells the truth about the card's balance and PIN state.
 */
import * as React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import type { CashuCardState } from "../../app/contexts/Flashcard"
import {
  FlashcardV2Screen,
  formatUnitAmount,
  shortPubkey,
} from "../../app/screens/card-screen/flashcard-v2"

loadLocale("en")
const LL = i18nObject("en")

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockAddListener = jest.fn((_event: string, _listener: () => void) => jest.fn())
let mockIsFocused = true
const mockTapFlashcard = jest.fn(async () => ({}))
const mockForgetCashuCard = jest.fn()
const mockResetFlashcard = jest.fn()
let mockCashuCard: CashuCardState | undefined
let mockIsAuthed = true
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUnfinishedTopUps: any[] = []
const mockDismissTopUp = jest.fn()
// Undefined: the real per-version answer (no released applet keeps a blocked
// card from spending, ENG-615). A spec sets it to render a version that does.
let mockBlockedPinGatesSpend: boolean | undefined

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
    isFocused: () => mockIsFocused,
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
    forgetCashuCard: mockForgetCashuCard,
    resetFlashcard: mockResetFlashcard,
  }),
  useTapFlashcard: () => mockTapFlashcard,
  useUnfinishedTopUps: () => ({
    records: mockUnfinishedTopUps,
    dismiss: mockDismissTopUp,
  }),
}))
jest.mock("@app/utils/cashu-card", () => {
  const actual = jest.requireActual("@app/utils/cashu-card")
  return {
    ...actual,
    blockedPinGatesSpend: (version: string) =>
      mockBlockedPinGatesSpend ?? actual.blockedPinGatesSpend(version),
  }
})

const PUBKEY = "02" + "ab".repeat(32)
const SAT_KEYSET = "0059534ce0bfa19a"

const card = (overrides: Partial<CashuCardState> = {}): CashuCardState => ({
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
  keysets: [{ keysetId: SAT_KEYSET, amount: 1500 }],
  unitTotals: { byUnit: [{ unit: "sat", amount: 1500 }], unknown: 0 },
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
    mockIsFocused = true
    mockBlockedPinGatesSpend = undefined
    mockCashuCard = card()
    mockUnfinishedTopUps = []
  })

  it("shows the balance in the unit the mint named, slot summary, applet version and a short card id", () => {
    renderScreen()

    expect(screen.getByTestId("flashcard-v2-balance-sat").props.children).toBe(
      "1,500 sats",
    )
    expect(screen.getByText("3 loaded · 24 free of 32")).toBeTruthy()
    expect(screen.getByText("v0.2")).toBeTruthy()
    expect(screen.getByTestId("flashcard-v2-card-id").props.children).toBe(
      shortPubkey(PUBKEY),
    )
    // The full 66-char key is never on screen; the short form is enough to
    // tell two cards apart.
    expect(screen.queryByText(PUBKEY)).toBeNull()
  })

  it("never shows the card's figure bare: until the mint names the unit, it says the unit is unknown", () => {
    // GET_BALANCE adds every keyset together and the card stores no unit.
    mockCashuCard = card({ unitTotals: undefined })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-balance-unknown").props.children).toBe(
      "1,500 · unit unknown",
    )
    expect(screen.queryByText("1,500")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-balance-sat")).toBeNull()
  })

  it("shows a total per unit on a card holding more than one, and labels what no keyset accounts for", () => {
    mockCashuCard = card({
      balance: 1255,
      unitTotals: {
        byUnit: [
          { unit: "sat", amount: 1000 },
          { unit: "usd", amount: 250 },
        ],
        unknown: 5,
      },
    })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-balance-sat").props.children).toBe(
      "1,000 sats",
    )
    expect(screen.getByTestId("flashcard-v2-balance-usd").props.children).toBe("2.50 USD")
    expect(screen.getByTestId("flashcard-v2-balance-unknown").props.children).toBe(
      "5 · unit unknown",
    )
    // Never summed across units.
    expect(screen.queryByText(/1,255/)).toBeNull()
  })

  it("says an empty card is empty without waiting on the mint", () => {
    mockCashuCard = card({ balance: 0, unspent: 0, keysets: [], unitTotals: undefined })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-balance-empty").props.children).toBe("Empty")
    expect(screen.queryByTestId("flashcard-v2-balance-unknown")).toBeNull()
  })

  it("shows the card's total as unit unknown when the tap lost the keyset split", () => {
    // readCashuCard keeps GET_BALANCE when the per-slot reads fail and leaves
    // `keysets` undefined; the provider then has nothing to ask the mint.
    mockCashuCard = card({ keysets: undefined, unitTotals: undefined })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-balance-unknown").props.children).toBe(
      "1,500 · unit unknown",
    )
    expect(screen.queryByTestId("flashcard-v2-balance-empty")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-balance-sat")).toBeNull()
  })

  it("re-reads through the routing tap, so a different card opens its own screen", () => {
    renderScreen()

    fireEvent.press(screen.getByTestId("flashcard-v2-refresh"))

    expect(mockTapFlashcard).toHaveBeenCalledTimes(1)
  })

  it("puts the card's actions right under the balance, above the PIN notice and the card details", () => {
    mockCashuCard = card({ version: "0.2", pinState: "set" })

    renderScreen()

    // Document order in the rendered tree.
    const tree = JSON.stringify(screen.toJSON())
    const at = (marker: string) => {
      const index = tree.indexOf(marker)
      expect(index).toBeGreaterThan(-1)
      return index
    }
    const balance = at(JSON.stringify(LL.FlashcardV2.onCardBalance()))
    const pinNotice = at('"flashcard-v2-pin-bypassable"')
    const details = at('"flashcard-v2-card-id"')
    // Every action, not just the first: Remove card is the only one a blocked
    // or unknown-PIN card gets, so it has to sit up here too.
    ;[
      LL.FlashcardV2.topUp(),
      LL.FlashcardV2.changePin(),
      LL.CardScreen.removeCard(),
    ].forEach((label) => {
      const action = at(JSON.stringify(label))
      expect(balance).toBeLessThan(action)
      expect(action).toBeLessThan(pinNotice)
    })
    expect(pinNotice).toBeLessThan(details)
  })

  it("warns that a set PIN on a v0.2 card won't stop someone holding it", () => {
    // CashuApplet.java@v0.2.0:517-521: the third wrong VERIFY_PIN blocks the
    // PIN, and a blocked PIN gates nothing (:587-591, ENG-615). Next to the
    // no-PIN notice ("anyone holding this card can spend"), silence here would
    // tell the owner a set PIN protects the balance.
    mockCashuCard = card({ version: "0.2", pinState: "set" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-pin-bypassable")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.pinSetBypassableTitle())).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.pinSetBypassableBody())).toBeTruthy()
    expect(
      screen.getByText(/three wrong PIN entries in a row switch the PIN check off/),
    ).toBeTruthy()
    expect(screen.getByText(/won't stop someone who has the card/)).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-no-pin")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-blocked")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-pin-unknown")).toBeNull()
  })

  it("says nothing about a set PIN only on a version confirmed to keep refusing once blocked", () => {
    mockBlockedPinGatesSpend = true
    mockCashuCard = card({ version: "9.9", pinState: "set" })

    renderScreen()

    expect(screen.queryByTestId("flashcard-v2-pin-bypassable")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-no-pin")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-blocked")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-pin-unknown")).toBeNull()
  })

  it("warns that a v0.2 card with no PIN spends for whoever holds it, and promises nothing a PIN cannot deliver", () => {
    // On v0.2.0 three wrong guesses turn a set PIN off (ENG-615), so the
    // notice must not sell setting one as protection for a balance.
    mockCashuCard = card({ version: "0.2", pinState: "unset" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-no-pin")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.noPinBody())).toBeTruthy()
    expect(screen.getByText(/Anyone holding this card can spend/)).toBeTruthy()
    expect(screen.queryByText(/Set a PIN/i)).toBeNull()
    expect(screen.queryByText(/before carrying a balance/i)).toBeNull()
  })

  it("tells the truth about a blocked v0.2 card: it no longer asks for a PIN and anyone holding it can spend it", () => {
    // CashuApplet.java@v0.2.0:587-591 gates only pinState 1: once blocked,
    // SPEND_PROOF runs with no PIN. The card is open, not frozen, and nothing
    // unblocks it (ENG-617).
    mockCashuCard = card({ version: "0.2", pinState: "blocked" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-blocked")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.blockedOpenTitle())).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.blockedOpenBody())).toBeTruthy()
    expect(screen.getByText(/anyone holding the card can spend its balance/)).toBeTruthy()
    expect(screen.getByText(/can't be unblocked/)).toBeTruthy()
    expect(screen.getByText(/Move the value off it/)).toBeTruthy()
    // Not the frozen-and-safe reading the firmware does not back.
    expect(screen.queryByText(LL.FlashcardV2.blockedLockedTitle())).toBeNull()
    expect(screen.queryByText(/refuses to spend/)).toBeNull()
    expect(screen.queryByText(/unblock now/i)).toBeNull()
  })

  it("keys the blocked copy on the applet version: only a version confirmed to keep refusing reads as frozen", () => {
    mockBlockedPinGatesSpend = true
    mockCashuCard = card({ version: "9.9", pinState: "blocked" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-blocked")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.blockedLockedTitle())).toBeTruthy()
    expect(screen.getByText(/refuses to spend and can't be unblocked/)).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.blockedOpenTitle())).toBeNull()
  })

  it("says it cannot read a PIN state byte it does not know, instead of calling the card PIN-less", () => {
    mockCashuCard = card({ pinState: "unknown" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-pin-unknown")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.pinUnknownTitle())).toBeTruthy()
    expect(screen.getByText(/can't read this card's PIN state/)).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-no-pin")).toBeNull()
    expect(screen.queryByText(/No PIN on this card/)).toBeNull()
    expect(screen.queryByText(/Anyone holding this card can spend/)).toBeNull()
  })

  it("offers Set PIN on a card with none and Change PIN on a card with one, opening the PIN screen in that mode", () => {
    mockCashuCard = card({ pinState: "unset" })
    const { unmount } = renderScreen()
    fireEvent.press(screen.getByText(LL.FlashcardV2.setPin()))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2Pin", { mode: "set" })
    expect(screen.queryByText(LL.FlashcardV2.changePin())).toBeNull()
    unmount()

    mockNavigate.mockClear()
    mockCashuCard = card({ pinState: "set" })
    renderScreen()
    fireEvent.press(screen.getByText(LL.FlashcardV2.changePin()))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2Pin", { mode: "change" })
    expect(screen.queryByText(LL.FlashcardV2.setPin())).toBeNull()
  })

  it("offers Top up on a card whose PIN state it can read, opening a new top-up", () => {
    ;(["unset", "set"] as const).forEach((pinState) => {
      mockNavigate.mockClear()
      mockCashuCard = card({ pinState })
      const { unmount } = renderScreen()
      fireEvent.press(screen.getByText(LL.FlashcardV2.topUp()))
      expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2TopUp")
      unmount()
    })
  })

  it("offers no Top up on a blocked card, one whose PIN state it cannot read, or signed out", () => {
    ;(["blocked", "unknown"] as const).forEach((pinState) => {
      mockCashuCard = card({ pinState })
      const { unmount } = renderScreen()
      expect(screen.queryByText(LL.FlashcardV2.topUp())).toBeNull()
      unmount()
    })
    mockCashuCard = card({ pinState: "set" })
    mockIsAuthed = false
    renderScreen()
    expect(screen.queryByText(LL.FlashcardV2.topUp())).toBeNull()
  })

  it("lists a paid top-up that is not on the card yet, and Finish resumes it", () => {
    mockUnfinishedTopUps = [
      {
        id: "t1",
        state: "minted",
        amount: 1000,
        unit: "sat",
        payment: { dispatched: true },
      },
    ]
    renderScreen()

    expect(
      screen.getByText("1,000 sats is paid for and not on the card yet."),
    ).toBeTruthy()
    fireEvent.press(screen.getByTestId("flashcard-v2-finish-topup"))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2TopUp", { topUpId: "t1" })
  })

  it("says a sent payment may still be on its way, and hides a quote that was never paid", () => {
    mockUnfinishedTopUps = [
      {
        id: "sent",
        state: "quoted",
        amount: 500,
        unit: "sat",
        quote: { expiry: null },
        payment: { dispatched: true, everDispatched: true },
      },
      {
        id: "never",
        state: "quoted",
        amount: 800,
        unit: "sat",
        quote: { expiry: null },
        payment: { dispatched: false, everDispatched: false },
      },
    ]
    renderScreen()

    expect(
      screen.getByText(
        "A top-up of 500 sats is waiting for its payment to reach the mint.",
      ),
    ).toBeTruthy()
    expect(screen.getAllByTestId("flashcard-v2-unfinished-topup")).toHaveLength(1)
  })

  /** A quote of an hour's life, as old as `ageMs` by the phone's clock, expiring `expiryAgoMs` ago by it. */
  const quoteAged = (ageMs: number, expiryAgoMs: number) => ({
    expiry: Math.floor((Date.now() - expiryAgoMs) / 1000),
    requestedAt: Date.now() - ageMs,
    quotedAt: Date.now() - ageMs,
    lifeMs: 60 * 60_000,
  })

  it("offers Dismiss, not Finish, for a sent payment whose invoice expired long enough ago that nothing can pay it", () => {
    const sent = { state: "quoted", amount: 500, unit: "sat" }
    mockUnfinishedTopUps = [
      {
        ...sent,
        id: "dead",
        // Past its life and the grace, by its age and by the mint's expiry.
        quote: quoteAged(71 * 60_000, 11 * 60_000),
        payment: { dispatched: true, everDispatched: true },
      },
      {
        ...sent,
        id: "just-expired",
        quote: quoteAged(61 * 60_000, 60_000),
        payment: { dispatched: true, everDispatched: true },
      },
    ]
    mockDismissTopUp.mockResolvedValue(undefined)
    renderScreen()

    expect(
      screen.getByText(
        "A top-up of 500 sats expired before its payment reached the mint.",
      ),
    ).toBeTruthy()
    expect(screen.getAllByTestId("flashcard-v2-dismiss-topup")).toHaveLength(1)
    expect(screen.getAllByTestId("flashcard-v2-finish-topup")).toHaveLength(1)
    fireEvent.press(screen.getByTestId("flashcard-v2-dismiss-topup"))
    expect(mockDismissTopUp).toHaveBeenCalledWith("dead")
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("never offers Dismiss on a phone clock running fast: a quote minutes old is not dead, whatever the clock says", () => {
    mockUnfinishedTopUps = [
      {
        id: "young",
        state: "quoted",
        amount: 500,
        unit: "sat",
        // The phone's clock is two hours ahead of the mint's: the mint's
        // expiry reads as long past, and the quote is five minutes old.
        quote: quoteAged(5 * 60_000, 65 * 60_000),
        payment: { dispatched: true, everDispatched: true },
      },
    ]
    renderScreen()

    expect(
      screen.getByText(
        "A top-up of 500 sats is waiting for its payment to reach the mint.",
      ),
    ).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-dismiss-topup")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-finish-topup")).toBeTruthy()
  })

  it("shows a top-up paid for that the mint no longer issues as paid, with Finish (which says why), never as expired or with Dismiss", () => {
    mockUnfinishedTopUps = [
      {
        id: "stranded",
        state: "paid",
        mintRefused: "expired",
        amount: 1000,
        unit: "sat",
        // Long past its life: the payment settled while the app was closed.
        quote: quoteAged(3 * 60 * 60_000, 2 * 60 * 60_000),
        payment: { dispatched: true, everDispatched: true },
      },
    ]
    renderScreen()

    expect(
      screen.getByText("1,000 sats is paid for and not on the card yet."),
    ).toBeTruthy()
    expect(
      screen.queryByText(
        "A top-up of 1,000 sats expired before its payment reached the mint.",
      ),
    ).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-dismiss-topup")).toBeNull()
    fireEvent.press(screen.getByTestId("flashcard-v2-finish-topup"))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2TopUp", { topUpId: "stranded" })
  })

  it("says why a top-up stays when Dismiss is refused", async () => {
    mockUnfinishedTopUps = [
      {
        id: "dead",
        state: "quoted",
        amount: 500,
        unit: "sat",
        quote: quoteAged(71 * 60_000, 11 * 60_000),
        payment: { dispatched: true, everDispatched: true },
      },
    ]
    mockDismissTopUp.mockRejectedValueOnce(
      new Error("the mint holds this top-up's payment"),
    )
    renderScreen()
    expect(screen.queryByTestId("flashcard-v2-topup-notice")).toBeNull()

    await act(async () =>
      fireEvent.press(screen.getByTestId("flashcard-v2-dismiss-topup")),
    )

    expect(mockDismissTopUp).toHaveBeenCalledWith("dead")
    expect(screen.getByTestId("flashcard-v2-topup-notice").props.children).toBe(
      LL.FlashcardV2.topUpDismissRefused(),
    )
  })

  it("hides a quote whose last payment was refused: none of it is out", () => {
    mockUnfinishedTopUps = [
      {
        id: "refused",
        state: "quoted",
        amount: 500,
        unit: "sat",
        quote: { expiry: null },
        payment: { dispatched: false, everDispatched: true },
      },
    ]
    renderScreen()
    expect(screen.queryByTestId("flashcard-v2-unfinished-topup")).toBeNull()
  })

  it("offers no PIN action on a blocked card or one whose PIN state it cannot read", () => {
    ;(["blocked", "unknown"] as const).forEach((pinState) => {
      mockCashuCard = card({ pinState })
      const { unmount } = renderScreen()
      expect(screen.queryByText(LL.FlashcardV2.setPin())).toBeNull()
      expect(screen.queryByText(LL.FlashcardV2.changePin())).toBeNull()
      unmount()
    })
  })

  it("Remove card forgets the Cashu card, not the BoltCard", () => {
    renderScreen()

    fireEvent.press(screen.getByText(/Remove/))

    expect(mockForgetCashuCard).toHaveBeenCalledTimes(1)
    expect(mockResetFlashcard).not.toHaveBeenCalled()
  })

  it("hides Remove card when signed out and forgets the Cashu card on leaving instead", () => {
    mockIsAuthed = false

    renderScreen()

    expect(screen.queryByText(/Remove/)).toBeNull()
    // The PIN action sits behind sign-in with Remove card.
    expect(screen.queryByText(LL.FlashcardV2.changePin())).toBeNull()
    expect(mockAddListener).toHaveBeenCalledWith("beforeRemove", expect.any(Function))
    const [, onLeave] = mockAddListener.mock.calls[0]
    onLeave()
    expect(mockForgetCashuCard).toHaveBeenCalledTimes(1)
    expect(mockResetFlashcard).not.toHaveBeenCalled()
  })

  it("offers no PIN action when signed out, on a card with a PIN or without one", () => {
    mockIsAuthed = false
    ;(["set", "unset"] as const).forEach((pinState) => {
      mockCashuCard = card({ pinState })
      const { unmount } = renderScreen()
      expect(screen.queryByText(LL.FlashcardV2.setPin())).toBeNull()
      expect(screen.queryByText(LL.FlashcardV2.changePin())).toBeNull()
      unmount()
    })
  })

  it("leaves the screen when there is no card to show", () => {
    mockCashuCard = undefined

    renderScreen()

    expect(mockGoBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("flashcard-v2-balance-sat")).toBeNull()
  })

  it("does not pop a second screen when the card is forgotten on the way out", () => {
    // Leaving signed out forgets the card during the screen's own removal;
    // by then it is no longer focused, and a goBack would pop the screen below.
    mockCashuCard = undefined
    mockIsFocused = false

    renderScreen()

    expect(mockGoBack).not.toHaveBeenCalled()
  })

  describe("a screen reader hears the words on screen, never a test id", () => {
    type NoticeCase = {
      name: string
      state: Partial<CashuCardState>
      /** Stands in for `blockedPinGatesSpend`; undefined keeps the real answer. */
      gates?: boolean
      testID: string
      title: string
      body: string
    }
    const notices: NoticeCase[] = [
      {
        name: "no-PIN",
        state: { pinState: "unset" },
        testID: "flashcard-v2-no-pin",
        title: LL.FlashcardV2.noPinTitle(),
        body: LL.FlashcardV2.noPinBody(),
      },
      {
        name: "set-PIN on v0.2",
        state: { pinState: "set" },
        testID: "flashcard-v2-pin-bypassable",
        title: LL.FlashcardV2.pinSetBypassableTitle(),
        body: LL.FlashcardV2.pinSetBypassableBody(),
      },
      {
        name: "blocked v0.2",
        state: { pinState: "blocked" },
        testID: "flashcard-v2-blocked",
        title: LL.FlashcardV2.blockedOpenTitle(),
        body: LL.FlashcardV2.blockedOpenBody(),
      },
      {
        name: "blocked on a confirmed version",
        state: { version: "9.9", pinState: "blocked" },
        gates: true,
        testID: "flashcard-v2-blocked",
        title: LL.FlashcardV2.blockedLockedTitle(),
        body: LL.FlashcardV2.blockedLockedBody(),
      },
      {
        name: "unknown PIN state",
        state: { pinState: "unknown" },
        testID: "flashcard-v2-pin-unknown",
        title: LL.FlashcardV2.pinUnknownTitle(),
        body: LL.FlashcardV2.pinUnknownBody(),
      },
    ]

    notices.forEach(({ name, state, gates, testID, title, body }) => {
      it(`reads the ${name} notice as one element, labelled with its title and body`, () => {
        mockBlockedPinGatesSpend = gates
        mockCashuCard = card(state)

        renderScreen()

        const notice = screen.getByTestId(testID)
        expect(notice.props.accessible).toBe(true)
        expect(notice.props.accessibilityLabel).toContain(body)
        expect(notice.props.accessibilityLabel).toBe(`${title}. ${body}`)
        expect(notice.props.accessibilityLabel).not.toContain("flashcard-v2")
      })
    })

    it("reads the balance and card id as their text, and names the refresh button", () => {
      renderScreen()

      // No label on a Text means it is read as its text ("1,500 sats").
      expect(
        screen.getByTestId("flashcard-v2-balance-sat").props.accessibilityLabel,
      ).toBeUndefined()
      expect(
        screen.getByTestId("flashcard-v2-card-id").props.accessibilityLabel,
      ).toBeUndefined()
      const refresh = screen.getByTestId("flashcard-v2-refresh")
      expect(refresh.props.accessibilityRole).toBe("button")
      expect(refresh.props.accessibilityLabel).toBe(LL.CardScreen.readNfcCard())
    })
  })
})

describe("formatUnitAmount", () => {
  it("reads sat amounts as sats", () => {
    expect(formatUnitAmount(1234567, "sat", LL)).toBe("1,234,567 sats")
  })

  it("reads usd amounts as the cents they are (spec/NUT-XX.md: sats or cents)", () => {
    expect(formatUnitAmount(123456, "usd", LL)).toBe("1,234.56 USD")
    expect(formatUnitAmount(5, "usd", LL)).toBe("0.05 USD")
  })

  it("shows any other unit as the mint's number and the mint's code", () => {
    expect(formatUnitAmount(1500, "msat", LL)).toBe("1,500 msat")
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
