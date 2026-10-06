/**
 * ENG-616: every control in the app that asks for a card tap goes through
 * `useTapFlashcard`, which opens the screen for whatever was tapped, and the
 * two "open my card" entry points go through `useOpenFlashcard`. One spec per
 * call site: a control wired back to a raw `readFlashcard` (the bug this
 * replaces: a Cashu card tapped anywhere but Settings opened nothing) fails
 * here, and so does the Home tile's sync if it stops refreshing a BoltCard in
 * place, and the Home Cashu row's sync if it opens the card read this session
 * instead of asking for a tap. The FlashcardV2 refresh is pinned in
 * flashcard-v2.spec.tsx, the routing itself in use-tap-flashcard.spec.tsx.
 */
import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import type { TapFlashcardOptions } from "../../app/hooks/use-tap-flashcard"
import type { KnownCard } from "../../app/store/redux/slices/flashcardV2Slice"
import { EmptyCard, Flashcard } from "../../app/components/card"
import WalletOverview from "../../app/components/wallet-overview/wallet-overview"
import { GetStartedScreen } from "../../app/screens/get-started-screen/get-started-screen"
import { AccountFlashcard } from "../../app/screens/settings-screen/settings/account-flashcard"

loadLocale("en")
const LL = i18nObject("en")

/** Called with the options the call site passed to `useTapFlashcard`. */
const mockTapFlashcard = jest.fn(async (_options?: TapFlashcardOptions) => ({}))
const mockOpenFlashcard = jest.fn(async () => {})
const mockReadFlashcard = jest.fn(async () => ({}))
/** Navigation by the call site itself, outside the tap and open hooks above. */
const mockNavigate = jest.fn()
/** The Cashu card attached to the app; a test that needs the Home row sets it. */
let mockAttachedCard: KnownCard | undefined
/** The Cashu card read this session; a test that needs one sets it. */
let mockSessionCard: { pubkey: string } | undefined

jest.mock("@app/hooks", () => ({
  useTapFlashcard: (options?: TapFlashcardOptions) => () => mockTapFlashcard(options),
  useOpenFlashcard: () => mockOpenFlashcard,
  // A linked BoltCard, so the Home tile renders, and no Cashu card read this
  // session unless a test reads one. `readFlashcard` is here only so a call
  // site that still used it would be caught calling it.
  useFlashcard: () => ({
    lnurl: "lnurl1CARD",
    balanceInSats: 1234,
    transactions: [],
    cashuCard: mockSessionCard,
    readFlashcard: mockReadFlashcard,
    resetFlashcard: jest.fn(),
  }),
  useBreez: () => ({ btcWallet: { balance: 0 } }),
  // No Cashu card attached unless a test attaches one: only the BoltCard tile
  // renders.
  useAttachedCashuCard: () => mockAttachedCard,
  useDisplayCurrency: () => ({ formatMoneyAmount: () => "$1.00" }),
  usePriceConversion: () => ({ convertMoneyAmount: (amount: unknown) => amount }),
  useUnauthedPriceConversion: () => ({ convertMoneyAmount: (amount: unknown) => amount }),
  useActivityIndicator: () => ({ toggleActivityIndicator: jest.fn() }),
  useAppConfig: () => ({ saveToken: jest.fn() }),
}))
jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: () => "$1.00",
    displayCurrency: "USD",
    moneyAmountToDisplayCurrencyString: () => "$1.00",
  }),
}))
jest.mock("@app/hooks/useCreateAccount", () => ({
  useCreateAccount: () => ({
    createDeviceAccountAndLogin: jest.fn(),
    appcheckTokenLoading: false,
  }),
}))
jest.mock("@app/utils/analytics", () => ({ logGetStartedAction: jest.fn() }))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    persistentState: { isAdvanceMode: false, cardDisplayBalance: "$5.00" },
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("../../app/screens/get-started-screen/device-account-fail-modal", () => ({
  DeviceAccountFailModal: () => null,
}))
// The Home tiles, reduced to their two touch targets so each can be pressed.
// Keyed on the tile's own test id where it has one: the BoltCard tile and the
// Cashu card row are both titled Flashcard.
jest.mock("@app/components/cards", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactActual = require("react")
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TouchableOpacity } = require("react-native")
  type TileProps = {
    title: string
    testID?: string
    onPress: () => void
    onPressRightBtn?: () => void
  }
  return {
    Balance: ({ title, testID, onPress, onPressRightBtn }: TileProps) =>
      ReactActual.createElement(
        ReactActual.Fragment,
        null,
        ReactActual.createElement(TouchableOpacity, {
          testID: `${testID ?? title}-tile`,
          onPress,
        }),
        onPressRightBtn
          ? ReactActual.createElement(TouchableOpacity, {
              testID: `${testID ?? title}-right`,
              onPress: onPressRightBtn,
            })
          : null,
      ),
  }
})

const renderInTheme = (element: React.ReactElement) =>
  render(
    <ThemeProvider
      theme={createTheme({
        mode: "light",
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      {element}
    </ThemeProvider>,
  )

/**
 * One routed tap. `options` is what the call site must pass: none means a
 * BoltCard opens Card, `{ openBoltCard: false }` means it refreshes in place.
 * The call site itself navigates nowhere: what was tapped decides the screen.
 */
const expectTapped = (options?: TapFlashcardOptions) => {
  expect(mockTapFlashcard).toHaveBeenCalledTimes(1)
  expect(mockTapFlashcard).toHaveBeenCalledWith(options)
  expect(mockOpenFlashcard).not.toHaveBeenCalled()
  expect(mockReadFlashcard).not.toHaveBeenCalled()
  expect(mockNavigate).not.toHaveBeenCalled()
}

const expectOpened = () => {
  expect(mockOpenFlashcard).toHaveBeenCalledTimes(1)
  expect(mockTapFlashcard).not.toHaveBeenCalled()
  expect(mockReadFlashcard).not.toHaveBeenCalled()
  expect(mockNavigate).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAttachedCard = undefined
  mockSessionCard = undefined
})

/** The Cashu card a test attaches, and reads this session when it needs to. */
const cashuPubkey = "02" + "51".repeat(32)

const attachCashuCard = () => {
  mockAttachedCard = {
    pubkey: cashuPubkey,
    version: "0.4",
    pinState: "unset",
    lastBalance: 1289,
    lastSeenAt: 1_000,
    unit: "sat",
  }
}

describe("card tap call sites", () => {
  it("Get Started, the signed-out landing: the NFC icon routes the tap", () => {
    const props = {
      navigation: { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn() },
      route: { key: "getStarted", name: "getStarted" },
    } as unknown as React.ComponentProps<typeof GetStartedScreen>
    renderInTheme(<GetStartedScreen {...props} />)

    fireEvent.press(screen.getByTestId("get-started-read-card"))

    expectTapped()
  })

  it("Card, no card yet: Read NFC card routes the tap", () => {
    renderInTheme(<EmptyCard />)

    fireEvent.press(screen.getByText(LL.CardScreen.readNfcCard()))

    expectTapped()
  })

  it("Card, a BoltCard shown: its refresh routes the tap, so a Cashu card opens its own screen", () => {
    renderInTheme(
      <Flashcard onReload={jest.fn()} onTopup={jest.fn()} onRemove={jest.fn()} />,
    )

    fireEvent.press(screen.getByTestId("flashcard-refresh"))

    expectTapped()
  })

  it("Home: the Flashcard tile's sync refreshes a BoltCard in place, and routes a Cashu card", () => {
    // On main this re-read the card and updated the tile without leaving
    // Home; the tile body is what opens Card.
    renderInTheme(<WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />)

    fireEvent.press(screen.getByTestId(`${LL.HomeScreen.flashcard()}-right`))

    expectTapped({ openBoltCard: false })
  })

  it("Home: the Flashcard tile opens by the shared entry-point rule", () => {
    renderInTheme(<WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />)

    fireEvent.press(screen.getByTestId(`${LL.HomeScreen.flashcard()}-tile`))

    expectOpened()
  })

  // The Cashu card row: with no card read this session, both its controls ask
  // for a tap that opens the screen for whatever was tapped. A BoltCard tapped
  // here opens Card; a refresh-in-place tap would leave the user on Home.
  it("Home: the Cashu card row, no card read this session, routes the tap from its body", () => {
    attachCashuCard()
    renderInTheme(<WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />)

    fireEvent.press(screen.getByTestId("home-cashu-card-tile"))

    expectTapped()
  })

  it("Home: the Cashu card row's sync routes the tap", () => {
    attachCashuCard()
    renderInTheme(<WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />)

    fireEvent.press(screen.getByTestId("home-cashu-card-right"))

    expectTapped()
  })

  // With a card read this session the two controls part: the body opens that
  // read without a tap, and the sync still asks for one. Opening the session's
  // read would show the balance it held then, stale after a spend at a till.
  // The body test also proves the session's read reaches the row, so the sync
  // test cannot pass for want of one.
  it("Home: the Cashu card row's body opens the card read this session without a tap", () => {
    attachCashuCard()
    mockSessionCard = { pubkey: cashuPubkey }
    renderInTheme(<WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />)

    fireEvent.press(screen.getByTestId("home-cashu-card-tile"))

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2")
    expect(mockTapFlashcard).not.toHaveBeenCalled()
    expect(mockOpenFlashcard).not.toHaveBeenCalled()
    expect(mockReadFlashcard).not.toHaveBeenCalled()
  })

  it("Home: the Cashu card row's sync routes the tap even with a card read this session", () => {
    attachCashuCard()
    mockSessionCard = { pubkey: cashuPubkey }
    renderInTheme(<WalletOverview setIsUnverifiedSeedModalVisible={jest.fn()} />)

    fireEvent.press(screen.getByTestId("home-cashu-card-right"))

    expectTapped()
  })

  it("Settings: the Flashcard row opens by the same rule as the Home tile", () => {
    renderInTheme(<AccountFlashcard />)

    fireEvent.press(screen.getByTestId(LL.SettingsScreen.flashcard()))

    expectOpened()
  })
})

describe("icon-only read controls a screen reader can name", () => {
  // A test id must not double as the accessibility label: the control would
  // be announced as "flashcard-refresh".
  it("Card: the BoltCard refresh is a button labelled as a card read", () => {
    renderInTheme(
      <Flashcard onReload={jest.fn()} onTopup={jest.fn()} onRemove={jest.fn()} />,
    )

    const refresh = screen.getByTestId("flashcard-refresh")

    expect(refresh.props.accessibilityRole).toBe("button")
    expect(refresh.props.accessibilityLabel).toBe(LL.CardScreen.readNfcCard())
  })

  it("Get Started: the NFC icon is a button labelled as a card read", () => {
    const props = {
      navigation: { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn() },
      route: { key: "getStarted", name: "getStarted" },
    } as unknown as React.ComponentProps<typeof GetStartedScreen>
    const { unmount } = renderInTheme(<GetStartedScreen {...props} />)

    const readCard = screen.getByTestId("get-started-read-card")

    expect(readCard.props.accessibilityRole).toBe("button")
    expect(readCard.props.accessibilityLabel).toBe(LL.CardScreen.readNfcCard())
    // The icon pulses on a timer; stop it before the test ends so no frame
    // lands outside act().
    unmount()
  })
})
