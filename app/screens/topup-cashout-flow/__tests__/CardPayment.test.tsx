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
  const signed = (url: string, checkoutId: string) => ({
    data: {
      fygaroCheckoutCreate: {
        errors: [],
        checkout: { url, checkoutId },
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

  it("REFUSES when the server throws instead of answering, rather than handing over the editable link", async () => {
    // ERPNext or Redis down: the resolver throws instead of mapping the failure
    // to a code, so the mutate rejects with a top-level GraphQL error. Degrading
    // there loads the legacy `?amount=` link, the card is captured, and the
    // webhook — reading the same unavailable data — fails without crediting.
    mockCreateCheckout.mockRejectedValueOnce({
      graphQLErrors: [
        { message: "Unexpected error", extensions: { code: "INTERNAL_SERVER_ERROR" } },
      ],
    })

    const { findAllByText, queryAllByText, getAllByText, goBack } = renderCardPayment()

    expect(
      (await findAllByText(en.TopupDetails.checkoutFailed())).length,
    ).toBeGreaterThan(0)
    expect(mockWebView).not.toHaveBeenCalled()

    // ...and it does NOT blame the amount. The body says "We couldn't set up
    // your payment — please try again"; putting that under "Can't top up this
    // amount", above a button whose only label is "Change amount", tells a
    // customer their $50 is the problem while ERPNext is down. They try $40,
    // then $30, hit the identical server error each time, and conclude their
    // account is limited.
    expect(getAllByText(en.TopupDetails.checkoutProblemTitle()).length).toBeGreaterThan(0)
    expect(queryAllByText(en.TopupDetails.cannotTopUp())).toHaveLength(0)
    expect(queryAllByText(en.TopupDetails.changeAmount())).toHaveLength(0)

    // The action agrees with the sentence: try again, from the amount screen.
    fireEvent.press(getAllByText(en.FygaroWebViewScreen.retry())[0])
    expect(goBack).toHaveBeenCalled()
  })

  it("REFUSES on a 5xx instead of handing over the editable link", async () => {
    // The same incident through the HTTP door rather than the GraphQL one. An
    // ingress restart, a rolling deploy, an OOM-killed pod, or a 500 out of a
    // failed apollo-server context function all arrive as a ServerError on
    // `networkError` with an EMPTY `graphQLErrors`
    // (@apollo/client/link/http/parseAndCheckHttpResponse.js), so splitting on
    // `graphQLErrors` alone degraded here — loading `buildLegacyPaymentUrl`,
    // the editable `?amount=` link with no pre-charge allowance check. The
    // customer pays; the webhook, reading the same 5xx backend, cannot credit.
    mockCreateCheckout.mockRejectedValueOnce({
      graphQLErrors: [],
      networkError: Object.assign(
        new Error("Response not successful: Received status code 502"),
        { statusCode: 502 },
      ),
    })

    const { findAllByText } = renderCardPayment()

    expect(
      (await findAllByText(en.TopupDetails.checkoutFailed())).length,
    ).toBeGreaterThan(0)
    // Nothing loaded at all — least of all the editable link.
    expect(mockWebView).not.toHaveBeenCalled()
  })

  it("does not let a throw AFTER the refusal replace it with the editable link", async () => {
    // The outer `run().catch(...)` sits downstream of the branch that must fail
    // closed: the refusal writes its state and only THEN calls Alert.alert, so
    // anything throwing after the write used to land in a catch that set
    // `{status:"ready", url: legacyPaymentUrl}` — handing the customer the
    // editable link the server had just refused. Alert.alert throwing stands in
    // for any post-write failure.
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {
      throw new Error("alert exploded")
    })
    mockCreateCheckout.mockResolvedValueOnce(
      refused("You have $4.48 left of today's top-up limit"),
    )

    const { findAllByText, queryAllByText } = renderCardPayment()

    // Still a refusal, and still nothing loaded: the customer is not charged.
    // The catch writes the same "we couldn't set this up" copy the serverError
    // branch does, so it gets the same headline and the same button — the point
    // being that the WebView never mounts, not which of the two refusal
    // headlines is showing.
    expect(
      (await findAllByText(en.TopupDetails.checkoutFailed())).length,
    ).toBeGreaterThan(0)
    expect(queryAllByText(en.TopupDetails.checkoutProblemTitle()).length).toBeGreaterThan(
      0,
    )
    expect(mockWebView).not.toHaveBeenCalled()
    expect(queryAllByText(en.FygaroWebViewScreen.error())).toHaveLength(0)

    alertSpy.mockRestore()
  })

  it("falls back to the legacy link when the request never settles AT ALL", async () => {
    // A hang is not an error, and nothing under this mutation will ever turn it
    // into one: Apollo's HttpLink is constructed bare (no fetchOptions, no
    // AbortController) and RetryLink only retries on an `error`, which a hang
    // never produces. React Native sets no default network timeout on Android
    // either. So on a stalled connection the promise neither resolves nor
    // rejects, the try/catch inside use-fygaro-checkout never fires, and
    // without a deadline `checkout` stays "requesting" forever — a permanent
    // "Loading…" with no WebView, no error screen and no Retry. That is a
    // REGRESSION on the behaviour this screen had before the signed link: the
    // URL was built synchronously, so the same dead network reached the
    // WebView's own onError and its working Retry.
    jest.useFakeTimers()
    try {
      mockCreateCheckout.mockImplementationOnce(
        () =>
          new Promise(() => {
            // Never settles: the hang a stalled connection actually produces.
          }),
      )

      const screen = renderCardPayment({ amount: 25 })
      const { getAllByText } = screen

      // In flight: the spinner, and nothing loaded.
      expect(getAllByText(en.FygaroWebViewScreen.loading()).length).toBeGreaterThan(0)
      expect(mockWebView).not.toHaveBeenCalled()

      await act(async () => {
        jest.advanceTimersByTime(11_000)
      })

      // Past the deadline the customer gets a definite answer — and it is a
      // REFUSAL, not the editable legacy link. A timeout is not "the server has
      // no opinion": it may have decided, and refused, and we simply did not
      // wait to hear it. Handing over an editable link there would charge
      // someone the backend was in the middle of protecting.
      const { queryAllByText } = screen
      expect(mockWebView).not.toHaveBeenCalled()
      expect(queryAllByText(en.TopupDetails.checkoutTimedOut()).length).toBeGreaterThan(0)

      // And the refusal does not blame the amount, which nothing ever judged:
      // "check your connection and try again" under "Can't top up this amount",
      // above a "Change amount" button, contradicts itself on a money screen.
      expect(
        queryAllByText(en.TopupDetails.checkoutProblemTitle()).length,
      ).toBeGreaterThan(0)
      expect(queryAllByText(en.TopupDetails.cannotTopUp())).toHaveLength(0)
      expect(queryAllByText(en.TopupDetails.changeAmount())).toHaveLength(0)
      expect(queryAllByText(en.FygaroWebViewScreen.retry()).length).toBeGreaterThan(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it("does not wait out the deadline when the server answers promptly", async () => {
    // The deadline must not become the latency: a signed link that arrives in
    // time is loaded in time.
    jest.useFakeTimers()
    try {
      mockCreateCheckout.mockResolvedValueOnce(
        signed("https://www.fygaro.com/en/pb/signed?jwt=abc", "intent-7"),
      )

      renderCardPayment()
      await act(async () => {
        jest.advanceTimersByTime(0)
      })

      expect(lastWebViewProps().source.uri).toBe(
        "https://www.fygaro.com/en/pb/signed?jwt=abc",
      )
    } finally {
      jest.useRealTimers()
    }
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
      en.FygaroWebViewScreen.paymentFailedTitle(),
      en.FygaroWebViewScreen.paymentFailedMessage(),
      expect.anything(),
    )
    alertSpy.mockRestore()
  })

  it("localises the failure alert instead of hard-coding English", async () => {
    // Every other payment-outcome message on this flow was translated across
    // `en` and 23 locale files; this one — the FAILURE counterpart — was left
    // as a raw literal, which fixes the screen for English speakers only. The
    // keys must resolve, and must not be the old literals by accident.
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    await renderAndSettle()

    lastWebViewProps().onNavigationStateChange({
      url: "https://www.fygaro.com/en/pb/bd4a34c1-3d24-4315-a2b8-627518f70916/?success=0",
    })

    const [title, message, buttons] = alertSpy.mock.calls[0] as unknown as [
      string,
      string,
      { text: string }[],
    ]
    expect(title).not.toBe("")
    expect(message).not.toBe("")
    // The OK button too — it used to be a bare "OK" literal next to a
    // localised alert everywhere else on this screen.
    expect(buttons[0].text).toBe(en.common.ok())

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
