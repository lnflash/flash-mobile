/**
 * Every type toastShow's union advertises must be registered in GaloyToast's
 * config: react-native-toast-message THROWS in render on an unknown type,
 * which the root ErrorBoundary catches by unmounting the entire app in favor
 * of the ErrorScreen. A missing "warning" renderer turned the Plaid
 * manual-entry rescue toast into an app-killer (PR #678 review finding).
 */
import * as React from "react"
import { Text } from "react-native"
import { render, act } from "@testing-library/react-native"
import Toast from "react-native-toast-message"
import ErrorBoundary from "react-native-error-boundary"

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock("@app/utils/analytics", () => ({
  logToastShown: jest.fn(),
}))

import { GaloyToast } from "@app/components/galoy-toast"
import { toastShow } from "@app/utils/toast"
import { loadLocale } from "@app/i18n/i18n-util.sync"

beforeAll(() => loadLocale("en"))

const Fallback = () => <Text testID="error-fallback">app replaced by ErrorScreen</Text>

const renderHost = (onError?: (e: Error) => void) =>
  render(
    <ErrorBoundary FallbackComponent={Fallback} onError={onError}>
      <Text testID="app-content">app</Text>
      <GaloyToast />
    </ErrorBoundary>,
  )

describe("GaloyToast type registry", () => {
  for (const type of ["success", "error", "warning"] as const) {
    it(`renders a ${type} toast without tripping the error boundary`, () => {
      const screen = renderHost()
      act(() => {
        Toast.show({ type, text1: "title", text2: "body" })
      })
      expect(screen.queryByTestId("error-fallback")).toBeNull()
      expect(screen.queryByTestId("app-content")).not.toBeNull()
      expect(screen.queryByText("body")).not.toBeNull()
    })
  }

  it("toastShow({type:'warning'}) — the Plaid fallback call — renders titled Warning", () => {
    // End-to-end through the real toast.ts pipeline (the hook spec mocks it).
    const screen = renderHost()
    act(() => {
      toastShow({ type: "warning", message: "Bank linking is unavailable right now" })
    })
    expect(screen.queryByTestId("error-fallback")).toBeNull()
    expect(screen.queryByText("Warning")).not.toBeNull()
    expect(screen.queryByText("Bank linking is unavailable right now")).not.toBeNull()
  })
})
