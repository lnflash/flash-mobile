/**
 * ENG-609, the conditional half.
 *
 * `dark-screen-status-bar.spec.tsx` covers the screens whose tint is a constant.
 * These three are the ones whose tint *changes with the theme*: they paint
 * `accent02`, which is a dark green (#007856) in the light palette and a light
 * one (#02c48d) in the dark palette, so the tint has to flip the opposite way
 * from the theme mode — light icons in light mode, dark icons in dark mode.
 *
 * That was hand-derived at each call site and covered by nothing: invert the
 * condition and the whole suite stayed green, while dark-mode users got white
 * icons at 2.26:1 over #02c48d — the ENG-609 symptom. The tint now comes from
 * `statusBarTintFor`, whose own rule is unit-tested in
 * `__tests__/utils/status-bar-tint.spec.ts`; this spec pins that each screen
 * actually asks for it, in both modes.
 */
import * as React from "react"
import { StatusBar } from "react-native"
import { createTheme, ThemeMode, ThemeProvider } from "@rneui/themed"
import { render, RenderAPI } from "@testing-library/react-native"

import appTheme from "../../app/rne-theme/theme"
import { dark, light } from "../../app/rne-theme/colors"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

import CashoutSuccess from "../../app/screens/topup-cashout-flow/CashoutSuccess"
import InviteFriendSuccess from "../../app/screens/invite-friend/InviteFriendSuccess"
import SendBitcoinSuccessScreen from "../../app/screens/send-bitcoin-screen/send-bitcoin-success-screen"

loadLocale("en")

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))

// Spread the real module so `NavigationContext` is the real context object rather
// than `undefined`. These specs mount no navigator, so `Screen` still takes the
// unscoped branch; the focus-scoped branch is driven against a real stack
// navigator in __tests__/components/screen-status-bar-focus.spec.tsx (ENG-609).
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() }),
}))
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  }
})

// --- SendBitcoinSuccessScreen -----------------------------------------------
// The reanimated entering animations need worklet setup jest does not have.
jest.mock("@app/components/success-animation", () => {
  const react = jest.requireActual("react")
  return {
    SuccessIconAnimation: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
    SuccessTextAnimation: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
  }
})
jest.mock("@apollo/client", () => ({
  ...jest.requireActual("@apollo/client"),
  useApolloClient: () => ({}),
}))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useFeedbackModalShownQuery: () => ({ data: { feedbackModalShown: true } }),
}))
jest.mock("@app/hooks", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: () => "$1.00",
    getSecondaryAmountIfCurrencyIsDifferent: () => undefined,
  }),
  usePriceConversion: () => ({
    convertMoneyAmount: (moneyAmount: unknown) => moneyAmount,
  }),
}))
jest.mock("@react-native-firebase/crashlytics", () => ({
  getCrashlytics: () => ({}),
}))
// The feedback modal runs a real Apollo mutation hook, which needs a client this
// spec has no reason to stand up. It is closed on mount anyway.
jest.mock("../../app/screens/send-bitcoin-screen/suggestion-modal", () => ({
  SuggestionModal: () => null,
}))

const en = i18nObject("en")

const inMode = (mode: ThemeMode, node: React.ReactElement) =>
  render(
    <ThemeProvider
      theme={createTheme({
        mode,
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      {node}
    </ThemeProvider>,
  )

/**
 * React Native merges the mounted StatusBar stack per prop, last entry wins, so
 * read the entry this tree contributes rather than asserting on every entry.
 */
const tintsDeclaredBy = (tree: RenderAPI) =>
  tree
    .UNSAFE_getAllByType(StatusBar)
    .map((node) => node.props.barStyle)
    .filter(Boolean)

const navigation = () =>
  ({
    navigate: jest.fn(),
    push: jest.fn(),
    popToTop: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
    setOptions: jest.fn(),
  } as never)

const screens: [string, () => React.ReactElement][] = [
  [
    "SendBitcoinSuccess",
    () => (
      <SendBitcoinSuccessScreen
        navigation={navigation()}
        route={
          {
            key: "r",
            name: "sendBitcoinSuccess",
            // A zero amount skips the amount block, which has its own concerns;
            // this spec is about the Screen wrapper.
            params: {
              walletCurrency: "BTC",
              unitOfAccountAmount: { amount: 0, currency: "BTC" },
            },
          } as never
        }
      />
    ),
  ],
  [
    "CashoutSuccess",
    () => <CashoutSuccess navigation={navigation()} route={{} as never} />,
  ],
  [
    "InviteFriendSuccess",
    () => (
      <InviteFriendSuccess
        navigation={navigation()}
        route={
          { key: "r", name: "InviteFriendSuccess", params: { contact: "Ada" } } as never
        }
      />
    ),
  ],
]

describe("accent02 success screens tint the status bar for the field, not the mode", () => {
  it("accent02 really does flip across the two palettes", () => {
    // The premise of every assertion below. If these ever converge, the
    // expectations stop testing anything and this is the line that says so.
    expect(light.accent02).toBe("#007856")
    expect(dark.accent02).toBe("#02c48d")
  })

  screens.forEach(([name, element]) => {
    it(`${name}: light icons over the dark-green light-theme field`, () => {
      // Inverting the old ternary would have made this "dark-content" and left
      // black icons at 3.6:1 over #007856.
      expect(tintsDeclaredBy(inMode("light", element()))).toContain("light-content")
    })

    it(`${name}: dark icons over the light-green dark-theme field`, () => {
      // This is the one the missing coverage hid: white icons here are 2.26:1
      // over #02c48d.
      const tints = tintsDeclaredBy(inMode("dark", element()))

      expect(tints).toContain("dark-content")
      expect(tints).not.toContain("light-content")
    })
  })

  it("renders the success copy, i.e. the assertions above are on a real screen", () => {
    expect(inMode("light", screens[1][1]()).getByText(en.Cashout.success())).toBeTruthy()
    expect(
      inMode("light", screens[2][1]()).getByText(
        en.InviteFriend.invitationSuccessTitle({ value: "Ada" }),
      ),
    ).toBeTruthy()
  })
})
