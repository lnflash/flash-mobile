// Shared `react-native-safe-area-context` stand-in for specs that pin the
// ENG-605 safe-area work (the modal inset hook and its consumers, `Screen`).
//
// The real `SafeAreaProvider` is a native view that measures nothing under
// jest, so `useSafeAreaInsets` always sees zeros. This build feeds the hook
// from the library's own insets context and swaps the provider for a plain
// context provider that honours `initialMetrics`, so a spec can render under
// a 3-button-nav inset and assert that a sheet actually applies it. The
// frame context is provided too: react-navigation's header reads
// `useSafeAreaFrame` and throws without it.
//
// Usage (the factory has to be a `require`, `jest.mock` is hoisted above
// imports):
//
//   jest.mock("react-native-safe-area-context", () =>
//     require("../helpers/safe-area-context-mock").build(),
//   )
//
// Extra overrides (e.g. a `SafeAreaView` stand-in) spread on top of the
// result: `({ ...build(), SafeAreaView: MySafeAreaViewMock })`.
/* eslint-disable @typescript-eslint/no-var-requires */
import type * as React from "react"

export type Insets = { top: number; bottom: number; left: number; right: number }
export type Frame = { x: number; y: number; width: number; height: number }

export const ZERO_INSETS: Insets = { top: 0, bottom: 0, left: 0, right: 0 }
export const NO_FRAME: Frame = { x: 0, y: 0, width: 0, height: 0 }

type ProviderProps = {
  children: React.ReactNode
  initialMetrics?: { insets: Insets; frame?: Frame }
}

export const build = () => {
  // Plain require: `jest.requireActual("react")` inside a mock factory hands
  // the mock a second React instance and every hook in the tree dies.
  const ReactActual = require("react")
  const actual = jest.requireActual("react-native-safe-area-context")

  const useSafeAreaInsets = (): Insets =>
    ReactActual.useContext(actual.SafeAreaInsetsContext) ?? ZERO_INSETS

  const SafeAreaProvider = ({ children, initialMetrics }: ProviderProps) =>
    ReactActual.createElement(
      actual.SafeAreaFrameContext.Provider,
      { value: initialMetrics?.frame ?? NO_FRAME },
      ReactActual.createElement(
        actual.SafeAreaInsetsContext.Provider,
        { value: initialMetrics?.insets ?? ZERO_INSETS },
        children,
      ),
    )

  return { ...actual, useSafeAreaInsets, SafeAreaProvider }
}
