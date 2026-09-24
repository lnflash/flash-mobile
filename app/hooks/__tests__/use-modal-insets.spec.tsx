// The shared inset hook for react-native-modal sheets (ENG-605). Every bottom
// sheet in the app renders inline (`coverScreen={false}`) so it reaches the
// physical window edge; the hook is what keeps it above the navigation bar
// under Android edge-to-edge and above the iOS home indicator.
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
  it("sheet: pads the bottom inset only", () => {
    const { result } = renderHook(() => useModalInsetStyle("sheet"), {
      wrapper: withInsets(THREE_BUTTON_NAV),
    })

    expect(result.current).toEqual({ paddingBottom: 48 })
  })

  it("fullScreen: pads top and bottom", () => {
    const { result } = renderHook(() => useModalInsetStyle("fullScreen"), {
      wrapper: withInsets(THREE_BUTTON_NAV),
    })

    expect(result.current).toEqual({ paddingTop: 24, paddingBottom: 48 })
  })

  it("is a zero pad when the window is not edge-to-edge", () => {
    const { result } = renderHook(() => useModalInsetStyle("sheet"), {
      wrapper: withInsets(NOT_EDGE_TO_EDGE),
    })

    expect(result.current).toEqual({ paddingBottom: 0 })
  })

  it("returns a stable object across re-renders with unchanged insets", () => {
    const { result, rerender } = renderHook(() => useModalInsetStyle("sheet"), {
      wrapper: withInsets(THREE_BUTTON_NAV),
    })
    const first = result.current
    rerender({})

    expect(result.current).toBe(first)
  })
})
