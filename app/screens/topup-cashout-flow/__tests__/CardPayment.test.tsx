import React from "react"
import { Alert } from "react-native"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import CardPayment from "../CardPayment"

// Without this, i18nObject("en") resolves every key to "" and text queries
// match arbitrary empty text nodes.
loadAllLocales()

// Deterministic, synchronous i18n (the real TypesafeI18n loads its dictionary
// asynchronously, leaving LL-derived labels empty on first render). LL is
// cached so it stays referentially stable across renders, matching the real
// context — the header-effect memoization test below depends on that.
jest.mock("@app/i18n/i18n-react", () => {
  let cachedLL: ReturnType<typeof i18nObject> | undefined
  return {
    useI18nContext: () => {
      cachedLL = cachedLL ?? i18nObject("en")
      return { LL: cachedLL }
    },
  }
})

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

const mockUseHomeAuthedQuery = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useHomeAuthedQuery: (...args: unknown[]) => mockUseHomeAuthedQuery(...args),
  useFygaroCheckoutCreateMutation: () => [mockCreateCheckout, { loading: false }],
}))

// Default: signed checkout is unavailable (the flag is off in production as of
// this writing), so these tests exercise the LEGACY device-built URL that must
// keep working. The signed path has its own coverage in
// __tests__/hooks/use-fygaro-checkout.spec.tsx.
const mockCreateCheckout: jest.Mock = jest.fn(async () => ({
  data: { fygaroCheckoutCreate: { errors: [], checkout: null } },
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
  setOptions = jest.fn(),
} = {}) => {
  const navigation = { navigate, goBack, setOptions } as never
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
  return { ...utils, navigate, goBack, setOptions }
}

// The test renderer occasionally issues a stray zero-arg invocation of the
// component function; only calls that actually carried props are meaningful.
// The screen now asks the server to authorise and sign the link before it
// loads anything, so the WebView appears one tick later than it used to. Tests
// must let that settle instead of reading the very first render — the old
// synchronous read is exactly what would hide a regression where the editable
// link loads before the signed one arrives.
const renderAndSettle = async (...args: Parameters<typeof renderCardPayment>) => {
  const rendered = renderCardPayment(...args)
  await waitFor(() =>
    expect(mockWebView.mock.calls.filter((c) => c[0]).length).toBeGreaterThan(0),
  )
  return rendered
}

const lastWebViewProps = () => {
  const calls = mockWebView.mock.calls.filter((call) => call[0])
  return calls[calls.length - 1][0] as {
    source: { uri: string }
    onNavigationStateChange: (event: { url: string }) => void
    onLoadEnd: () => void
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
  it("passes the username as custom_reference (the parameter Fygaro's checkout reads)", async () => {
    await renderAndSettle()

    const { uri } = lastWebViewProps().source
    expect(uri).toContain("custom_reference=alice")
    expect(uri).toContain("amount=25")
    // The old parameter name is silently ignored by Fygaro and left payments
    // unattributed — it must never come back.
    expect(uri).not.toContain("client_reference")
  })

  it("records the target wallet in client_note", async () => {
    await renderAndSettle({ wallet: "USD" })

    expect(lastWebViewProps().source.uri).toContain(
      `client_note=${encodeURIComponent("wallet:USD")}`,
    )
  })

  it("URL-encodes usernames that contain reserved characters", async () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: { me: { username: "álice+test" } },
      loading: false,
    })

    await renderAndSettle()

    const { uri } = lastWebViewProps().source
    expect(uri).toContain(`custom_reference=${encodeURIComponent("álice+test")}`)
  })
})

describe("CardPayment username gating", () => {
  it("does not mount the WebView while the username is still loading", async () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: undefined,
      loading: true,
      refetch: jest.fn(() => Promise.resolve()),
    })

    const { getAllByText } = renderCardPayment()

    expect(mockWebView).not.toHaveBeenCalled()
    expect(getAllByText(en.FygaroWebViewScreen.loading()).length).toBeGreaterThan(0)
  })

  it("shows the error screen instead of an unattributable payment when no username exists", async () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: { me: { username: null } },
      loading: false,
      refetch: jest.fn(() => Promise.resolve()),
    })

    const { getAllByText } = renderCardPayment()

    expect(mockWebView).not.toHaveBeenCalled()
    expect(getAllByText(en.FygaroWebViewScreen.error()).length).toBeGreaterThan(0)
  })

  it("Retry refetches the account query when the username never resolved", async () => {
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

describe("CardPayment header exit", () => {
  it("provides a persistent header Done button that navigates straight home", async () => {
    const { navigate, setOptions } = await renderAndSettle()

    const options = (setOptions as jest.Mock).mock.calls.at(-1)?.[0]
    expect(options?.headerRight).toBeDefined()

    const { getAllByText } = render(
      <ThemeProvider theme={theme}>{options.headerRight()}</ThemeProvider>,
    )
    fireEvent.press(getAllByText(en.PaymentSuccessScreen.done())[0])

    expect(navigate).toHaveBeenCalledWith("Primary")
  })

  it("keeps the header exit available while the username is still loading", async () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: undefined,
      loading: true,
      refetch: jest.fn(() => Promise.resolve()),
    })
    const { setOptions } = renderCardPayment()

    expect((setOptions as jest.Mock).mock.calls.at(-1)?.[0]?.headerRight).toBeDefined()
  })

  it("does not re-run the header effect on unrelated re-renders", async () => {
    const { setOptions } = await renderAndSettle()
    expect(setOptions).toHaveBeenCalledTimes(1)

    // A WebView load completing flips isLoading and re-renders the screen.
    // The header effect's deps are all referentially stable, so setOptions
    // must not fire again. (A makeStyles-derived dep breaks this: makeStyles
    // returns a fresh styles object every render, re-running the effect and
    // rebuilding the header on each render.)
    act(() => {
      lastWebViewProps().onLoadEnd()
    })

    expect(setOptions).toHaveBeenCalledTimes(1)
  })
})

describe("CardPayment navigation callbacks", () => {
  it("ignores navigation events for the payment-button URL itself, even when the username contains a trigger word", async () => {
    mockUseHomeAuthedQuery.mockReturnValue({
      data: { me: { username: "success-story" } },
      loading: false,
      refetch: jest.fn(() => Promise.resolve()),
    })
    const { navigate, goBack } = await renderAndSettle()

    const props = lastWebViewProps()
    expect(props.source.uri).toContain("success")
    props.onNavigationStateChange({ url: props.source.uri })

    expect(navigate).not.toHaveBeenCalled()
    expect(goBack).not.toHaveBeenCalled()
  })

  it("fires success when Fygaro returns to the payment-button URL with ?success=1 (real PayPal return shape)", async () => {
    const { navigate } = await renderAndSettle({ amount: 10, wallet: "USD" })

    lastWebViewProps().onNavigationStateChange({
      url: "https://www.fygaro.com/en/pb/bd4a34c1-3d24-4315-a2b8-627518f70916/?success=1&custom_reference=alice",
    })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("paymentSuccess", {
        amount: 10,
        wallet: "USD",
        // No fabricated id any more: the success screen asks the backend what
        // happened, and undefined here means the legacy device-built link (this
        // test's default), which has no checkout to ask about.
        checkoutId: undefined,
      }),
    )
  })

  it("fires the failure alert when Fygaro returns with ?success=0", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { navigate } = await renderAndSettle()

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
    const { navigate } = await renderAndSettle({ amount: 10, wallet: "USD" })

    lastWebViewProps().onNavigationStateChange({
      url: "https://www.fygaro.com/en/checkout/payment_success",
    })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("paymentSuccess", {
        amount: 10,
        wallet: "USD",
        // No fabricated id any more: the success screen asks the backend what
        // happened, and undefined here means the legacy device-built link (this
        // test's default), which has no checkout to ask about.
        checkoutId: undefined,
      }),
    )
  })
})
