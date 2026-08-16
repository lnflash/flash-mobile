import React from "react"
import { render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import { ConversionSuccessScreen } from "../conversion-success-screen"

// Without this, i18nObject("en") resolves every key to "" and text queries
// match arbitrary empty text nodes.
loadAllLocales()

const LL = i18nObject("en")

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const mockPopToTop = jest.fn()
let mockRouteParams: { pending?: boolean } | undefined

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ popToTop: mockPopToTop }),
  useRoute: () => ({ key: "s", name: "conversionSuccess", params: mockRouteParams }),
}))

// The reanimated entering animations add nothing to these assertions and need
// worklet setup jest does not have.
jest.mock("@app/components/success-animation", () => {
  const react = jest.requireActual("react")
  return {
    SuccessIconAnimation: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
    SuccessTextAnimation: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
  }
})

// GaloyIcon renders an SVG with no testID, so surface the icon name as text —
// pending and success must not show the same icon.
jest.mock("@app/components/atomic/galoy-icon", () => {
  const react = jest.requireActual("react")
  const { Text: RNText } = jest.requireActual("react-native")
  return {
    GaloyIcon: ({ name }: { name: string }) =>
      react.createElement(RNText, null, `icon:${name}`),
  }
})

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

const renderScreen = (params?: { pending?: boolean }) => {
  mockRouteParams = params
  return render(
    <ThemeProvider theme={theme}>
      <ConversionSuccessScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRouteParams = undefined
})

describe("ConversionSuccessScreen", () => {
  it("renders the unconfirmed copy — not the success copy — when pending", () => {
    // The bug this screen exists to prevent: an unsettled conversion claiming
    // "Conversion successful" while no funds have moved.
    const { getByText, queryByText } = renderScreen({ pending: true })

    expect(getByText(LL.SendBitcoinScreen.notConfirmed())).toBeTruthy()
    expect(queryByText(LL.ConversionSuccessScreen.message())).toBeNull()
    expect(getByText("icon:payment-pending")).toBeTruthy()
  })

  it("renders the success copy when the conversion settled", () => {
    const { getByText, queryByText } = renderScreen({ pending: false })

    expect(getByText(LL.ConversionSuccessScreen.message())).toBeTruthy()
    expect(queryByText(LL.SendBitcoinScreen.notConfirmed())).toBeNull()
    expect(getByText("icon:payment-success")).toBeTruthy()
  })

  it("treats missing route params as settled", () => {
    const { getByText, queryByText } = renderScreen(undefined)

    expect(getByText(LL.ConversionSuccessScreen.message())).toBeTruthy()
    expect(queryByText(LL.SendBitcoinScreen.notConfirmed())).toBeNull()
  })

  it("leaves a pending conversion on screen longer than a settled one", () => {
    jest.useFakeTimers()
    try {
      const settled = renderScreen({ pending: false })
      jest.advanceTimersByTime(2999)
      expect(mockPopToTop).not.toHaveBeenCalled()
      jest.advanceTimersByTime(1)
      expect(mockPopToTop).toHaveBeenCalledTimes(1)
      settled.unmount()

      mockPopToTop.mockClear()

      renderScreen({ pending: true })
      jest.advanceTimersByTime(3000)
      expect(mockPopToTop).not.toHaveBeenCalled()
      jest.advanceTimersByTime(2000)
      expect(mockPopToTop).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
})
