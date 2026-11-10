/**
 * ENG-616, ENG-675: the Flashcard v2 (Cashu card) screen renders what the last
 * tap read and tells the truth about the card's balance, PIN state and owner
 * (card protocol 2.0): a card with no owner is set up first, and only a card
 * this phone owns gets the owner's actions (PIN, limits).
 */
import * as React from "react"
import { Dimensions, Image, StyleSheet } from "react-native"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native"
import { Provider } from "react-redux"
import { createTheme, ThemeProvider } from "@rneui/themed"
import type { ReactTestRendererJSON } from "react-test-renderer"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import type {
  CardOwnership,
  CashuCardPreview,
  CashuCardState,
} from "../../app/contexts/Flashcard"
import {
  cardLast4,
  cardNotices,
  FlashcardV2Screen,
  shortPubkey,
} from "../../app/screens/card-screen/flashcard-v2"
import { formatUnitAmount, isolatedMintName } from "../../app/utils/cashu-card-format"
import { cardInfo, cardRecord, cashuCardState } from "../helpers/cashu-card-state"
import { store } from "../../app/store/redux"
import {
  cardLimitsSet,
  cardSetupSaved,
  resetFlashcardV2,
} from "../../app/store/redux/slices/flashcardV2Slice"
import {
  RunTidyArgs,
  TidyError,
  TidyOffer,
  TidyRecord,
} from "../../app/utils/cashu-card-topup"
import { CardError } from "../../app/utils/cashu-card"
import { CardSpendError } from "../../app/utils/cashu-card-spend"
import { RelayUnsettledError } from "../../app/utils/cashu-card-relay"
import { CardSetup, ownerKeyStore } from "../../app/utils/cashu-card-owner-store"

loadLocale("en")
const LL = i18nObject("en")

const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockAddListener = jest.fn((_event: string, _listener: () => void) => jest.fn())
let mockIsFocused = true
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  addListener: mockAddListener,
  isFocused: () => mockIsFocused,
}
const mockTapFlashcard = jest.fn(async () => ({}))
const mockForgetCashuCard = jest.fn()
const mockResetFlashcard = jest.fn()
let mockCashuCard: CashuCardState | undefined
let mockCashuCardPreview: CashuCardPreview | undefined
let mockIsAuthed = true
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUnfinishedTopUps: any[] = []
const mockDismissTopUp = jest.fn()
const mockRunCardOperation = jest.fn()
const mockFeePpk = jest.fn(async (_id: string) => 0)
// The tidy engine and the PIN check, for the specs that let the tap run the
// tidy's own operation: what it was handed is what they check.
const mockRunTidy = jest.fn()
const mockVerifyCardPin = jest.fn()

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  // No navigator here: a focus effect runs once on mount.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
  // One object for the screen's life, as React Navigation's is: an effect that
  // depends on it re-runs for its other deps, never because it changed.
  useNavigation: () => mockNavigation,
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
// The card art's <Svg> as plain host elements carrying the props it was given.
jest.mock("react-native-svg", () => require("../helpers/svg-stub"))
jest.mock("@app/graphql/generated", () => ({
  useHideBalanceQuery: () => ({ data: { hideBalance: false } }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => mockIsAuthed,
}))
jest.mock("@app/hooks", () => ({
  useFlashcard: () => ({
    cashuCard: mockCashuCard,
    cashuCardPreview: mockCashuCardPreview,
    forgetCashuCard: mockForgetCashuCard,
    resetFlashcard: mockResetFlashcard,
  }),
  useTapFlashcard: () => mockTapFlashcard,
  // Records of this protocol's pieces unless a spec says otherwise (ENG-675).
  useUnfinishedTopUps: () => ({
    records: mockUnfinishedTopUps.map((record) => ({ cardFormat: 4, ...record })),
    dismiss: mockDismissTopUp,
  }),
  // The real tidy hook (ENG-702), over the store and a card session mocked below.
  useCardTidy: (...args: unknown[]) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../app/hooks/use-card-tidy").useCardTidy(...args),
}))
// What the tidy hook taps through, and the mint it asks for the fee.
jest.mock("@app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({ runCardOperation: mockRunCardOperation }),
}))
jest.mock("@app/utils/cashu-card-topup/connected", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup/connected"),
  topUpMint: () => ({ url: "https://mint.test", feePpk: mockFeePpk }),
}))
jest.mock("@app/utils/cashu-card-topup", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup"),
  runTidy: (...args: unknown[]) => mockRunTidy(...args),
}))
jest.mock("@app/utils/cashu-card", () => ({
  ...jest.requireActual("@app/utils/cashu-card"),
  verifyCardPin: (...args: unknown[]) => mockVerifyCardPin(...args),
}))
const PUBKEY = "02" + "ab".repeat(32)
const SAT_KEYSET = "0059534ce0bfa19a"

/** A 2.0 card holding 1,500 sats, its PIN set, owned by this phone. */
const card = (overrides: Partial<CashuCardState> = {}): CashuCardState =>
  cashuCardState({
    pubkey: PUBKEY,
    keysets: [{ keysetId: SAT_KEYSET, amount: 1500 }],
    ...overrides,
  })
/** The same card, owned by another phone: this one holds no key for it. */
const othersCard = (overrides: Partial<CashuCardState> = {}) =>
  card({ ownerKeySource: undefined, ...overrides })

/** The screen under the store and the theme it reads. */
const screenTree = () => (
  <Provider store={store}>
    <ThemeProvider
      theme={createTheme({
        mode: "light",
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      <FlashcardV2Screen />
    </ThemeProvider>
  </Provider>
)

const renderScreen = () => render(screenTree())

describe("FlashcardV2Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAuthed = true
    mockIsFocused = true
    mockCashuCard = card()
    mockCashuCardPreview = undefined
    mockUnfinishedTopUps = []
  })

  it("shows the balance in the unit the mint named, slot summary, applet version and a short card id", () => {
    renderScreen()

    expect(screen.getByTestId("flashcard-v2-balance-sat").props.children).toBe(
      "1,500 sats",
    )
    expect(screen.getByText("3 loaded · 5 spent · 120 free of 128")).toBeTruthy()
    // Spent slots are freed by the top-up's load tap once settled (ENG-631).
    expect(screen.getByTestId("flashcard-v2-slots-spent-note").props.children).toBe(
      LL.FlashcardV2.slotsSpentNote(),
    )
    expect(screen.getByText("v2.0")).toBeTruthy()
    expect(screen.getByTestId("flashcard-v2-card-id").props.children).toBe(
      shortPubkey(PUBKEY),
    )
    // The full 66-char key is never on screen; the short form is enough to
    // tell two cards apart.
    expect(screen.queryByText(PUBKEY)).toBeNull()
  })

  it("says nothing about spent slots on a card with none", () => {
    mockCashuCard = card({ spent: 0, empty: 29 })

    renderScreen()

    expect(screen.getByText("3 loaded · 0 spent · 29 free of 128")).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-slots-spent-note")).toBeNull()
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
    mockCashuCard = card({ pinState: "unset" })

    renderScreen()

    // Document order in the rendered tree.
    const tree = JSON.stringify(screen.toJSON())
    const at = (marker: string) => {
      const index = tree.indexOf(marker)
      expect(index).toBeGreaterThan(-1)
      return index
    }
    // A recorded card's caption names its mint (ENG-787): forge is "Flash".
    const balance = at(
      JSON.stringify(
        LL.FlashcardV2.mintLine({ mint: isolatedMintName("https://forge.flashapp.me") }),
      ),
    )
    const pinNotice = at('"flashcard-v2-no-pin"')
    const details = at('"flashcard-v2-card-id"')
    // Every action, not just the first: Remove card is the only one some
    // cards get, so it has to sit up here too.
    ;[
      LL.FlashcardV2.topUp(),
      LL.FlashcardV2.setPin(),
      LL.FlashcardV2.limits(),
      LL.CardScreen.removeCard(),
    ].forEach((label) => {
      const action = at(JSON.stringify(label))
      expect(balance).toBeLessThan(action)
      expect(action).toBeLessThan(pinNotice)
    })
    expect(pinNotice).toBeLessThan(details)
  })

  it("says nothing about a set PIN on a 2.0 card: three wrong entries block it, and only its owner unblocks it", () => {
    // The 0.x warning that three wrong entries switch the PIN off is gone
    // with 0.x (ENG-615): on 2.0 a blocked PIN stays blocked until the
    // owner's CHANGE_PIN (spec/APDU.md, VERIFY_PIN, D22).
    mockCashuCard = card({ pinState: "set" })

    renderScreen()

    expect(screen.queryByTestId("flashcard-v2-pin-bypassable")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-no-pin")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-blocked")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-pin-unknown")).toBeNull()
    expect(screen.queryByText(/switch the PIN check off/)).toBeNull()
  })

  it("warns about a card that is not set up yet, and offers Set up in place of Top up", () => {
    mockCashuCard = card({
      hasOwner: false,
      ownerKeySource: undefined,
      pinState: "unset",
    })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-not-set-up")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.notSetUpTitle())).toBeTruthy()
    expect(screen.getByText(/belongs to the first phone that sets it up/)).toBeTruthy()
    fireEvent.press(screen.getByTestId("flashcard-v2-action-setup"))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2Setup")
    // An ownerless card takes no load (6A90), and nothing is the owner's yet.
    expect(screen.queryByText(LL.FlashcardV2.topUp())).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.setPin())).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.limits())).toBeNull()
  })

  it("warns that a card with no PIN spends for whoever holds it, up to its limits", () => {
    mockCashuCard = card({ pinState: "unset" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-no-pin")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.noPinBody())).toBeTruthy()
    expect(screen.getByText(/Anyone holding this card can spend/)).toBeTruthy()
  })

  it("tells the owner of a blocked card that a new PIN unblocks it, and offers it", () => {
    mockCashuCard = card({ pinState: "blocked" })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-blocked")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.blockedTitle())).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.blockedOwnerBody())).toBeTruthy()
    fireEvent.press(screen.getByText(LL.FlashcardV2.changePin()))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2Pin", { mode: "change" })
    // The owner's grant loads without the PIN: Top up stays.
    expect(screen.getByText(LL.FlashcardV2.topUp())).toBeTruthy()
  })

  it("tells the holder of a blocked card another phone owns that only that phone can unblock it, and offers no load", () => {
    mockCashuCard = othersCard({ pinState: "blocked" })

    renderScreen()

    expect(screen.getByText(LL.FlashcardV2.blockedOtherBody())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.changePin())).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.topUp())).toBeNull()
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

  it("offers the owner Set PIN on a card with none and Change PIN on a card with one, opening the PIN screen in that mode", () => {
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

  it("offers Top up on a set-up card whose PIN state it can read, this phone's or another's, opening a new top-up", () => {
    ;[
      card({ pinState: "unset" }),
      card({ pinState: "set" }),
      othersCard({ pinState: "set" }),
    ].forEach((shown) => {
      mockNavigate.mockClear()
      mockCashuCard = shown
      const { unmount } = renderScreen()
      fireEvent.press(screen.getByText(LL.FlashcardV2.topUp()))
      expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2TopUp")
      unmount()
    })
  })

  it("offers no Top up on a card whose PIN state it cannot read, one not set up, or signed out", () => {
    ;[
      card({ pinState: "unknown" }),
      card({ hasOwner: false, ownerKeySource: undefined }),
    ].forEach((shown) => {
      mockCashuCard = shown
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

  it("offers no PIN action on a card whose PIN state it cannot read, nor on a card another phone owns", () => {
    ;[
      card({ pinState: "unknown" }),
      othersCard({ pinState: "set" }),
      othersCard({ pinState: "unset" }),
    ].forEach((shown) => {
      mockCashuCard = shown
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

  describe("the card", () => {
    // jest's window is 750 dp wide; a spec that narrows it puts it back.
    const initial = { window: Dimensions.get("window"), screen: Dimensions.get("screen") }
    afterEach(() => {
      act(() => Dimensions.set(initial))
    })

    const CARD = "flashcard-v2-card-art"

    type Host = ReactTestRendererJSON
    const hosts = (n: Host | string): Host[] =>
      typeof n === "string" ? [] : [n, ...(n.children ?? []).flatMap(hosts)]
    const isCard = (n: Host | string) => typeof n !== "string" && n.props.testID === CARD

    /**
     * The card's column as drawn: the card's style, whether it comes first,
     * what comes next, and how far down the column that starts. In flow,
     * nothing but the card's box and the margins between holds room.
     */
    const layout = () => {
      const roots = screen.toJSON()
      const column = (Array.isArray(roots) ? roots : [roots as Host])
        .flatMap(hosts)
        .find((n) => (n.children ?? []).some(isCard)) as Host
      const kids = column.children as Host[]
      const i = kids.findIndex(isCard)
      const card = StyleSheet.flatten(kids[i].props.style)
      const next = kids[i + 1]
      const nextTop =
        (card.marginTop ?? 0) +
        card.height +
        (card.marginBottom ?? 0) +
        (StyleSheet.flatten(next.props.style)?.marginTop ?? 0)
      return { first: i === 0, card, next, nextTop }
    }

    it("draws the Cashu Card face where the old picture was: 320 dp wide, 10 dp down, the balance 16 dp under it", () => {
      renderScreen()

      const { first, card, next, nextTop } = layout()
      expect(first).toBe(true)
      expect(card.position).toBeUndefined()
      expect(card).toMatchObject({
        alignSelf: "center",
        marginTop: 10,
        marginBottom: 16,
        width: 320,
        height: 202,
      })
      // The balance is next in the column, 16 dp under the card.
      expect(hosts(next).some((n) => n.props.testID === "flashcard-v2-balance-sat")).toBe(
        true,
      )
      expect(nextTop).toBe(10 + 202 + 16)
      // The card's own 320 x 202 artboard, stretched to the card (the card
      // keeps its aspect, so nothing distorts).
      const svgs = screen.getByTestId(CARD).findAll((n) => String(n.type) === "RNSVGSvg")
      expect(svgs).toHaveLength(1)
      expect(svgs[0].props).toMatchObject({
        viewBox: "0 0 320 202",
        preserveAspectRatio: "none",
        width: "100%",
        height: "100%",
      })
      // The old picture (the BoltCard's Jamaica art) is gone from this screen.
      expect(
        screen
          .UNSAFE_queryAllByType(Image)
          .filter((image) => /flashcard\.png$/.test(image.props.source?.testUri ?? "")),
      ).toHaveLength(0)
    })

    it("narrows the card with the window, keeping 24 dp either side, and moves the balance with it", () => {
      renderScreen()
      expect(layout().card.width).toBe(320)

      // Split screen, or a foldable folded or unfolded, with the screen open.
      act(() => Dimensions.set({ ...initial, window: { ...initial.window, width: 360 } }))

      const height = (312 * 202) / 320
      const { card, nextTop } = layout()
      expect(card.width).toBe(312)
      expect(card.height).toBeCloseTo(height, 9)
      expect(nextTop).toBeCloseTo(10 + height + 16, 9)
    })

    it("prints no id on the card's face, as the physical card has none: the details list it", () => {
      mockCashuCard = card({ pubkey: "02" + "ab".repeat(30) + "0c67" })

      renderScreen()

      expect(screen.queryByText(/••••/)).toBeNull()
      expect(screen.queryByText(/0C67/)).toBeNull()
      expect(screen.getByTestId("flashcard-v2-card-id").props.children).toBe(
        "02ababab…ab0c67",
      )
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
        name: "not set up",
        state: { hasOwner: false, ownerKeySource: undefined, pinState: "set" },
        testID: "flashcard-v2-not-set-up",
        title: LL.FlashcardV2.notSetUpTitle(),
        body: LL.FlashcardV2.notSetUpBody(),
      },
      {
        name: "blocked, this phone the owner",
        state: { pinState: "blocked" },
        testID: "flashcard-v2-blocked",
        title: LL.FlashcardV2.blockedTitle(),
        body: LL.FlashcardV2.blockedOwnerBody(),
      },
      {
        name: "blocked, another phone the owner",
        state: { pinState: "blocked", ownerKeySource: undefined },
        testID: "flashcard-v2-blocked",
        title: LL.FlashcardV2.blockedTitle(),
        body: LL.FlashcardV2.blockedOtherBody(),
      },
      {
        name: "refresh needed",
        state: { record: cardRecord({ rolls: 7, rollBudget: 7 }) },
        testID: "flashcard-v2-refresh-needed",
        title: LL.FlashcardV2.refreshNeededTitle(),
        body: LL.FlashcardV2.refreshNeededBody(),
      },
      {
        name: "unknown PIN state",
        state: { pinState: "unknown" },
        testID: "flashcard-v2-pin-unknown",
        title: LL.FlashcardV2.pinUnknownTitle(),
        body: LL.FlashcardV2.pinUnknownBody(),
      },
    ]

    notices.forEach(({ name, state, testID, title, body }) => {
      it(`reads the ${name} notice as one element, labelled with its title and body`, () => {
        mockCashuCard = card(state)

        renderScreen()

        const notice = screen.getByTestId(testID)
        expect(notice.props.accessible).toBe(true)
        expect(notice.props.accessibilityLabel).toContain(body)
        expect(notice.props.accessibilityLabel).toBe(`${title}. ${body}`)
        expect(notice.props.accessibilityLabel).not.toContain("flashcard-v2")
      })
    })

    it("reads the card as one image named by the last four of its key, masked as flash-pos masks it, one character at a time", () => {
      mockCashuCard = card({ pubkey: "02" + "ab".repeat(30) + "0c67" })

      renderScreen()

      const art = screen.getByTestId("flashcard-v2-card-art")
      expect(art.props.accessible).toBe(true)
      expect(art.props.accessibilityRole).toBe("image")
      // Spaced, so "0C67" is not read as a number, nor "BEEF" as a word.
      expect(art.props.accessibilityLabel).toBe(
        LL.FlashcardV2.cardEnding({ last4: "0 C 6 7" }),
      )
      expect(art.props.accessibilityLabel).toBe("Flashcard ending 0 C 6 7")
    })

    it("names the card by the screen's title when its key is too short to mask", () => {
      mockCashuCard = card({ pubkey: "abc" })

      renderScreen()

      expect(screen.getByTestId("flashcard-v2-card-art").props.accessibilityLabel).toBe(
        LL.FlashcardV2.title(),
      )
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

// ENG-675: Remove PIN (0.x CLEAR_PIN) is gone with 0.x: a 2.0 card's PIN is
// the owner's to change, never to remove. In its place, the owner's limits,
// the setup of a card with no owner, and what the card says of its clock.
describe("FlashcardV2Screen, a card still verifying (ENG-707)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAuthed = true
    mockIsFocused = true
    mockCashuCard = card()
    mockCashuCardPreview = undefined
    mockUnfinishedTopUps = []
  })

  afterEach(() => {
    mockCashuCardPreview = undefined
  })

  /** What a read tap has before AUTH: another card, 2,500 on it, no unit yet. */
  const preview = (overrides: Partial<CashuCardPreview> = {}): CashuCardPreview => ({
    ...cardInfo({ pinState: "unset", hasOwner: false }),
    pubkey: "03" + "cd".repeat(32),
    balance: 2500,
    ...overrides,
  })

  /** Nothing a verified card offers is on screen: no action, notice, tidy, top-up or owner. */
  const expectNothingToActOn = () => {
    expect(screen.queryByTestId("flashcard-v2-actions")).toBeNull()
    for (const id of [
      "flashcard-v2-action-setup",
      "flashcard-v2-action-topup",
      "flashcard-v2-action-set-pin",
      "flashcard-v2-action-change-pin",
      "flashcard-v2-action-limits",
      "flashcard-v2-finish-topup",
      "flashcard-v2-dismiss-topup",
      "flashcard-v2-unfinished-topup",
      "flashcard-v2-owner",
      "flashcard-v2-refresh",
      "flashcard-v2-not-set-up",
      "flashcard-v2-no-pin",
      "flashcard-v2-blocked",
      "flashcard-v2-pin-unknown",
      "flashcard-v2-refresh-needed",
      "flashcard-v2-tidy-offer",
      "flashcard-v2-tidy-notice",
    ]) {
      expect(screen.queryByTestId(id)).toBeNull()
    }
    expect(screen.queryByText(LL.CardScreen.removeCard())).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.setUp())).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.topUp())).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.topUpFinish())).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.topUpDismiss())).toBeNull()
  }

  it("shows the figure as verifying, and nothing to act on, on a first tap", () => {
    mockCashuCard = undefined
    mockCashuCardPreview = preview()
    mockUnfinishedTopUps = [{ id: "a", state: "paid", amount: 10, unit: "sat" }]

    renderScreen()

    expect(
      screen.getByTestId("flashcard-v2-preview-balance-unknown").props.children,
    ).toBe(LL.FlashcardV2.unitUnknown({ amount: "2,500" }))
    // The verified figure's ids, which the e2e flows wait on, are not used.
    expect(screen.queryByTestId("flashcard-v2-balance-unknown")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-preview-verifying").props.children).toBe(
      LL.FlashcardV2.verifying(),
    )
    expect(screen.getByText("3 loaded · 5 spent · 120 free of 128")).toBeTruthy()
    expectNothingToActOn()
    // The tap is still going: the screen stays up.
    expect(mockGoBack).not.toHaveBeenCalled()
  })

  it("labels the figure with the unit the phone recorded for it", () => {
    mockCashuCard = undefined
    mockCashuCardPreview = preview({
      unitTotals: { byUnit: [{ unit: "sat", amount: 2500 }], unknown: 0 },
    })

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-preview-balance-sat").props.children).toBe(
      "2,500 sats",
    )
    expect(screen.queryByTestId("flashcard-v2-balance-sat")).toBeNull()
  })

  it("stands in for a verified card A while a re-tap verifies: none of A's actions show", () => {
    // Card A, its PIN unset, with a paid top-up to finish: a notice, Finish
    // and the owner's actions would all show for it.
    mockCashuCard = card({ pinState: "unset" })
    mockUnfinishedTopUps = [{ id: "a", state: "paid", amount: 10, unit: "sat" }]
    mockCashuCardPreview = preview()

    renderScreen()

    expect(screen.getByTestId("flashcard-v2-preview-verifying")).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-balance-sat")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-preview-card-id").props.children).toBe(
      shortPubkey("03" + "cd".repeat(32)),
    )
    expectNothingToActOn()
    expect(mockGoBack).not.toHaveBeenCalled()
  })

  it("a verified card says nothing about verifying", () => {
    renderScreen()

    expect(screen.queryByTestId("flashcard-v2-preview-verifying")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-actions")).toBeTruthy()
  })

  // The tap hook never pops the screen it pushed (use-tap-flashcard): when a
  // first-tap card fails AUTH, the provider drops the preview with no card in
  // its place, and this screen's own effect is what leaves.
  it("leaves the screen when a first tap's card fails to verify", () => {
    mockCashuCard = undefined
    mockCashuCardPreview = preview()

    const { rerender } = renderScreen()
    expect(mockGoBack).not.toHaveBeenCalled()

    mockCashuCardPreview = undefined
    rerender(screenTree())

    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it("stays on the screen when a first tap's card verifies", () => {
    mockCashuCard = undefined
    mockCashuCardPreview = preview()

    const { rerender } = renderScreen()

    mockCashuCard = card()
    mockCashuCardPreview = undefined
    rerender(screenTree())

    expect(mockGoBack).not.toHaveBeenCalled()
    expect(screen.queryByTestId("flashcard-v2-preview-verifying")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-actions")).toBeTruthy()
  })
})

describe("FlashcardV2Screen, the owner's actions (card protocol 2.0)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAuthed = true
    mockIsFocused = true
    mockCashuCard = card()
    mockUnfinishedTopUps = []
  })

  it("offers no Remove PIN on any card: 2.0 has none", () => {
    ;(["set", "unset", "blocked"] as const).forEach((pinState) => {
      mockCashuCard = card({ pinState })
      const { unmount } = renderScreen()
      expect(screen.queryByTestId("flashcard-v2-action-remove-pin")).toBeNull()
      unmount()
    })
  })

  it("offers the owner Limits, and opens the limits screen", () => {
    renderScreen()
    fireEvent.press(screen.getByTestId("flashcard-v2-action-limits"))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2Limits")
  })

  it("offers no Limits on a card another phone owns, one not set up, or signed out", () => {
    ;[othersCard(), card({ hasOwner: false, ownerKeySource: undefined })].forEach(
      (shown) => {
        mockCashuCard = shown
        const { unmount } = renderScreen()
        expect(screen.queryByTestId("flashcard-v2-action-limits")).toBeNull()
        unmount()
      },
    )
    mockIsAuthed = false
    mockCashuCard = card()
    renderScreen()
    expect(screen.queryByTestId("flashcard-v2-action-limits")).toBeNull()
  })

  it("makes four actions for the owner: the row wraps, so a 360dp phone keeps its gutters instead of clipping the outer buttons", () => {
    renderScreen()

    const row = screen.getByTestId("flashcard-v2-actions")
    expect(row.props.children.filter(Boolean)).toHaveLength(4)
    const style = StyleSheet.flatten(row.props.style)
    expect(style.flexDirection).toBe("row")
    expect(style.flexWrap).toBe("wrap")
    expect(style.rowGap).toBeGreaterThan(0)
  })

  it("says who owns the card: this phone, another phone, or nobody yet", () => {
    const owner = () => screen.getByTestId("flashcard-v2-owner").props.children
    const { unmount } = renderScreen()
    expect(owner()).toBe(LL.FlashcardV2.ownerThisPhone())
    unmount()
    mockCashuCard = othersCard()
    const second = renderScreen()
    expect(owner()).toBe(LL.FlashcardV2.ownerOther())
    second.unmount()
    mockCashuCard = card({ hasOwner: false, ownerKeySource: undefined })
    renderScreen()
    expect(owner()).toBe(LL.FlashcardV2.ownerNone())
  })

  it("asks for a refresh once the card's window has rolled as often as its owner allows (decision 16)", () => {
    mockCashuCard = card({ record: cardRecord({ rolls: 7, rollBudget: 7 }) })
    const { unmount } = renderScreen()
    expect(screen.getByTestId("flashcard-v2-refresh-needed")).toBeTruthy()
    expect(
      screen.getByText("Open Flash while online and tap your card to refresh it."),
    ).toBeTruthy()
    unmount()
    mockCashuCard = card({ record: cardRecord({ rolls: 6, rollBudget: 7 }) })
    renderScreen()
    expect(screen.queryByTestId("flashcard-v2-refresh-needed")).toBeNull()
  })

  it("cardNotices lists them in order: not set up, the PIN, the refresh", () => {
    expect(
      cardNotices(
        {
          hasOwner: false,
          pinState: "unset",
          locked: false,
          record: cardRecord({ rolls: 9, rollBudget: 7 }),
        },
        { ownership: "none" },
        LL,
      ).map((notice) => notice.testID),
    ).toEqual(["flashcard-v2-not-set-up", "flashcard-v2-no-pin"])
    expect(
      cardNotices(
        {
          hasOwner: true,
          pinState: "set",
          locked: false,
          record: cardRecord({ rolls: 9, rollBudget: 7 }),
        },
        { ownership: "mine" },
        LL,
      ).map((notice) => notice.testID),
    ).toEqual(["flashcard-v2-refresh-needed"])
  })

  // Only a card known to be another phone's is told to find the owner's
  // phone: an owner the read could not settle may be this phone.
  const noticeCopy: Array<
    [
      CardOwnership,
      "refreshNeededBody" | "refreshNeededOtherBody",
      "blockedOwnerBody" | "blockedUnconfirmedBody" | "blockedOtherBody",
    ]
  > = [
    ["mine", "refreshNeededBody", "blockedOwnerBody"],
    ["unknown", "refreshNeededBody", "blockedUnconfirmedBody"],
    ["other", "refreshNeededOtherBody", "blockedOtherBody"],
  ]
  noticeCopy.forEach(([ownership, refreshKey, blockedKey]) =>
    it(`cardNotices for a card whose owner is ${ownership}: the refresh and blocked-PIN copy`, () => {
      const bodies = Object.fromEntries(
        cardNotices(
          {
            hasOwner: true,
            pinState: "blocked",
            locked: false,
            record: cardRecord({ rolls: 7, rollBudget: 7 }),
          },
          { ownership },
          LL,
        ).map((notice) => [notice.testID, notice.body]),
      )
      expect(bodies["flashcard-v2-refresh-needed"]).toBe(LL.FlashcardV2[refreshKey]())
      expect(bodies["flashcard-v2-blocked"]).toBe(LL.FlashcardV2[blockedKey]())
      if (ownership !== "other") {
        expect(bodies["flashcard-v2-refresh-needed"]).not.toBe(
          LL.FlashcardV2.refreshNeededOtherBody(),
        )
        expect(bodies["flashcard-v2-blocked"]).not.toBe(LL.FlashcardV2.blockedOtherBody())
      }
    }),
  )
  ;(["mine", "unknown", "other"] as CardOwnership[]).forEach((ownership) =>
    it(`cardNotices for a LOCKED card with a blocked PIN (owner ${ownership}): no one is told to set a new PIN`, () => {
      const blocked = cardNotices(
        { hasOwner: true, pinState: "blocked", locked: true, record: cardRecord() },
        { ownership },
        LL,
      ).find((notice) => notice.testID === "flashcard-v2-blocked")
      expect(blocked?.body).toBe(LL.FlashcardV2.blockedLockedBody())
      for (const promise of [
        LL.FlashcardV2.blockedOwnerBody(),
        LL.FlashcardV2.blockedUnconfirmedBody(),
      ]) {
        expect(blocked?.body).not.toBe(promise)
      }
    }),
  )

  it("shows a top-up saved for the card's old software as kept for a human, with no Finish or Dismiss", () => {
    mockUnfinishedTopUps = [
      {
        id: "old",
        cardFormat: 0,
        state: "minted",
        amount: 21,
        unit: "sat",
        payment: { dispatched: true },
      },
    ]
    renderScreen()
    expect(
      screen.getByText(LL.FlashcardV2.topUpUnfinishedNeedsUpdate({ amount: "21 sats" })),
    ).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-finish-topup")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-dismiss-topup")).toBeNull()
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

describe("cardLast4", () => {
  it("takes the last four hex digits of the key in upper case, as flash-pos does", () => {
    expect(cardLast4(PUBKEY)).toBe("ABAB")
    expect(cardLast4("02" + "ab".repeat(30) + "0c67")).toBe("0C67")
  })

  it("reads past anything that is not hex", () => {
    expect(cardLast4("02:ab:0c:67 ")).toBe("0C67")
  })

  it("has none for a key too short to hold four", () => {
    expect(cardLast4("abc")).toBeUndefined()
    expect(cardLast4("")).toBeUndefined()
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

describe("FlashcardV2Screen card tidy (ENG-702)", () => {
  const offer = (
    over: Partial<Extract<TidyOffer, { kind: "offer" }>> = {},
  ): TidyOffer => ({
    kind: "offer",
    fee: 0,
    outputs: 5,
    complete: true,
    needsPin: false,
    fingerprint: "pieces-1",
    ...over,
  })
  const TIDY_SERVER = "flashcard-v2-topups"
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Keychain = require("react-native-keychain")

  const saved = (id: string, state: TidyRecord["state"]): TidyRecord => ({
    kind: "tidy",
    version: 1,
    id,
    cardPubkey: PUBKEY,
    mintUrl: "https://mint.test",
    keysetId: SAT_KEYSET,
    fee: 0,
    inputs: [],
    outputs: [{ amount: 1 }],
    loadStarted: false,
    state,
    createdAt: id === "a" ? 1 : 2,
    updatedAt: 1,
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    store.dispatch(resetFlashcardV2())
    await Keychain.resetInternetCredentials({ server: TIDY_SERVER })
    await Keychain.resetInternetCredentials({ server: "flashcard-v2-tidy-archive" })
    await Keychain.resetInternetCredentials({ server: "flashcard-v2-owner" })
    // This phone owns the card: its key is saved, so the tap can load the change.
    await ownerKeyStore.put(PUBKEY, {
      privateKey: "42".repeat(32),
      source: "device",
      createdAt: 1,
    })
    mockIsAuthed = true
    mockIsFocused = true
    mockUnfinishedTopUps = []
    mockCashuCard = card()
    mockRunCardOperation.mockResolvedValue({ status: "tidied", record: {} })
  })

  it("offers a tidy when the read found the card below its shape, with no fee line at a fee of 0", async () => {
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()

    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-offer")).toBeTruthy(),
    )
    expect(screen.getByText(LL.FlashcardV2.tidyBody({ outputs: 5 }))).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-tidy-fee")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-tidy-not-now")).toBeTruthy()
  })

  it("offers nothing when the read made no offer: not the owner's grant, offline, or at its shape", async () => {
    mockCashuCard = card({ tidyOffer: undefined })
    renderScreen()
    await act(async () => undefined)
    expect(screen.queryByTestId("flashcard-v2-tidy-offer")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-tidy-slots-short")).toBeNull()
  })

  it("offers nothing signed out", async () => {
    mockIsAuthed = false
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()
    await act(async () => undefined)
    expect(screen.queryByTestId("flashcard-v2-tidy-offer")).toBeNull()
  })

  it("shows the mint's fee when it is above 0", async () => {
    mockCashuCard = card({ tidyOffer: offer({ fee: 2 }) })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy-fee")).toBeTruthy())
    expect(screen.getByTestId("flashcard-v2-tidy-fee").props.children).toBe(
      LL.FlashcardV2.tidyFee({ fee: "2 sats" }),
    )
  })

  it("hides the offer on Not now until the card's pieces change", async () => {
    mockCashuCard = card({ tidyOffer: offer() })
    const { rerender } = renderScreen()
    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-offer")).toBeTruthy(),
    )

    fireEvent.press(screen.getByTestId("flashcard-v2-tidy-not-now"))

    await waitFor(() =>
      expect(screen.queryByTestId("flashcard-v2-tidy-offer")).toBeNull(),
    )
    expect(store.getState().flashcardV2.tidyDismissed).toEqual({ [PUBKEY]: "pieces-1" })

    // The next read, same pieces: still hidden.
    mockCashuCard = card({ tidyOffer: offer() })
    rerender(screenTree())
    expect(screen.queryByTestId("flashcard-v2-tidy-offer")).toBeNull()

    // A till took a piece since: the pieces changed, and the offer is back.
    mockCashuCard = card({ tidyOffer: offer({ fingerprint: "pieces-2" }) })
    rerender(screenTree())
    expect(screen.getByTestId("flashcard-v2-tidy-offer")).toBeTruthy()
  })

  it("notes when too few slots are free to tidy, with nothing to tap", async () => {
    mockCashuCard = card({ tidyOffer: { kind: "slots-short", fingerprint: "pieces-1" } })
    renderScreen()
    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-slots-short").props.children).toBe(
        LL.FlashcardV2.tidySlotsShort(),
      ),
    )
    expect(screen.queryByTestId("flashcard-v2-tidy")).toBeNull()
  })

  it("tidies with one tap on the card and says so", async () => {
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

    fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
        LL.FlashcardV2.tidyDone(),
      ),
    )
    expect(mockRunCardOperation).toHaveBeenCalledTimes(1)
    expect(mockRunCardOperation.mock.calls[0][1]).toBe(PUBKEY)
    // The re-read reads the pieces again: a tidy moves no balance. And it
    // changes the slots, so a 2.2 card's last payment is relayed first (ENG-820).
    expect(mockRunCardOperation.mock.calls[0][2]).toEqual({
      rereadSlots: true,
      changesSlots: true,
    })
  })

  it("asks for the PIN before the tap where the no-PIN allowance does not cover the tidy", async () => {
    mockCashuCard = card({ tidyOffer: offer({ needsPin: true }) })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

    fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

    expect(screen.getByTestId("flashcard-v2-tidy-pin")).toBeTruthy()
    expect(mockRunCardOperation).not.toHaveBeenCalled()
    ;["1", "2", "3", "4"].forEach((digit) =>
      fireEvent.press(screen.getByTestId(`pin-${digit}`)),
    )
    fireEvent.press(screen.getByTestId("flashcard-v2-tidy-pin-submit"))

    await waitFor(() => expect(mockRunCardOperation).toHaveBeenCalledTimes(1))
  })

  it("lists a tidy still owed with Finish, and one kept for a human without", async () => {
    await Keychain.setInternetCredentials(
      TIDY_SERVER,
      "topups",
      JSON.stringify({
        format: 3,
        records: [saved("a", "signed"), saved("b", "needs-card")],
      }),
    )
    // An owed tidy holds back any new offer.
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()

    await waitFor(() =>
      expect(screen.getAllByTestId("flashcard-v2-unfinished-tidy")).toHaveLength(2),
    )
    expect(screen.getByText(LL.FlashcardV2.tidyInProgress())).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.tidyNeedsCard())).toBeTruthy()
    expect(screen.getAllByTestId("flashcard-v2-finish-tidy")).toHaveLength(1)
    // The one kept for a human has Dismiss instead.
    expect(screen.getAllByTestId("flashcard-v2-dismiss-tidy")).toHaveLength(1)
    expect(screen.queryByTestId("flashcard-v2-tidy-offer")).toBeNull()

    fireEvent.press(screen.getByTestId("flashcard-v2-finish-tidy"))
    await waitFor(() => expect(mockRunCardOperation).toHaveBeenCalledTimes(1))
  })

  it("still offers a tidy beside one kept for a human, and Dismiss takes that one off the screen", async () => {
    await Keychain.setInternetCredentials(
      TIDY_SERVER,
      "topups",
      JSON.stringify({ format: 3, records: [saved("b", "needs-card")] }),
    )
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()

    await waitFor(() =>
      expect(screen.getAllByTestId("flashcard-v2-unfinished-tidy")).toHaveLength(1),
    )
    expect(screen.getByTestId("flashcard-v2-tidy-offer")).toBeTruthy()

    fireEvent.press(screen.getByTestId("flashcard-v2-dismiss-tidy"))

    await waitFor(() =>
      expect(screen.queryByTestId("flashcard-v2-unfinished-tidy")).toBeNull(),
    )
    expect(screen.getByTestId("flashcard-v2-tidy-offer")).toBeTruthy()
    const archive = await Keychain.getInternetCredentials("flashcard-v2-tidy-archive")
    expect(JSON.parse(archive.password).records).toEqual([
      expect.objectContaining({ id: "b", state: "needs-card" }),
    ])
  })

  const outcomes: [string, unknown, () => string][] = [
    [
      "a skip for its openings",
      { status: "skipped", reason: "openings" },
      () => LL.FlashcardV2.tidyNothing(),
    ],
    [
      "a skip at its shape",
      { status: "skipped", reason: "at-target" },
      () => LL.FlashcardV2.tidyNothing(),
    ],
    [
      "a skip short of slots",
      { status: "skipped", reason: "slots" },
      () => LL.FlashcardV2.tidySlotsShort(),
    ],
    [
      "a saved tidy dropped unsigned",
      { status: "abandoned", record: {} },
      () => LL.FlashcardV2.tidyNothing(),
    ],
  ]
  it("says a card whose last payment could not be settled first is not tidied yet (ENG-820)", async () => {
    mockRunCardOperation.mockRejectedValue(new RelayUnsettledError({ kind: "failed" }))
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

    fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
        LL.FlashcardV2.relayPending(),
      ),
    )
    expect(screen.queryByText(LL.FlashcardV2.tidyFailed())).toBeNull()
  })

  outcomes.forEach(([what, result, text]) => {
    it(`says what ${what} means, never to try again`, async () => {
      mockRunCardOperation.mockResolvedValue(result)
      mockCashuCard = card({ tidyOffer: offer() })
      renderScreen()
      await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

      fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

      await waitFor(() =>
        expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
          text(),
        ),
      )
      expect(screen.queryByText(LL.FlashcardV2.tidyFailed())).toBeNull()
    })
  })

  /** The card refuses the tap for its PIN once, then the tap runs the tidy. */
  const pinNeededOnce = () => {
    mockRunTidy.mockResolvedValue({ status: "tidied", record: {} })
    mockRunCardOperation
      .mockRejectedValueOnce(new CardSpendError("pin-needed", 0x6a94, "SPEND_ALL_SIGN"))
      .mockImplementationOnce(async (op: (t: unknown) => unknown) => op(jest.fn()))
  }
  const enterPin = (digits: string) =>
    Array.from(digits).forEach((digit) =>
      fireEvent.press(screen.getByTestId(`pin-${digit}`)),
    )
  /** The PIN the second tap's tidy verifies on the card, as the card was asked. */
  const expectSecondTapVerifies = async (pin: string) => {
    await waitFor(() => expect(mockRunTidy).toHaveBeenCalledTimes(1))
    const [, args] = mockRunTidy.mock.calls[0]
    await args.verifyPin("transceive")
    expect(mockVerifyCardPin).toHaveBeenCalledWith("transceive", pin, expect.anything())
    return args
  }

  it("asks for the PIN when the card refuses the tidy for it, and taps again with that PIN", async () => {
    pinNeededOnce()
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

    fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy-pin")).toBeTruthy())
    expect(mockRunCardOperation).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(LL.FlashcardV2.tidyFailed())).toBeNull()
    enterPin("1234")
    fireEvent.press(screen.getByTestId("flashcard-v2-tidy-pin-submit"))

    await waitFor(() => expect(mockRunCardOperation).toHaveBeenCalledTimes(2))
    await expectSecondTapVerifies("1234")
    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
        LL.FlashcardV2.tidyDone(),
      ),
    )
  })

  it("asks for the PIN when the card refuses Finish on a tidy still owed, and finishes it with that PIN", async () => {
    await Keychain.setInternetCredentials(
      TIDY_SERVER,
      "topups",
      JSON.stringify({ format: 3, records: [saved("a", "signed")] }),
    )
    pinNeededOnce()
    mockCashuCard = card()
    renderScreen()
    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-finish-tidy")).toBeTruthy(),
    )

    fireEvent.press(screen.getByTestId("flashcard-v2-finish-tidy"))

    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy-pin")).toBeTruthy())
    enterPin("1234")
    fireEvent.press(screen.getByTestId("flashcard-v2-tidy-pin-submit"))

    await waitFor(() => expect(mockRunCardOperation).toHaveBeenCalledTimes(2))
    const args = await expectSecondTapVerifies("1234")
    // Still Finish after the PIN: no keyset a new tidy could plan in.
    expect(args.keysetId).toBeUndefined()
  })

  it("says how many tries are left when the card refuses the PIN", async () => {
    mockRunCardOperation.mockRejectedValue(new CardError(0x63c2, "VERIFY_PIN"))
    mockCashuCard = card({ tidyOffer: offer({ needsPin: true }) })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())
    fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))
    enterPin("1234")
    fireEvent.press(screen.getByTestId("flashcard-v2-tidy-pin-submit"))

    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
        LL.FlashcardV2.wrongPin({ tries: 2 }),
      ),
    )
    expect(screen.queryByText(LL.FlashcardV2.tidyFailed())).toBeNull()
  })

  it("says a tidy no retry can finish is for support, never to try again", async () => {
    mockRunCardOperation.mockRejectedValue(
      new TidyError("needs-card", "the mint refused this tidy's swap"),
    )
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

    fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
        LL.FlashcardV2.tidyNeedsCard(),
      ),
    )
    expect(screen.queryByText(LL.FlashcardV2.tidyFailed())).toBeNull()
  })

  it("says to try again only when the tap failed", async () => {
    mockRunCardOperation.mockRejectedValue(new Error("Tag was lost"))
    mockCashuCard = card({ tidyOffer: offer() })
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

    fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

    await waitFor(() =>
      expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
        LL.FlashcardV2.tidyFailed(),
      ),
    )
  })

  // ENG-706: while the tap runs, the screen says where the tidy has got to,
  // and to keep holding the card, until the tap settles.
  describe("progress", () => {
    /** A tap whose tidy reports making 3 of 7 and waits; `finish` settles it. */
    const tidyAtMaking = () => {
      let finish: (() => void) | undefined
      mockRunTidy.mockImplementation(
        (_deps: unknown, args: RunTidyArgs) =>
          new Promise((resolve) => {
            args.onProgress?.({ stage: "making", done: 3, total: 7 })
            finish = () => resolve({ status: "tidied", record: {} })
          }),
      )
      mockRunCardOperation.mockImplementation(
        async (op: (t: unknown, report: unknown) => unknown) => op(jest.fn(), jest.fn()),
      )
      return {
        finish: () =>
          act(async () => {
            finish?.()
          }),
      }
    }
    const expectMaking = () =>
      waitFor(() => {
        const block = screen.getByTestId("flashcard-v2-tidy-progress")
        expect(
          within(block).getByText(
            LL.FlashcardV2.tidyProgressMaking({ done: 3, total: 7 }),
          ),
        ).toBeTruthy()
        expect(within(block).getByText(LL.FlashcardV2.tidyKeepHolding())).toBeTruthy()
      })

    it("shows the stage and Keep holding while a tidy taps", async () => {
      tidyAtMaking()
      mockCashuCard = card({ tidyOffer: offer() })
      renderScreen()
      await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

      fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

      await expectMaking()
      expect(screen.queryByTestId("flashcard-v2-tidy-notice")).toBeNull()
    })

    it("shows it on Finish of a tidy still owed, with no offer on screen", async () => {
      await Keychain.setInternetCredentials(
        TIDY_SERVER,
        "topups",
        JSON.stringify({ format: 3, records: [saved("a", "signed")] }),
      )
      tidyAtMaking()
      mockCashuCard = card()
      renderScreen()
      await waitFor(() =>
        expect(screen.getByTestId("flashcard-v2-finish-tidy")).toBeTruthy(),
      )
      expect(screen.queryByTestId("flashcard-v2-tidy-offer")).toBeNull()

      fireEvent.press(screen.getByTestId("flashcard-v2-finish-tidy"))

      await expectMaking()
    })

    it("says nothing about the card until the tap reports a stage", async () => {
      // The tidy asks the mint, then waits for the card: no stage reported yet.
      let report: ((p: { stage: "reading" }) => void) | undefined
      let finish: (() => void) | undefined
      mockRunTidy.mockImplementation(
        (_deps: unknown, args: RunTidyArgs) =>
          new Promise((resolve) => {
            report = (p) => args.onProgress?.(p)
            finish = () => resolve({ status: "tidied", record: {} })
          }),
      )
      mockRunCardOperation.mockImplementation(
        async (op: (t: unknown, r: unknown) => unknown) => op(jest.fn(), jest.fn()),
      )
      mockCashuCard = card({ tidyOffer: offer() })
      renderScreen()
      await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())

      fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))

      await waitFor(() => expect(report).toBeDefined())
      expect(screen.queryByTestId("flashcard-v2-tidy-progress")).toBeNull()
      expect(screen.queryByText(LL.FlashcardV2.tidyProgressReading())).toBeNull()
      expect(screen.queryByText(LL.FlashcardV2.tidyKeepHolding())).toBeNull()
      expect(screen.queryByTestId("flashcard-v2-tidy-notice")).toBeNull()

      await act(async () => {
        report?.({ stage: "reading" })
      })
      await waitFor(() => {
        const block = screen.getByTestId("flashcard-v2-tidy-progress")
        expect(within(block).getByText(LL.FlashcardV2.tidyProgressReading())).toBeTruthy()
        expect(within(block).getByText(LL.FlashcardV2.tidyKeepHolding())).toBeTruthy()
      })

      await act(async () => {
        finish?.()
      })
      await waitFor(() =>
        expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
          LL.FlashcardV2.tidyDone(),
        ),
      )
      expect(screen.queryByTestId("flashcard-v2-tidy-progress")).toBeNull()
    })

    it("shows a spinner in Finish's place before a Finish tap reports a stage", async () => {
      // Finish on a tidy still owed: the tidy asks the mint before the sheet
      // opens, and no offer button is on screen to spin.
      await Keychain.setInternetCredentials(
        TIDY_SERVER,
        "topups",
        JSON.stringify({ format: 3, records: [saved("a", "signed")] }),
      )
      let finish: (() => void) | undefined
      mockRunTidy.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ status: "tidied", record: {} })
          }),
      )
      mockRunCardOperation.mockImplementation(
        async (op: (t: unknown, r: unknown) => unknown) => op(jest.fn(), jest.fn()),
      )
      mockCashuCard = card()
      renderScreen()
      await waitFor(() =>
        expect(screen.getByTestId("flashcard-v2-finish-tidy")).toBeTruthy(),
      )
      expect(screen.queryByTestId("flashcard-v2-finishing-tidy")).toBeNull()

      fireEvent.press(screen.getByTestId("flashcard-v2-finish-tidy"))

      await waitFor(() => expect(finish).toBeDefined())
      expect(screen.getByTestId("flashcard-v2-finishing-tidy")).toBeTruthy()
      expect(screen.queryByTestId("flashcard-v2-finish-tidy")).toBeNull()
      expect(screen.queryByTestId("flashcard-v2-tidy-progress")).toBeNull()

      await act(async () => {
        finish?.()
      })
      await waitFor(() =>
        expect(screen.getByTestId("flashcard-v2-tidy-notice")).toBeTruthy(),
      )
      expect(screen.queryByTestId("flashcard-v2-finishing-tidy")).toBeNull()
    })

    it("gives way to the result once the tap settles", async () => {
      const tap = tidyAtMaking()
      mockCashuCard = card({ tidyOffer: offer() })
      renderScreen()
      await waitFor(() => expect(screen.getByTestId("flashcard-v2-tidy")).toBeTruthy())
      fireEvent.press(screen.getByTestId("flashcard-v2-tidy"))
      await expectMaking()

      await tap.finish()

      await waitFor(() =>
        expect(screen.getByTestId("flashcard-v2-tidy-notice").props.children).toBe(
          LL.FlashcardV2.tidyDone(),
        ),
      )
      expect(screen.queryByTestId("flashcard-v2-tidy-progress")).toBeNull()
    })
  })
})

// ENG-787: the card names its mint, and Top up waits for a mint Flash funds.
describe("FlashcardV2Screen, the card's own mint", () => {
  const MINIBITS = "https://mint.minibits.cash/Bitcoin"
  const at = (mint: string, over: Partial<CashuCardState> = {}) =>
    card({ record: cardRecord({ mint }), ...over })
  const caption = () => screen.getByTestId("flashcard-v2-caption").props.children

  beforeEach(() => {
    mockIsAuthed = true
    mockCashuCardPreview = undefined
  })

  it("names forge as Flash on a recorded card's caption", () => {
    mockCashuCard = card()
    renderScreen()
    expect(caption()).toBe(
      LL.FlashcardV2.mintLine({ mint: isolatedMintName("https://forge.flashapp.me") }),
    )
    expect(caption()).toContain("Flash")
    expect(screen.getByTestId("flashcard-v2-action-topup")).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-mint-read-only")).toBeNull()
  })

  it("keeps the plain caption on a card never set up", () => {
    mockCashuCard = card({
      hasOwner: false,
      recordSet: false,
      record: cardRecord({ recordSet: false, mint: "" }),
    })
    renderScreen()
    expect(caption()).toBe(LL.FlashcardV2.onCardBalance())
  })

  describe("a card read without its record (ENG-826)", () => {
    const setUp = (status: "set-up" | "started", mint = MINIBITS) =>
      cardSetupSaved({
        v: 1,
        intent: {
          cardPubkey: PUBKEY,
          mint,
          unit: 0,
          refundKey: null,
          design: null,
          pinChosen: false,
        },
        progress: { pinSent: false, recordSent: true, ownerSent: status === "set-up" },
        status,
        heldByCard: { mint, unit: 0, refundKey: null, design: null },
        updatedAt: 1,
      })
    afterEach(() => {
      store.dispatch(resetFlashcardV2())
    })

    it("names the mint the card read back when this phone set it up", () => {
      store.dispatch(setUp("set-up"))
      mockCashuCard = card({ record: undefined })
      renderScreen()
      expect(caption()).toBe(
        LL.FlashcardV2.mintLine({ mint: isolatedMintName(MINIBITS) }),
      )
    })

    it("keeps the plain caption for a setup not finished, or with no record of one", () => {
      mockCashuCard = card({ record: undefined })
      const { unmount } = renderScreen()
      expect(caption()).toBe(LL.FlashcardV2.onCardBalance())
      unmount()
      store.dispatch(setUp("started"))
      renderScreen()
      expect(caption()).toBe(LL.FlashcardV2.onCardBalance())
    })

    it("ignores a setup record of a format it does not know (v other than 1)", () => {
      const record = setUp("set-up").payload
      store.dispatch(cardSetupSaved({ ...record, v: 2 } as unknown as typeof record))
      mockCashuCard = card({ record: undefined })
      renderScreen()
      expect(caption()).toBe(LL.FlashcardV2.onCardBalance())
    })

    it("the card's own record wins over the setup record", () => {
      store.dispatch(setUp("set-up"))
      mockCashuCard = card()
      renderScreen()
      expect(caption()).toBe(
        LL.FlashcardV2.mintLine({ mint: isolatedMintName("https://forge.flashapp.me") }),
      )
    })
  })

  // ENG-831: no fund list. A card at any mint this app can use is topped up
  // at that mint, with no read-only notice.
  it("a card at a mint Flash doesn't run: its name on the caption, Top up, and no read-only notice", () => {
    mockCashuCard = at(MINIBITS)
    renderScreen()
    expect(caption()).toBe(LL.FlashcardV2.mintLine({ mint: isolatedMintName(MINIBITS) }))
    expect(screen.getByTestId("flashcard-v2-action-topup")).toBeTruthy()
    expect(screen.queryByTestId("flashcard-v2-mint-read-only")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-balance-sat").props.children).toBe(
      "1,500 sats",
    )
    expect(screen.getByTestId("flashcard-v2-action-limits")).toBeTruthy()
  })

  it("a card whose mint can't be used: the plain caption, no Top up, and a severe notice", () => {
    mockCashuCard = at("http://mint.example")
    renderScreen()
    expect(caption()).toBe(LL.FlashcardV2.onCardBalance())
    expect(screen.queryByTestId("flashcard-v2-action-topup")).toBeNull()
    expect(screen.getByTestId("flashcard-v2-mint-invalid").props.accessibilityLabel).toBe(
      `${LL.FlashcardV2.cardMintInvalidTitle()}. ${LL.FlashcardV2.cardMintInvalidBody()}`,
    )
  })

  it("cardNotices: no read-only notice for a card at any usable mint (ENG-831)", () => {
    ;[MINIBITS, "https://mint.macadamia.cash", "https://forge.flashapp.me"].forEach(
      (mint) => {
        const given = cardNotices(at(mint), { ownership: "mine" }, LL).map(
          (n) => n.testID,
        )
        expect(given).not.toContain("flashcard-v2-mint-read-only")
        expect(given).not.toContain("flashcard-v2-mint-invalid")
      },
    )
  })
})

// ENG-827: "holder setup verified", and a setup this phone has to finish.
describe("FlashcardV2Screen, the holder setup (ENG-827)", () => {
  const LIMITS = { day: 5000, payment: 0, allowance: 0, rollBudget: 7 }
  const record = (
    over: Partial<CardSetup> = {},
    /** null for an ENG-826 record: no limits. */
    limits: CardSetup["intent"]["limits"] | null = LIMITS,
  ): CardSetup => ({
    v: 1,
    intent: {
      cardPubkey: PUBKEY,
      mint: "https://forge.flashapp.me",
      unit: 0,
      refundKey: null,
      design: null,
      pinChosen: true,
      ...(limits ? { limits } : {}),
    },
    progress: {
      pinSent: true,
      recordSent: true,
      ownerSent: true,
      limitsSent: true,
      verified: false,
    },
    status: "set-up",
    heldByCard: {
      mint: "https://forge.flashapp.me",
      unit: 0,
      refundKey: null,
      design: null,
    },
    updatedAt: 1,
    setUpAt: 1,
    ...over,
  })
  const verified = () =>
    record({
      progress: {
        pinSent: true,
        recordSent: true,
        ownerSent: true,
        limitsSent: true,
        verified: true,
      },
      verification: {
        at: 2,
        held: {
          mint: "https://forge.flashapp.me",
          unit: 0,
          refundKey: null,
          design: null,
          owner: true,
          ...LIMITS,
        },
      },
    })
  const neither = () => {
    expect(screen.queryByTestId("flashcard-v2-setup-verified")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-setup-unconfirmed")).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-action-finish")).toBeNull()
  }

  beforeEach(() => {
    mockIsAuthed = true
    mockCashuCardPreview = undefined
    mockNavigate.mockClear()
  })
  afterEach(() => {
    store.dispatch(resetFlashcardV2())
  })

  it("a verified setup of this phone's says so in one line under the mint, with a fuller label", () => {
    store.dispatch(cardSetupSaved(verified()))
    mockCashuCard = card()
    renderScreen()
    const line = screen.getByTestId("flashcard-v2-setup-verified")
    expect(line.props.children).toBe(LL.FlashcardV2.setUpVerifiedLine())
    expect(line.props.accessibilityLabel).toBe(LL.FlashcardV2.setUpVerifiedLabel())
    expect(screen.queryByTestId("flashcard-v2-action-finish")).toBeNull()
  })

  it("a setup not verified says what the card has not confirmed, and Finish setup opens setup", () => {
    store.dispatch(cardSetupSaved(record({ unconfirmed: ["dailyLimit", "rollBudget"] })))
    mockCashuCard = card()
    renderScreen()
    expect(screen.getByTestId("flashcard-v2-setup-unconfirmed").props.children).toBe(
      LL.FlashcardV2.setUpUnconfirmed({ what: LL.FlashcardV2.setUpFieldLimits() }),
    )
    fireEvent.press(screen.getByTestId("flashcard-v2-action-finish"))
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2Setup")
    expect(screen.queryByTestId("flashcard-v2-setup-verified")).toBeNull()
  })

  it("a funded setup not verified still offers Finish setup next to Top up", () => {
    // Topped up after a tap cut past SET_OWNER: the owner's finish needs no
    // empty card (spec/APDU.md SET_LIMIT: "no PIN, any funds").
    store.dispatch(cardSetupSaved(record({ unconfirmed: ["dailyLimit"] })))
    mockCashuCard = card({ unspent: 2, balance: 10 })
    renderScreen()
    expect(screen.getByTestId("flashcard-v2-setup-unconfirmed")).toBeTruthy()
    expect(screen.getByTestId("flashcard-v2-action-finish")).toBeTruthy()
    expect(screen.getByTestId("flashcard-v2-action-topup")).toBeTruthy()
  })

  it("limits changed elsewhere say to check Limits, with no Finish setup: no tap finishes it", () => {
    store.dispatch(
      cardSetupSaved(
        record({
          unconfirmed: ["dailyLimit", "paymentLimit", "allowance", "rollBudget"],
          limitsChangedElsewhere: true,
        }),
      ),
    )
    mockCashuCard = card()
    renderScreen()
    expect(screen.getByTestId("flashcard-v2-setup-limits-differ").props.children).toBe(
      LL.FlashcardV2.setUpLimitsDiffer(),
    )
    neither()
  })

  it("limits changed elsewhere stop being said once the holder saves limits under Limits", () => {
    store.dispatch(
      cardSetupSaved(
        record({
          unconfirmed: ["dailyLimit", "paymentLimit", "allowance", "rollBudget"],
          limitsChangedElsewhere: true,
        }),
      ),
    )
    mockCashuCard = card()
    renderScreen()
    expect(screen.getByTestId("flashcard-v2-setup-limits-differ")).toBeTruthy()
    // What the Limits screen dispatches when the owner's SET_LIMIT goes through.
    act(() => {
      store.dispatch(
        cardLimitsSet({
          pubkey: PUBKEY,
          limits: { day: 2000, payment: 0, allowance: 0, rollBudget: 7 },
        }),
      )
    })
    expect(screen.queryByTestId("flashcard-v2-setup-limits-differ")).toBeNull()
    neither()
  })

  it("a setup not verified with nothing named says every part", () => {
    store.dispatch(cardSetupSaved(record()))
    mockCashuCard = card()
    renderScreen()
    expect(screen.getByTestId("flashcard-v2-setup-unconfirmed").props.children).toBe(
      LL.FlashcardV2.setUpUnconfirmed({
        what: [
          LL.FlashcardV2.setUpFieldOwner(),
          LL.FlashcardV2.setUpFieldLimits(),
          LL.FlashcardV2.setUpFieldMint(),
          LL.FlashcardV2.setUpFieldRecord(),
        ].join(", "),
      }),
    )
  })

  it("an owned card with no setup record says neither: verification is never read off the owner flag", () => {
    mockCashuCard = card()
    renderScreen()
    neither()
  })

  it("an ENG-826 record (no limits) says neither", () => {
    store.dispatch(cardSetupSaved(record({}, null)))
    mockCashuCard = card()
    renderScreen()
    neither()
  })

  it("another phone's card says neither, verified record or not", () => {
    store.dispatch(cardSetupSaved(verified()))
    mockCashuCard = othersCard()
    const { unmount } = renderScreen()
    neither()
    unmount()
    store.dispatch(cardSetupSaved(record()))
    renderScreen()
    neither()
  })
})

// ENG-830: a card exactly as the provisioner left it gets awaiting-holder
// wording in the existing "isn't set up" notice; nothing else changes.
describe("FlashcardV2Screen, a card awaiting its holder (ENG-830)", () => {
  const ownerless = {
    hasOwner: false,
    pinState: "unset" as const,
    locked: false,
    record: cardRecord({ recordSet: false, mint: "", design: null }),
  }
  /** A 2.2 card exactly as the provisioner leaves it. */
  const awaiting = (overrides: Partial<CashuCardState> = {}) =>
    card({
      version: "2.2",
      major: 2,
      minor: 2,
      hasOwner: false,
      recordSet: false,
      pinState: "unset",
      unspent: 0,
      spent: 0,
      empty: 128,
      balance: 0,
      keysets: [],
      unitTotals: undefined,
      record: cardRecord({ recordSet: false, mint: "", design: null }),
      ownerKeySource: undefined,
      ...overrides,
    })
  const stored = (status: CardSetup["status"], v = 1): CardSetup =>
    ({
      v,
      intent: {
        cardPubkey: PUBKEY,
        mint: "https://mint.test",
        unit: 0,
        refundKey: null,
        design: null,
        pinChosen: false,
      },
      progress: {
        pinSent: false,
        recordSent: false,
        ownerSent: false,
        limitsSent: false,
        verified: false,
      },
      status,
      updatedAt: 1,
    } as CardSetup)
  const notice = () => screen.getByTestId("flashcard-v2-not-set-up")
  const awaitingLabel = `${LL.FlashcardV2.notSetUpTitle()}. ${LL.FlashcardV2.notSetUpAwaitingBody()}`
  const plainLabel = `${LL.FlashcardV2.notSetUpTitle()}. ${LL.FlashcardV2.notSetUpBody()}`

  beforeEach(() => {
    mockIsAuthed = true
    mockCashuCardPreview = undefined
  })
  afterEach(() => {
    store.dispatch(resetFlashcardV2())
  })

  it("cardNotices: the same notices in the same order, the not-set-up body reworded only when awaiting", () => {
    const of = (awaitingHolder?: boolean) =>
      cardNotices(ownerless, { ownership: "none", awaitingHolder }, LL)
    const ids = ["flashcard-v2-not-set-up", "flashcard-v2-no-pin"]
    expect(of(true).map((n) => n.testID)).toEqual(ids)
    expect(of(false).map((n) => n.testID)).toEqual(ids)
    expect(of(undefined).map((n) => n.testID)).toEqual(ids)
    expect(of(true)[0]).toMatchObject({
      title: LL.FlashcardV2.notSetUpTitle(),
      body: LL.FlashcardV2.notSetUpAwaitingBody(),
    })
    expect(of(false)[0].body).toBe(LL.FlashcardV2.notSetUpBody())
    expect(of(undefined)[0].body).toBe(LL.FlashcardV2.notSetUpBody())
  })

  it("an awaiting card's notice says it is waiting for its holder, labelled with those words, and Set up is offered", () => {
    mockCashuCard = awaiting()
    renderScreen()
    expect(notice().props.accessibilityLabel).toBe(awaitingLabel)
    expect(screen.getByText(LL.FlashcardV2.notSetUpAwaitingBody())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.notSetUpBody())).toBeNull()
    expect(screen.getByTestId("flashcard-v2-action-setup")).toBeTruthy()
  })

  it("signed out, an awaiting card keeps the old body, since Set up is not on the screen", () => {
    mockIsAuthed = false
    mockCashuCard = awaiting()
    renderScreen()
    expect(notice().props.accessibilityLabel).toBe(plainLabel)
    expect(screen.getByText(LL.FlashcardV2.notSetUpBody())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.notSetUpAwaitingBody())).toBeNull()
    expect(screen.queryByTestId("flashcard-v2-action-setup")).toBeNull()
  })

  // forEach rather than it.each: the global `it` is typed without .each here.
  const plainCards: [string, Partial<CashuCardState>][] = [
    ["funded", { unspent: 2, balance: 10 }],
    ["with a record set", { recordSet: true, record: cardRecord({ design: null }) }],
    ["of version 2.0", { version: "2.0", major: 2, minor: 0 }],
  ]
  plainCards.forEach(([label, overrides]) => {
    it(`an ownerless card ${label} keeps the old body`, () => {
      mockCashuCard = awaiting(overrides)
      renderScreen()
      expect(notice().props.accessibilityLabel).toBe(plainLabel)
      expect(screen.queryByText(LL.FlashcardV2.notSetUpAwaitingBody())).toBeNull()
    })
  })

  it("an owned card shows no not-set-up notice at all", () => {
    mockCashuCard = awaiting({ hasOwner: true, ownerKeySource: "seed" })
    renderScreen()
    expect(screen.queryByTestId("flashcard-v2-not-set-up")).toBeNull()
    expect(screen.queryByText(LL.FlashcardV2.notSetUpAwaitingBody())).toBeNull()
  })

  const storedRecords: [string, CardSetup][] = [
    ["started", stored("started")],
    ["mismatched", stored("mismatched")],
    ["set-up", stored("set-up")],
    ["of a foreign format", stored("started", 2)],
  ]
  storedRecords.forEach(([label, record]) => {
    it(`a stored setup record ${label} for the card keeps the old body`, () => {
      store.dispatch(cardSetupSaved(record))
      mockCashuCard = awaiting()
      renderScreen()
      expect(notice().props.accessibilityLabel).toBe(plainLabel)
      expect(screen.queryByText(LL.FlashcardV2.notSetUpAwaitingBody())).toBeNull()
    })
  })
})
