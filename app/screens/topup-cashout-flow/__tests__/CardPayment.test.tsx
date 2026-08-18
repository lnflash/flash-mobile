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
jest.mock("@app/graphql/generated", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useCallback, useState } = require("react")
  return {
    useHomeAuthedQuery: (...args: unknown[]) => mockUseHomeAuthedQuery(...args),
    /**
     * A mutation hook that RE-RENDERS on invocation, like the real one.
     *
     * Apollo's `useMutation` calls `setResult({ loading: true })` synchronously
     * inside the mutate function (@apollo/client useMutation.js), so invoking a
     * mutation immediately re-renders the calling component. A mock returning a
     * constant `{ loading: false }` never does — and that difference hid a bug
     * that killed card top-ups outright: the checkout effect's dependency
     * changed on that re-render, the cleanup cancelled the in-flight request,
     * the answer was discarded, and the WebView never received a URL.
     *
     * Every CardPayment test now runs against a mutation that behaves like
     * production, so that class of bug fails CI instead of shipping.
     */
    useFygaroCheckoutCreateMutation: () => {
      const [loading, setLoading] = useState(false)
      const mutate = useCallback(async (...args: unknown[]) => {
        setLoading(true)
        try {
          return await mockCreateCheckout(...args)
        } finally {
          setLoading(false)
        }
      }, [])
      return [mutate, { loading }]
    },
  }
})

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

describe("CardPayment signed checkout", () => {
  const signed = (url: string, checkoutId: string, expiresAt?: number) => ({
    data: {
      fygaroCheckoutCreate: {
        errors: [],
        checkout: { url, checkoutId, expiresAt },
      },
    },
  })

  const refused = (message: string) => ({
    data: {
      fygaroCheckoutCreate: {
        errors: [{ code: "FYGARO_DAILY_ALLOWANCE_EXCEEDED", message }],
        checkout: null,
      },
    },
  })

  it("loads the SIGNED url and hands the server's checkoutId to the success screen", async () => {
    // The whole point of the mutation: the amount lives inside a JWT instead of
    // an editable query parameter, and the id is what lets the next screen ask
    // what actually happened instead of guessing from a redirect.
    mockCreateCheckout.mockResolvedValueOnce(
      signed("https://www.fygaro.com/en/pb/signed?jwt=abc", "intent-7"),
    )
    const { navigate } = await renderAndSettle({ amount: 60, wallet: "USD" })

    const { uri } = lastWebViewProps().source
    expect(uri).toBe("https://www.fygaro.com/en/pb/signed?jwt=abc")
    // The editable link must not be what loads when a signed one exists.
    expect(uri).not.toContain("custom_reference")

    lastWebViewProps().onNavigationStateChange({
      url: "https://www.fygaro.com/en/checkout/payment_success",
    })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("paymentSuccess", {
        amount: 60,
        wallet: "USD",
        checkoutId: "intent-7",
      }),
    )
  })

  it("sends the amount in CENTS", async () => {
    mockCreateCheckout.mockResolvedValueOnce(signed("https://x", "intent-7"))
    await renderAndSettle({ amount: 60 })

    expect(mockCreateCheckout).toHaveBeenCalledWith({
      variables: { input: { amount: 6000 } },
    })
  })

  it("asks exactly once, even though invoking the mutation re-renders the screen", async () => {
    // A fresh reservation per render would eat the customer's own daily
    // allowance while they sat on the screen looking at the form.
    mockCreateCheckout.mockResolvedValueOnce(signed("https://x", "intent-7"))
    await renderAndSettle()

    expect(mockCreateCheckout).toHaveBeenCalledTimes(1)
  })

  it("shows the loading spinner, NOT the error screen, while the request is in flight", async () => {
    // The error screen used to be the first paint of every card top-up: the
    // URL is null until the server answers, and the error branch was derived
    // from "no url". On a slow link the customer sat on "Something went wrong"
    // for the whole round trip.
    let answer: (value: unknown) => void = () => undefined
    mockCreateCheckout.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )

    const { getAllByText, queryAllByText } = renderCardPayment()

    expect(queryAllByText(en.FygaroWebViewScreen.error())).toHaveLength(0)
    expect(getAllByText(en.FygaroWebViewScreen.loading()).length).toBeGreaterThan(0)
    expect(mockWebView).not.toHaveBeenCalled()

    await act(async () => {
      answer(signed("https://www.fygaro.com/en/pb/signed?jwt=abc", "intent-7"))
    })

    expect(lastWebViewProps().source.uri).toBe(
      "https://www.fygaro.com/en/pb/signed?jwt=abc",
    )
  })

  it("shows the server's refusal and sends the customer back, charging nothing", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    mockCreateCheckout.mockResolvedValueOnce({
      data: {
        fygaroCheckoutCreate: {
          errors: [
            {
              code: "FYGARO_DAILY_ALLOWANCE_EXCEEDED",
              message: "You have $4.48 left of today's top-up limit",
            },
          ],
          checkout: null,
        },
      },
    })

    const { goBack } = renderCardPayment()
    await waitFor(() => expect(alertSpy).toHaveBeenCalled())

    // The server's wording, verbatim — it is the only side that knows which
    // threshold was tripped and by how much.
    expect(alertSpy).toHaveBeenCalledWith(
      en.TopupDetails.cannotTopUp(),
      "You have $4.48 left of today's top-up limit",
      expect.anything(),
    )
    // And nothing is loaded: a refusal before the card is charged is free.
    expect(mockWebView).not.toHaveBeenCalled()

    const [, , buttons] = alertSpy.mock.calls[0] as unknown as [
      string,
      string,
      { onPress: () => void }[],
    ]
    buttons[0].onPress()
    expect(goBack).toHaveBeenCalled()

    alertSpy.mockRestore()
  })

  it("leaves the refusal ON SCREEN, not only in an alert the back button can dismiss", async () => {
    // Alert.alert is cancelable by default on Android: the hardware back button
    // dismisses it without ever running the OK handler, so `goBack` never
    // fires. With the server's wording living only inside that alert, the
    // customer was left staring at the generic "Something went wrong" — reason
    // gone — next to a Retry that re-requested the identical amount and was
    // refused for the identical reason.
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    mockCreateCheckout.mockResolvedValueOnce(
      refused("You have $4.48 left of today's top-up limit"),
    )

    const { findAllByText, queryAllByText, getAllByText } = renderCardPayment()

    // The alert is deliberately never confirmed here — this is the dismissed
    // case. What is behind it has to stand on its own.
    const onScreen = await findAllByText("You have $4.48 left of today's top-up limit")
    expect(onScreen.length).toBeGreaterThan(0)
    expect(queryAllByText(en.FygaroWebViewScreen.error())).toHaveLength(0)
    expect(queryAllByText(en.FygaroWebViewScreen.retry())).toHaveLength(0)
    expect(getAllByText(en.TopupDetails.cannotTopUp()).length).toBeGreaterThan(0)

    alertSpy.mockRestore()
  })

  it("offers 'Change amount' instead of a Retry that cannot succeed", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    mockCreateCheckout.mockResolvedValueOnce(
      refused("You have $4.48 left of today's top-up limit"),
    )

    const { findAllByText, getAllByText, goBack } = renderCardPayment()
    await findAllByText("You have $4.48 left of today's top-up limit")

    fireEvent.press(getAllByText(en.TopupDetails.changeAmount())[0])

    expect(goBack).toHaveBeenCalled()
    // And it did NOT re-ask for the same amount on the way out: the second
    // request would be refused identically, and each one holds allowance.
    expect(mockCreateCheckout).toHaveBeenCalledTimes(1)

    alertSpy.mockRestore()
  })

  it("falls back to the legacy link when the checkout mutation throws (old backend)", async () => {
    mockCreateCheckout.mockRejectedValueOnce(new Error("Cannot query field"))

    await renderAndSettle()

    expect(lastWebViewProps().source.uri).toContain("custom_reference=alice")
  })
})

describe("CardPayment signed-link expiry", () => {
  const signedUntil = (expiresAt: number) => ({
    data: {
      fygaroCheckoutCreate: {
        errors: [],
        checkout: {
          url: "https://www.fygaro.com/en/pb/signed?jwt=abc",
          checkoutId: "i",
          expiresAt,
        },
      },
    },
  })

  afterEach(() => jest.useRealTimers())

  it("retires the link the moment it expires under the customer", async () => {
    // Past expiresAt the provider rejects the URL outright. Nothing used to
    // notice, so someone who stepped away came back and typed their card into a
    // form that could only fail, with no explanation on screen.
    jest.useFakeTimers()
    mockCreateCheckout.mockResolvedValueOnce(
      signedUntil(Math.floor(Date.now() / 1000) + 600),
    )

    const { queryAllByText, getAllByText, goBack } = renderCardPayment()
    await act(async () => {})

    // Still live: the WebView is mounted and nothing is claiming otherwise.
    expect(mockWebView).toHaveBeenCalled()
    expect(queryAllByText(en.FygaroWebViewScreen.expiredTitle())).toHaveLength(0)

    act(() => {
      jest.advanceTimersByTime(600_000)
    })

    expect(getAllByText(en.FygaroWebViewScreen.expiredTitle()).length).toBeGreaterThan(0)
    fireEvent.press(getAllByText(en.FygaroWebViewScreen.startAgain())[0])
    expect(goBack).toHaveBeenCalled()
  })

  it("says so straight away for a link that is already past its expiry", async () => {
    jest.useFakeTimers()
    mockCreateCheckout.mockResolvedValueOnce(
      signedUntil(Math.floor(Date.now() / 1000) - 60),
    )

    const { getAllByText } = renderCardPayment()
    await act(async () => {})
    act(() => {
      jest.advanceTimersByTime(1)
    })

    expect(getAllByText(en.FygaroWebViewScreen.expiredTitle()).length).toBeGreaterThan(0)
  })

  it("does not declare an absurdly distant expiry dead on arrival", async () => {
    // setTimeout coerces any delay past the 32-bit ceiling back into range and
    // fires it IMMEDIATELY — scheduling one would kill a perfectly good link
    // the instant it loaded.
    jest.useFakeTimers()
    mockCreateCheckout.mockResolvedValueOnce(
      signedUntil(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365),
    )

    const { queryAllByText } = renderCardPayment()
    await act(async () => {})
    act(() => {
      jest.advanceTimersByTime(5_000)
    })

    expect(queryAllByText(en.FygaroWebViewScreen.expiredTitle())).toHaveLength(0)
    expect(mockWebView).toHaveBeenCalled()
  })

  it("never starts the clock for a legacy link, which has no expiry to read", async () => {
    jest.useFakeTimers()
    // Default mock: signed checkout unavailable, so the device-built URL loads.
    const { queryAllByText } = renderCardPayment()
    await act(async () => {})
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000)
    })

    expect(queryAllByText(en.FygaroWebViewScreen.expiredTitle())).toHaveLength(0)
    expect(mockWebView).toHaveBeenCalled()
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
