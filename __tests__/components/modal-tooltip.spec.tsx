/**
 * ModalTooltip — the info/advice bottom sheet behind the (i) icon.
 *
 * Contract under test (ENG-605):
 *  - The sheet renders inline (coverScreen={false}, the #545 Fabric workaround)
 *    so it reaches the physical window edge and has to clear the nav bar
 *    itself.
 *  - Its base style uses the `padding` shorthand, the one consumer that does.
 *    The inset hook must fold that shorthand in: a specific `paddingBottom`
 *    beats `padding` in Yoga regardless of order, so a bare `{ paddingBottom:
 *    inset }` would silently replace the designed 24 with the inset (or 0).
 */

import * as React from "react"
import { StyleSheet } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"

jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({ appConfig: { galoyInstance: { name: "Flash" } } }),
}))

// The (i) trigger and the sheet's title icon. A pressable stand-in keyed by
// icon name so the spec can open the sheet without reaching into the real
// vector-icons Text.
jest.mock("react-native-vector-icons/Ionicons", () => {
  const ReactActual = jest.requireActual("react")
  const { Text } = jest.requireActual("react-native")
  return ({ name, onPress }: { name: string; onPress?: () => void }) =>
    ReactActual.createElement(Text, { testID: `icon-${name}`, onPress }, name)
})

// react-native-modal animates; this stand-in renders children synchronously
// and records its props so the spec can pin the inline render path.
type ModalProps = { isVisible: boolean; coverScreen?: boolean; children: React.ReactNode }
let mockLastModalProps: ModalProps | undefined
jest.mock("react-native-modal", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return (props: ModalProps) => {
    mockLastModalProps = props
    return props.isVisible ? ReactActual.createElement(View, null, props.children) : null
  }
})

import { ModalTooltip } from "@app/components/modal-tooltip/modal-tooltip"
import { loadLocale } from "@app/i18n/i18n-util.sync"

loadLocale("en")

// Android 15 3-button nav under edge-to-edge.
const THREE_BUTTON_NAV = { top: 24, bottom: 48, left: 0, right: 0 }
const NOT_EDGE_TO_EDGE = { top: 0, bottom: 0, left: 0, right: 0 }
// styles.modalCard in the component: `padding: 24` (the shorthand).
const CARD_DESIGN_PADDING = 24

const renderTooltip = (insets: typeof THREE_BUTTON_NAV) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ insets, frame: { x: 0, y: 0, width: 0, height: 0 } }}
    >
      <ThemeProvider theme={createTheme({})}>
        <ModalTooltip type="info" text="Some helpful text" />
      </ThemeProvider>
    </SafeAreaProvider>,
  )

const openSheet = (screen: ReturnType<typeof render>) => {
  act(() => {
    fireEvent.press(screen.getByTestId("icon-information-circle-outline"))
  })
  return screen.getByTestId("modal-tooltip-sheet")
}

beforeEach(() => {
  mockLastModalProps = undefined
})

describe("ModalTooltip", () => {
  it("renders inline: coverScreen={false} (Fabric/Android bottom-sheet freeze)", () => {
    const screen = renderTooltip(NOT_EDGE_TO_EDGE)
    openSheet(screen)

    expect(mockLastModalProps?.coverScreen).toBe(false)
  })

  it("pads the sheet by its `padding` shorthand plus the bottom inset (ENG-605)", () => {
    const sheet = openSheet(renderTooltip(THREE_BUTTON_NAV))

    expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(
      CARD_DESIGN_PADDING + THREE_BUTTON_NAV.bottom,
    )
  })

  it("keeps the `padding` shorthand intact when the window is not edge-to-edge", () => {
    // Android 14 and older at target 35: inset 0. The fold must resolve to the
    // designed 24, not a paddingBottom of 0 that would beat the shorthand.
    const sheet = openSheet(renderTooltip(NOT_EDGE_TO_EDGE))

    expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(CARD_DESIGN_PADDING)
  })
})
