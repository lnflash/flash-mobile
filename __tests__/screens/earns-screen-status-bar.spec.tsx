/**
 * ENG-609, the earns flow.
 *
 * Every screen in this flow paints a full-bleed field that is the *same colour
 * in both palettes* — _orange #FF7e1c, _gold #fff200, _lighterGrey #E6EBEf,
 * _sky #C3CCFF — so the themed default is wrong for all of them in dark mode:
 * it hands them `light-content`, i.e. white icons at 1.1:1 to 2.5:1 over a light
 * field, with no opaque band left to hide it under Android 15+ edge-to-edge.
 *
 * `earns-map-screen` and `earns-section` were caught in the first sweep;
 * `section-completed` and `earns-quiz` were missed, because nothing asserted the
 * flow as a whole. This spec does, so the next screen added here is either
 * covered or visibly absent.
 */
import * as React from "react"
import { StatusBar } from "react-native"
import { createTheme, ThemeMode, ThemeProvider } from "@rneui/themed"
import { MockedProvider } from "@apollo/client/testing"
import { fireEvent, render, RenderAPI } from "@testing-library/react-native"

import appTheme from "../../app/rne-theme/theme"
import { dark, light } from "../../app/rne-theme/colors"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

import { SectionCompleted } from "../../app/screens/earns-screen/section-completed"
import { EarnQuiz } from "../../app/screens/earns-screen/earns-quiz"
import { EarnSection } from "../../app/screens/earns-screen/earns-section"

loadLocale("en")

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
// Spread the real module so `NavigationContext` is the real context object rather
// than `undefined`. This spec mounts no navigator, so `Screen` still takes the
// unscoped branch; the focus-scoped branch is driven against a real stack
// navigator in __tests__/components/screen-status-bar-focus.spec.tsx (ENG-609).
// `useIsFocused` is stubbed for `earns-section` itself, which calls it directly
// (earns-section.tsx) and would throw outside a navigator — not for `Screen`.
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useIsFocused: () => true,
}))
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  }
})
// Hits real Apollo query hooks; the quiz payload is not what this spec is about.
jest.mock("../../app/screens/earns-map-screen/use-quiz-server", () => ({
  useQuizServer: () => ({ quizServerData: [], loading: false }),
}))
// The carousel needs reanimated worklets; flatten it to its first card.
jest.mock("react-native-reanimated-carousel", () => {
  const react = jest.requireActual("react")
  return {
    __esModule: true,
    default: ({
      data,
      renderItem,
    }: {
      data: unknown[]
      renderItem: (arg: { item: unknown; index: number }) => React.ReactNode
    }) =>
      react.createElement(
        react.Fragment,
        null,
        data.length ? renderItem({ item: data[0], index: 0 }) : null,
      ),
  }
})

// EarnQuiz reaches for a mutation hook on mount; MockedProvider satisfies every
// Apollo hook in the flow without this spec having to enumerate them.
const inMode = (mode: ThemeMode, node: React.ReactElement) =>
  render(
    <MockedProvider mocks={[]} addTypename={false}>
      <ThemeProvider
        theme={createTheme({
          mode,
          lightColors: appTheme.lightColors,
          darkColors: appTheme.darkColors,
        })}
      >
        {node}
      </ThemeProvider>
    </MockedProvider>,
  )

const tintsDeclaredBy = (tree: RenderAPI) =>
  tree
    .UNSAFE_getAllByType(StatusBar)
    .map((node) => node.props.barStyle)
    .filter(Boolean)

const screens: [string, () => React.ReactElement][] = [
  [
    "SectionCompleted",
    () => (
      <SectionCompleted
        route={
          {
            key: "r",
            name: "sectionCompleted",
            params: { amount: 100, sectionTitle: "Bitcoin what is it?" },
          } as never
        }
      />
    ),
  ],
  [
    "EarnQuiz",
    () => (
      <EarnQuiz
        route={{ key: "r", name: "earnsQuiz", params: { id: "whatIsBitcoin" } } as never}
      />
    ),
  ],
  [
    "EarnSection",
    () => (
      <EarnSection
        route={
          {
            key: "r",
            name: "earnsSection",
            params: { section: "bitcoinWhatIsIt" },
          } as never
        }
      />
    ),
  ],
]

describe("the earns flow tints the status bar for its field, in both themes", () => {
  it("the fields really are palette-independent", () => {
    // If a palette ever gives one of these a dark value, the dark-mode
    // expectations below stop being right and this is the line that says so.
    ;(["_orange", "_gold", "_lighterGrey", "_sky"] as const).forEach((token) => {
      expect(light[token]).toBe(dark[token])
    })
  })

  screens.forEach(([name, element]) => {
    ;(["light", "dark"] as ThemeMode[]).forEach((mode) => {
      it(`${name}: dark icons in ${mode} mode`, () => {
        const tints = tintsDeclaredBy(inMode(mode, element()))

        expect(tints).toContain("dark-content")
        expect(tints).not.toContain("light-content")
      })
    })
  })

  // The quiz's answer sheet renders its backdrop inside the Screen
  // (coverScreen={false}), so with the sheet open the field under the status
  // bar is 0.7 black over #E6EBEf, not #E6EBEf — and the tint has to follow it.
  ;(["light", "dark"] as ThemeMode[]).forEach((mode) => {
    it(`EarnQuiz: light icons once the answer sheet is open, in ${mode} mode`, () => {
      const [, element] = screens[1]
      const tree = inMode(mode, element())

      expect(tintsDeclaredBy(tree)).not.toContain("light-content")

      fireEvent.press(tree.getByText(/^Earn /))

      const tints = tintsDeclaredBy(tree)
      expect(tints).toContain("light-content")
      expect(tints).not.toContain("dark-content")
    })
  })
})
