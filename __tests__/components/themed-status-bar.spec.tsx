import * as React from "react"
import { StatusBar } from "react-native"
import { createTheme, ThemeProvider, ThemeMode } from "@rneui/themed"
import { render } from "@testing-library/react-native"

import { ThemedStatusBar } from "../../app/components/themed-status-bar"

const renderInMode = (mode: ThemeMode) =>
  render(
    <ThemeProvider theme={createTheme({ mode })}>
      <ThemedStatusBar />
    </ThemeProvider>,
  )

const barStyleOf = (tree: ReturnType<typeof renderInMode>) =>
  tree.UNSAFE_getByType(StatusBar).props.barStyle

describe("ThemedStatusBar", () => {
  it("uses dark icons on the light theme, so they stay visible on light screens", () => {
    // ENG-609: this was hard-coded to light-content, which put white icons on
    // white screens once Android 15+ stopped painting the black background.
    expect(barStyleOf(renderInMode("light"))).toBe("dark-content")
  })

  it("uses light icons on the dark theme", () => {
    expect(barStyleOf(renderInMode("dark"))).toBe("light-content")
  })

  it("does not set a background colour, which Android 15+ ignores anyway", () => {
    expect(renderInMode("light").UNSAFE_getByType(StatusBar).props.backgroundColor).toBe(
      undefined,
    )
  })
})
