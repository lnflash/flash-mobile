// Android half of the Screen safe-area spec (ENG-605). `isIos` is evaluated
// once when app/utils/helper loads, so the Android branch needs the helper
// mocked before Screen is imported; jest hoists this mock above the imports.
// Runs the real react-native-safe-area-context module so it also pins that
// the wrapper is the context library's native SafeAreaView, not the core
// (iOS-only, deprecated) one.
import * as React from "react"
import { KeyboardAvoidingView, Text } from "react-native"
import { render } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { Screen } from "@app/components/screen"

jest.mock("@app/utils/helper", () => ({
  ...jest.requireActual("@app/utils/helper"),
  isIos: false,
}))

const renderScreen = (props: React.ComponentProps<typeof Screen> = {}) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <Screen {...props}>
        <Text>child</Text>
      </Screen>
    </ThemeProvider>,
  )

describe("Screen on Android", () => {
  it("gives KeyboardAvoidingView no behavior, so it cannot stack on the bottom inset", () => {
    const screen = renderScreen()

    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBeUndefined()
  })

  it("wraps content in the safe-area-context SafeAreaView (native RNCSafeAreaView)", () => {
    const { toJSON } = renderScreen()

    const tree = JSON.stringify(toJSON())
    expect(tree).toContain("RNCSafeAreaView")
  })

  it("does not render the safe-area wrapper when `unsafe`", () => {
    const { toJSON } = renderScreen({ unsafe: true })

    expect(JSON.stringify(toJSON())).not.toContain("RNCSafeAreaView")
  })
})
