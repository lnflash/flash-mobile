/**
 * ENG-616: every control in the app that asks for a card tap goes through
 * `useTapFlashcard`, which opens the screen for whatever was tapped, and the
 * two "open my card" entry points go through `useOpenFlashcard`. One spec per
 * call site: a control wired back to a raw `readFlashcard` (the bug this
 * replaces: a Cashu card tapped anywhere but Settings opened nothing) fails
 * here, and so does the Home tile's sync if it stops refreshing a BoltCard in
 * place. The FlashcardV2 refresh is pinned in flashcard-v2.spec.tsx, the
 * routing itself in use-tap-flashcard.spec.tsx.
 */
import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import type { TapFlashcardOptions } from "../../app/hooks/use-tap-flashcard"
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

jest.mock("@app/hooks", () => ({
  useTapFlashcard: (options?: TapFlashcardOptions) => () => mockTapFlashcard(options),
  useOpenFlashcard: () => mockOpenFlashcard,
  // A linked BoltCard, so the Home tile renders. `readFlashcard` is here only
  // so a call site that still used it would be caught calling it.
  useFlashcard: () => ({
    lnurl: "lnurl1CARD",
    balanceInSats: 1234,
    transactions: [],
    readFlashcard: mockReadFlashcard,
    resetFlashcard: jest.fn(),
  }),
  useBreez: () => ({ btcWallet: { balance: 0 } }),
  // No Cashu card remembered: only the BoltCard tile renders.
  useKnownCashuCard: () => undefined,
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
  useNavigation: () => ({ navigate: jest.fn() }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("../../app/screens/get-started-screen/device-account-fail-modal", () => ({
  DeviceAccountFailModal: () => null,
}))
// The Home tiles, reduced to their two touch targets so each can be pressed.
jest.mock("@app/components/cards", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactActual = require("react")
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TouchableOpacity } = require("react-native")
  type TileProps = { title: string; onPress: () => void; onPressRightBtn?: () => void }
  return {
    Balance: ({ title, onPress, onPressRightBtn }: TileProps) =>
      ReactActual.createElement(
        ReactActual.Fragment,
        null,
        ReactActual.createElement(TouchableOpacity, { testID: `${title}-tile`, onPress }),
        onPressRightBtn
          ? ReactActual.createElement(TouchableOpacity, {
              testID: `${title}-right`,
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
 */
const expectTapped = (options?: TapFlashcardOptions) => {
  expect(mockTapFlashcard).toHaveBeenCalledTimes(1)
  expect(mockTapFlashcard).toHaveBeenCalledWith(options)
  expect(mockOpenFlashcard).not.toHaveBeenCalled()
  expect(mockReadFlashcard).not.toHaveBeenCalled()
}

const expectOpened = () => {
  expect(mockOpenFlashcard).toHaveBeenCalledTimes(1)
  expect(mockTapFlashcard).not.toHaveBeenCalled()
  expect(mockReadFlashcard).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
})

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
    renderInTheme(<Flashcard onReload={jest.fn()} onTopup={jest.fn()} />)

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
    renderInTheme(<Flashcard onReload={jest.fn()} onTopup={jest.fn()} />)

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
