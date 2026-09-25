// ENG-611: Screen must not pad by the status bar a second time when a
// navigation header is already reserving it.
//
// safe-area-context's SafeAreaView is NOT position-aware — it reads the
// nearest provider's insets verbatim — so a screen under a header would
// otherwise carry a status-bar-high band of dead space beneath the header.
// These specs pin the `edges` prop, which is what suppresses the top pad.
//
// HeaderShownContext is what React Navigation itself uses to decide whether a
// header reserves the status bar, so rendering the provider directly is a
// faithful stand-in for being mounted under a navigator.
import { HeaderShownContext } from "@react-navigation/elements"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render } from "@testing-library/react-native"
import * as React from "react"
import { Text } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Screen } from "@app/components/screen"
import { ScreenProps } from "@app/components/screen/screen.props"

const renderScreen = ({
  headerShown,
  ...props
}: React.ComponentProps<typeof Screen> & { headerShown: boolean }) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <HeaderShownContext.Provider value={headerShown}>
        <Screen {...props}>
          <Text>child</Text>
        </Screen>
      </HeaderShownContext.Provider>
    </ThemeProvider>,
  )

const edgesOf = (tree: ReturnType<typeof renderScreen>) =>
  tree.UNSAFE_getByType(SafeAreaView).props.edges

const variants: { name: string; preset: ScreenProps["preset"] }[] = [
  { name: "non-scrolling", preset: undefined },
  { name: "scrolling", preset: "scroll" },
]

variants.forEach(({ name, preset }) => {
  describe(`Screen (${name}) under a navigation header`, () => {
    it("drops the top edge, so the status bar is not reserved twice", () => {
      const edges = edgesOf(renderScreen({ headerShown: true, preset }))

      expect(edges).toBeDefined()
      expect(edges).not.toContain("top")
    })

    it("keeps the side and bottom edges, which no header reserves", () => {
      const edges = edgesOf(renderScreen({ headerShown: true, preset }))

      expect(edges).toEqual(expect.arrayContaining(["left", "right", "bottom"]))
    })

    it("pads all four edges with no header, where nothing else holds content clear", () => {
      // undefined `edges` is safe-area-context's own "all four, additive".
      expect(edgesOf(renderScreen({ headerShown: false, preset }))).toBeUndefined()
    })
  })
})
