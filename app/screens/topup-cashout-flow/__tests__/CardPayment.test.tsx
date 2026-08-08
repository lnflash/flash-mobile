import React from "react"
import { Alert } from "react-native"
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import CardPayment from "../CardPayment"

// Without this, i18nObject("en") resolves every key to "" and text queries
// match arbitrary empty text nodes.
loadAllLocales()

// Deterministic, synchronous i18n (the real TypesafeI18n loads its dictionary
// asynchronously, leaving LL-derived labels empty on first render).
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

const mockUseHomeAuthedQuery = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useHomeAuthedQuery: (...args: unknown[]) => mockUseHomeAuthedQuery(...args),
}))

// Capture WebView props so tests can assert on the payment URL and drive the
// navigation-state callback without a real WebView native module.
const mockWebView: jest.Mock = jest.fn(() => null)
jest.mock("react-native-webview", () => ({
  WebView: (props: unknown) => mockWebView(props),
}))

const en = i18nObject("en")

const renderCardPayment = ({
  amount = 25,
  wallet = "USD",
  navigate = jest.fn(),
  goBack = jest.fn(),
} = {}) => {
  const navigation = { navigate, goBack } as never
  const route = {
    key: "CardPayment",
    name: "CardPayment",
    params: { amount, wallet },
  } as never
  const utils = render(
    <ThemeProvider theme={theme}>
      <CardPayment navigation={navigation} route={route} />
    </ThemeProvider>,
  )
  return { ...utils, navigate, goBack }
}

// The test renderer occasionally issues a stray zero-arg invocation of the
// component function; only calls that actually carried props are meaningful.
const lastWebViewProps = () => {
  const calls = mockWebView.mock.calls.filter((call) => call[0])
  return calls[calls.length - 1][0] as {
    source: { uri: string }
    onNavigationStateChange: (event: { url: string }) => void
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseHomeAuthedQuery.mockReturnValue({
    data: { me: { username: "alice" } },
    loading: false,
    refetch: jest.fn(() => Promise.resolve()),
  })
})

describe("CardPayment payment URL", () => {
  it("passes the username as custom_reference (the parameter Fygaro's checkout reads)", () => {
    renderCardPayment()

    const { uri } = lastWebViewProps().source
    expect(uri).toContain("custom_reference=alice")
    expect(uri).toContain("amount=25")
    // The old parameter name is silently ignored by Fygaro and left payments
    // unattributed — it must never come back.
    expect(uri).not.toContain("client_reference")
  })

  it("records the target wallet in client_note", () => {
    renderCardPayment({ wallet: "USD" })

    expect(lastWebViewProps().source.uri).toContain(
      `client_note=${encodeURIComponent("wallet:USD")}`,
    )
  })

  it("URL-encodes usernames that contain reserved characters", () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: { me: { username: "álice+test" } },
      loading: false,
    })

    renderCardPayment()

    const { uri } = lastWebViewProps().source
    expect(uri).toContain(`custom_reference=${encodeURIComponent("álice+test")}`)
  })
})

describe("CardPayment username gating", () => {
  it("does not mount the WebView while the username is still loading", () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: undefined,
      loading: true,
      refetch: jest.fn(() => Promise.resolve()),
    })

    const { getAllByText } = renderCardPayment()

    expect(mockWebView).not.toHaveBeenCalled()
    expect(getAllByText(en.FygaroWebViewScreen.loading()).length).toBeGreaterThan(0)
  })

  it("shows the error screen instead of an unattributable payment when no username exists", () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: { me: { username: null } },
      loading: false,
      refetch: jest.fn(() => Promise.resolve()),
    })

    const { getAllByText } = renderCardPayment()

    expect(mockWebView).not.toHaveBeenCalled()
    expect(getAllByText(en.FygaroWebViewScreen.error()).length).toBeGreaterThan(0)
  })

  it("Retry refetches the account query when the username never resolved", () => {
    const refetch = jest.fn(() => Promise.resolve())
    mockUseHomeAuthedQuery.mockReturnValue({
      data: { me: { username: null } },
      loading: false,
      refetch,
    })

    const { getAllByText } = renderCardPayment()
    fireEvent.press(getAllByText(en.FygaroWebViewScreen.retry())[0])

    expect(refetch).toHaveBeenCalled()
  })
})

describe("CardPayment navigation callbacks", () => {
  it("ignores navigation events for the payment-button URL itself, even when the username contains a trigger word", () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: { me: { username: "success-story" } },
      loading: false,
      refetch: jest.fn(() => Promise.resolve()),
    })
    const { navigate, goBack } = renderCardPayment()

    const props = lastWebViewProps()
    expect(props.source.uri).toContain("success")
    props.onNavigationStateChange({ url: props.source.uri })

    expect(navigate).not.toHaveBeenCalled()
    expect(goBack).not.toHaveBeenCalled()
  })

  it("fires success when Fygaro returns to the payment-button URL with ?success=1 (real PayPal return shape)", async () => {
    const { navigate } = renderCardPayment({ amount: 10, wallet: "USD" })

    lastWebViewProps().onNavigationStateChange({
      url: "https://www.fygaro.com/en/pb/bd4a34c1-3d24-4315-a2b8-627518f70916/?success=1&custom_reference=alice",
    })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("paymentSuccess", {
        amount: 10,
        wallet: "USD",
        transactionId: expect.stringMatching(/^txn_/),
      }),
    )
  })

  it("fires the failure alert when Fygaro returns with ?success=0", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { navigate } = renderCardPayment()

    lastWebViewProps().onNavigationStateChange({
      url: "https://www.fygaro.com/en/pb/bd4a34c1-3d24-4315-a2b8-627518f70916/?success=0&custom_reference=alice",
    })

    expect(navigate).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      "Payment Failed",
      expect.any(String),
      expect.anything(),
    )
    alertSpy.mockRestore()
  })

  it("navigates to paymentSuccess with the original amount and wallet on a success URL", async () => {
    const { navigate } = renderCardPayment({ amount: 10, wallet: "USD" })

    lastWebViewProps().onNavigationStateChange({
      url: "https://www.fygaro.com/en/checkout/payment_success",
    })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("paymentSuccess", {
        amount: 10,
        wallet: "USD",
        transactionId: expect.stringMatching(/^txn_/),
      }),
    )
  })
})
