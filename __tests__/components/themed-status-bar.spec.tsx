import * as React from "react"
import { StatusBar } from "react-native"
import { createTheme, ThemeProvider, ThemeMode, useThemeMode } from "@rneui/themed"
import { act, render } from "@testing-library/react-native"

import appTheme from "../../app/rne-theme/theme"
import { ThemedStatusBar } from "../../app/components/themed-status-bar"

const renderInMode = (mode: ThemeMode) =>
  render(
    <ThemeProvider
      theme={createTheme({
        mode,
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      <ThemedStatusBar />
    </ThemeProvider>,
  )

type Tree = ReturnType<typeof render>

const barStyleOf = (tree: Tree) => tree.UNSAFE_getByType(StatusBar).props.barStyle

const barBackgroundOf = (tree: Tree) =>
  tree.UNSAFE_getByType(StatusBar).props.backgroundColor

describe("ThemedStatusBar", () => {
  it("uses dark icons on the light theme, so they stay visible on light screens", () => {
    // ENG-609: this was hard-coded to light-content, which put white icons on
    // white screens once Android 15+ stopped painting the black background.
    expect(barStyleOf(renderInMode("light"))).toBe("dark-content")
  })

  it("uses light icons on the dark theme", () => {
    expect(barStyleOf(renderInMode("dark"))).toBe("light-content")
  })

  it("paints the band with the theme background, which Android <= 14 still renders", () => {
    // minSdkVersion is 26 and the app theme sets no android:statusBarColor, so on
    // Android 8-14 the window still paints an opaque band. Leaving this unset
    // would hand those devices RN's platform default (#757575 grey) rather than
    // the screen background underneath.
    expect(barBackgroundOf(renderInMode("light"))).toBe("#FFFFFF")
    expect(barBackgroundOf(renderInMode("dark"))).toBe("#000000")
  })

  it("follows a runtime theme switch without remounting", () => {
    // ThemeSyncGraphql calls setMode when the user flips the theme or the OS
    // scheme changes (app/utils/theme-sync.tsx), which is the path users hit.
    let setMode: ((mode: ThemeMode) => void) | undefined

    const ModeProbe: React.FC = () => {
      setMode = useThemeMode().setMode
      return null
    }

    const tree = render(
      <ThemeProvider theme={appTheme}>
        <ThemedStatusBar />
        <ModeProbe />
      </ThemeProvider>,
    )

    expect(barStyleOf(tree)).toBe("dark-content")
    expect(barBackgroundOf(tree)).toBe("#FFFFFF")

    act(() => setMode?.("dark"))

    expect(barStyleOf(tree)).toBe("light-content")
    expect(barBackgroundOf(tree)).toBe("#000000")
  })

  it("shouts in dev when mounted outside ThemeProvider", () => {
    // The ENG-609 bug lived at the mount site, not in this component: hoisted
    // above ThemeProvider it reads no theme, dark-mode users get dark icons on a
    // black screen, and every assertion above still passes.
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})

    try {
      render(<ThemedStatusBar />)

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("must be rendered inside ThemeProvider"),
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
