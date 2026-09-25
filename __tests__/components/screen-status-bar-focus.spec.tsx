/**
 * ENG-609: a screen's `statusBar` override must not outlive its focus.
 *
 * React Native's StatusBar keeps a mount-ordered stack and merges it
 * last-mounted-wins; entries are pushed on mount and popped only on unmount.
 * The stack navigator keeps routes below the top mounted, so an override tied
 * to the component's lifetime leaks onto every screen pushed after it — the
 * scanner's `light-content` following the user into a white send-details
 * screen, which is the ENG-609 symptom again.
 *
 * This spec drives a real two-route stack navigator: route A declares
 * `statusBar="light-content"`, route B declares nothing. After navigating
 * A -> B, the merged props must be back to whatever the global themed entry
 * says, not A's override.
 *
 * The same guard also covers the two screens that push their own entry instead
 * of going through `Screen`'s prop — FeaturedProfileView (no `Screen` at all)
 * and NIP17Chat (`translucent`/`transparent`, which the prop cannot express) —
 * so the bare-`View` shape is driven here too.
 */
import { NavigationContainer } from "@react-navigation/native"
import { createStackNavigator } from "@react-navigation/stack"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, render, screen } from "@testing-library/react-native"
import * as React from "react"
import { StatusBar, Text, View } from "react-native"

import { Screen } from "@app/components/screen"
import { FocusedStatusBar } from "@app/components/themed-status-bar"

const Stack = createStackNavigator()

// The app-wide entry ThemedStatusBar provides in the real tree.
const GlobalEntry = () => <StatusBar barStyle="dark-content" />

const DarkRoute = ({ navigation }: { navigation: { navigate: (r: string) => void } }) => (
  <Screen unsafe backgroundColor="#000" statusBar="light-content">
    <Text testID="go" onPress={() => navigation.navigate("Plain")}>
      go
    </Text>
  </Screen>
)

/**
 * The FeaturedProfileView shape: a plain View with its own entry, no `Screen`.
 */
const BareViewRoute = ({
  navigation,
}: {
  navigation: { navigate: (r: string) => void }
}) => (
  <View>
    <FocusedStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
    <Text testID="go" onPress={() => navigation.navigate("Plain")}>
      go
    </Text>
  </View>
)

const PlainRoute = () => (
  <Screen preset="scroll">
    <Text>plain</Text>
  </Screen>
)

type RouteComponent = React.ComponentType<{
  navigation: { navigate: (r: string) => void }
}>

const renderStack = (First: RouteComponent = DarkRoute) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <GlobalEntry />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Dark" component={First as React.ComponentType} />
          <Stack.Screen name="Plain" component={PlainRoute} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>,
  )

// StatusBar exposes the merged stack it would push to native. Entries hold
// `{animated, value}` rather than the bare style, and last-defined wins.
const mergedBarStyle = () =>
  (
    StatusBar as unknown as { _propsStack: { barStyle?: { value?: string } }[] }
  )._propsStack
    .map((entry) => entry.barStyle?.value)
    .filter(Boolean)
    .pop()

describe("Screen statusBar override and focus", () => {
  it("applies the override while its route is focused", async () => {
    renderStack()

    expect(mergedBarStyle()).toBe("light-content")
  })

  it("stops applying it once another route is pushed on top", async () => {
    renderStack()

    await act(async () => {
      screen.getByTestId("go").props.onPress()
    })

    // The dark route is still mounted underneath; its entry must no longer win.
    expect(mergedBarStyle()).toBe("dark-content")
  })

  // FeaturedProfileView and NIP17Chat push their own entries rather than going
  // through `Screen`'s prop. Before they were wrapped in FocusedStatusBar they
  // were plain `StatusBar` elements and leaked exactly like this.
  it("scopes an entry pushed outside Screen to focus as well", async () => {
    renderStack(BareViewRoute)

    expect(mergedBarStyle()).toBe("light-content")

    await act(async () => {
      screen.getByTestId("go").props.onPress()
    })

    expect(mergedBarStyle()).toBe("dark-content")
  })
})
