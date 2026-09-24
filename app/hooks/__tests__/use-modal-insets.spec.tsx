// The shared inset hook for react-native-modal sheets (ENG-605). Every bottom
// sheet in the app renders inline (`coverScreen={false}`) so it reaches the
// physical window edge; the hook is what keeps it above the navigation bar
// under Android edge-to-edge and above the iOS home indicator.
//
// The hook is additive: consumers put the result AFTER their base style, so a
// bare `{ paddingBottom: inset }` would replace the sheet's designed padding
// (with 0 on a non-edge-to-edge window). The specs below pin the sum.
import * as React from "react"
import { renderHook } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { useModalInsetStyle } from "@app/hooks/use-modal-insets"

jest.mock("react-native-safe-area-context", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactActual = require("react")
  const actual = jest.requireActual("react-native-safe-area-context")
  const ZERO = { top: 0, bottom: 0, left: 0, right: 0 }
  return {
    ...actual,
    useSafeAreaInsets: () => ReactActual.useContext(actual.SafeAreaInsetsContext) ?? ZERO,
    SafeAreaProvider: ({
      children,
      initialMetrics,
    }: {
      children: React.ReactNode
      initialMetrics?: { insets: typeof ZERO }
    }) =>
      ReactActual.createElement(
        actual.SafeAreaInsetsContext.Provider,
        { value: initialMetrics?.insets ?? ZERO },
        children,
      ),
  }
})

const withInsets = (insets: {
  top: number
  bottom: number
  left: number
  right: number
}) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{ insets, frame: { x: 0, y: 0, width: 0, height: 0 } }}
    >
      {children}
    </SafeAreaProvider>
  )
  Wrapper.displayName = "SafeAreaInsetsWrapper"
  return Wrapper
}

const THREE_BUTTON_NAV = { top: 24, bottom: 48, left: 0, right: 0 }
const NOT_EDGE_TO_EDGE = { top: 0, bottom: 0, left: 0, right: 0 }

describe("useModalInsetStyle", () => {
  it("sheet: adds the bottom inset to the base paddingBottom", () => {
    const { result } = renderHook(
      () => useModalInsetStyle("sheet", { paddingTop: 20, paddingBottom: 32 }),
      { wrapper: withInsets(THREE_BUTTON_NAV) },
    )

    expect(result.current).toEqual({ paddingBottom: 32 + 48 })
  })

  it("sheet: with no base style the padding is the inset alone", () => {
    const { result } = renderHook(() => useModalInsetStyle("sheet"), {
      wrapper: withInsets(THREE_BUTTON_NAV),
    })

    expect(result.current).toEqual({ paddingBottom: 48 })
  })

  it("sheet: folds in the `padding` shorthand (a specific edge beats it in Yoga)", () => {
    const { result } = renderHook(() => useModalInsetStyle("sheet", { padding: 24 }), {
      wrapper: withInsets(THREE_BUTTON_NAV),
    })

    expect(result.current).toEqual({ paddingBottom: 24 + 48 })
  })

  it("sheet: paddingVertical counts, and paddingBottom wins over it", () => {
    const { result: vertical } = renderHook(
      () => useModalInsetStyle("sheet", { padding: 8, paddingVertical: 16 }),
      { wrapper: withInsets(THREE_BUTTON_NAV) },
    )
    expect(vertical.current).toEqual({ paddingBottom: 16 + 48 })

    const { result: specific } = renderHook(
      () => useModalInsetStyle("sheet", { paddingVertical: 16, paddingBottom: 4 }),
      { wrapper: withInsets(THREE_BUTTON_NAV) },
    )
    expect(specific.current).toEqual({ paddingBottom: 4 + 48 })
  })

  it("sheet: accepts a style array, as consumers compose them", () => {
    const { result } = renderHook(
      () => useModalInsetStyle("sheet", [{ padding: 24 }, { paddingBottom: 40 }]),
      { wrapper: withInsets(THREE_BUTTON_NAV) },
    )

    expect(result.current).toEqual({ paddingBottom: 40 + 48 })
  })

  it("fullScreen: adds top and bottom insets to the base padding", () => {
    const { result } = renderHook(
      () => useModalInsetStyle("fullScreen", { paddingTop: 10, paddingBottom: 12 }),
      { wrapper: withInsets(THREE_BUTTON_NAV) },
    )

    expect(result.current).toEqual({ paddingTop: 10 + 24, paddingBottom: 12 + 48 })
  })

  it("keeps the base padding intact when the window is not edge-to-edge", () => {
    // Android 14 and older at target 35: every inset is 0, so the sheet must
    // keep exactly the padding it was designed with, not lose it to a 0.
    const { result } = renderHook(
      () => useModalInsetStyle("sheet", { paddingBottom: 32 }),
      {
        wrapper: withInsets(NOT_EDGE_TO_EDGE),
      },
    )

    expect(result.current).toEqual({ paddingBottom: 32 })
  })

  it("returns a stable object across re-renders with unchanged insets", () => {
    const base = { paddingBottom: 32 }
    const { result, rerender } = renderHook(() => useModalInsetStyle("sheet", base), {
      wrapper: withInsets(THREE_BUTTON_NAV),
    })
    const first = result.current
    rerender({})

    expect(result.current).toBe(first)
  })
})
