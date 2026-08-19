import { renderHook } from "@testing-library/react-native"
import { ApolloError } from "@apollo/client"

const mockCreateCheckout = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  useFygaroCheckoutCreateMutation: () => [mockCreateCheckout, { loading: false }],
}))

import { useFygaroCheckout } from "@app/hooks/use-fygaro-checkout"

const ask = async (amountCents = 6000) => {
  const { result } = renderHook(() => useFygaroCheckout())
  return result.current.requestCheckout(amountCents)
}

beforeEach(() => jest.clearAllMocks())

describe("useFygaroCheckout", () => {
  it("returns the signed url and the id to poll on", async () => {
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [],
          checkout: {
            url: "https://fygaro.com/en/pb/x?jwt=abc",
            checkoutId: "intent-1",
          },
        },
      },
    })

    expect(await ask()).toEqual({
      kind: "signed",
      url: "https://fygaro.com/en/pb/x?jwt=abc",
      checkoutId: "intent-1",
    })
  })

  it("sends the amount in CENTS", async () => {
    // The mutation takes CentAmount. Sending dollars would authorise $60.00 as
    // 60 cents and sign a link for the wrong number.
    mockCreateCheckout.mockResolvedValue({
      data: { fygaroCheckoutCreate: { errors: [] } },
    })

    await ask(6000)

    expect(mockCreateCheckout).toHaveBeenCalledWith({
      variables: { input: { amount: 6000 } },
    })
  })

  it("passes a customer-caused refusal through with the server's wording", async () => {
    // The server is the only side that knows which threshold was tripped and by
    // how much, so its sentence is rendered as-is rather than re-worded here.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [
            {
              code: "FYGARO_DAILY_ALLOWANCE_EXCEEDED",
              message: "You have $4.48 left of today's top-up limit",
            },
          ],
        },
      },
    })

    expect(await ask(8000)).toEqual({
      kind: "refused",
      code: "FYGARO_DAILY_ALLOWANCE_EXCEEDED",
      message: "You have $4.48 left of today's top-up limit",
    })
  })

  it("finds the refusal even when a degradable error is listed first", async () => {
    // Only the head of the array used to be inspected. A degradable error sorted
    // ahead of the refusal handed the customer the legacy editable link and let
    // them pay for a top-up the webhook then refused — money captured, wallet
    // uncredited, which is the precise incident this hook exists to end.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [
            { code: "FYGARO_CHECKOUT_DISABLED", message: "unavailable" },
            {
              code: "FYGARO_DAILY_ALLOWANCE_EXCEEDED",
              message: "You have $4.48 left of today's top-up limit",
            },
          ],
        },
      },
    })

    expect(await ask(8000)).toEqual({
      kind: "refused",
      code: "FYGARO_DAILY_ALLOWANCE_EXCEEDED",
      message: "You have $4.48 left of today's top-up limit",
    })
  })

  it("REFUSES when the server could not measure the allowance", async () => {
    // FYGARO_ALLOWANCE_UNAVAILABLE is the backend deliberately failing CLOSED:
    // ERPNext settings/history unreadable, or the Redis reservation index down,
    // so it cannot tell whether this top-up is within the limit
    // (flash src/graphql/public/root/mutation/fygaro-checkout-create.ts). It was
    // missing from the old hand-copied allowlist, so it degraded to the legacy
    // editable link and the customer was charged during exactly the outage the
    // server had just refused for — while the webhook, reading the same
    // unavailable data, 500s without crediting.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [
            {
              code: "FYGARO_ALLOWANCE_UNAVAILABLE",
              message: "Could not check your top-up allowance right now",
            },
          ],
        },
      },
    })

    expect(await ask()).toEqual({
      kind: "refused",
      code: "FYGARO_ALLOWANCE_UNAVAILABLE",
      message: "Could not check your top-up allowance right now",
    })
  })

  it("refuses on a code it has never heard of, rather than charging anyway", async () => {
    // The server owns this enum and grows it without this file, so an allowlist
    // of recognised refusals fails OPEN on every code added upstream. Inverted,
    // an unknown code costs a customer an unnecessary "change the amount"; the
    // other way round it costs them a charge we cannot credit.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [
            { code: "FYGARO_SOME_FUTURE_REFUSAL", message: "We can't do that yet" },
          ],
        },
      },
    })

    expect(await ask()).toEqual({
      kind: "refused",
      code: "FYGARO_SOME_FUTURE_REFUSAL",
      message: "We can't do that yet",
    })
  })

  it("refuses on an error with no code at all", async () => {
    // The server declined to authorise. Not being able to name why is no reason
    // to send the customer to the editable link and charge them anyway.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [{ message: "Something went wrong" }],
        },
      },
    })

    expect(await ask()).toEqual({
      kind: "refused",
      code: undefined,
      message: "Something went wrong",
    })
  })

  it("treats the feature being switched OFF as unavailable, so the top-up is not blocked", async () => {
    // The one error that is ours alone. Signed checkout being disabled is not
    // the customer's problem, and it says nothing about their allowance —
    // blocking their top-up over our own config would be a worse outcome than
    // the editable link they have always had.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [{ code: "FYGARO_CHECKOUT_DISABLED", message: "unavailable" }],
        },
      },
    })

    expect(await ask()).toEqual({ kind: "unavailable" })
  })

  it("treats a backend without the mutation as unavailable, not an error", async () => {
    // An older backend rejects the document outright. The app must degrade,
    // because this ships before the backend everywhere except our own cluster.
    mockCreateCheckout.mockRejectedValue(new Error("Cannot query field"))

    expect(await ask()).toEqual({ kind: "unavailable" })
  })

  it("still degrades when an OLD BACKEND rejects the document by schema validation", async () => {
    // The rejection an old backend actually produces, in the shape Apollo
    // delivers it: a top-level GraphQL error carrying GRAPHQL_VALIDATION_FAILED.
    // This one is OUR fault (we shipped a document the server predates), so it
    // is the case the fallback exists for and must keep degrading — otherwise
    // every instance running an older backend loses card top-ups entirely.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [
        {
          message: 'Cannot query field "fygaroCheckoutCreate" on type "Mutation".',
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        },
      ],
    })

    expect(await ask()).toEqual({ kind: "unavailable" })
  })

  it("REFUSES when the server throws instead of answering — the door with no test", async () => {
    // `useMutation` here has no errorPolicy and none is set globally
    // (app/graphql/client.tsx builds its ApolloClient with no defaultOptions),
    // so the default `errorPolicy: "none"` makes client.mutate REJECT whenever
    // the response carries top-level GraphQL errors — not only when the network
    // died. ERPNext or Redis down means the resolver throws instead of mapping
    // to FYGARO_ALLOWANCE_UNAVAILABLE, and blanket-degrading there loaded the
    // legacy editable `?amount=` link: the card is captured and the webhook,
    // reading the same unavailable data, fails without crediting. That is the
    // 2026-08-16 incident, reached through the one path the payload branch
    // above does not cover.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [
        { message: "Unexpected error", extensions: { code: "INTERNAL_SERVER_ERROR" } },
      ],
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("refuses on a top-level error with no extensions at all", async () => {
    // Same rule as the payload branch: the server declined to authorise, and
    // not being able to name why is no reason to charge anyway.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [{ message: "Something went wrong" }],
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("degrades on a pure transport failure, which carries no graphQLErrors", async () => {
    // A dead network says nothing about the customer's allowance, and the
    // legacy link is exactly the status quo there. Note what it does NOT carry:
    // a `statusCode`. Nothing answered, so there is no status line — which is
    // precisely what separates this from the 5xx case below.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: new Error("Network request failed"),
    })

    expect(await ask()).toEqual({ kind: "unavailable" })
  })

  it("REFUSES on a 5xx, which arrives with NO graphQLErrors at all", async () => {
    // The shape Apollo actually delivers an HTTP failure in: every response
    // with `status >= 300` becomes a ServerError on `networkError`
    // (@apollo/client/link/http/parseAndCheckHttpResponse.js) with
    // `statusCode` stamped on it by throwServerError, and `graphQLErrors`
    // stays EMPTY. So splitting on `graphQLErrors` alone sent a 502/503/504
    // from the ingress — or a 500 from a failed apollo-server context
    // function, which is what an ERPNext/Redis failure upstream of the
    // resolver produces — straight down the degrade path, into the editable
    // `?amount=` link with no pre-charge allowance check. The card is
    // captured; the webhook, reading the same 5xx backend, cannot credit it.
    //
    // `fygaroCheckoutCreate` is on `noRetryOperations` (it mints a
    // reservation), so the RetryLink no longer hides a transient 502 either:
    // the first one lands here.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(
        new Error("Response not successful: Received status code 502"),
        { statusCode: 502 },
      ),
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("REFUSES on a 429, which is the gateway answering too", async () => {
    // The rule is "an error the server DID return is a refusal", and for a
    // while it only held for 5xx. Every other status the server answers with
    // arrives in the identical shape — a ServerError on `networkError` with an
    // EMPTY `graphQLErrors` — so a rate-limited checkout fell through to
    // `unavailable` and CardPayment loaded `buildLegacyPaymentUrl`: the
    // editable `?amount=` link, with no pre-charge allowance check at all.
    //
    // `fygaroCheckoutCreate` is on `noRetryOperations` (it mints a
    // reservation), so the 429 is not retried away — the first one lands here,
    // the app degrades, and the customer is charged for an over-limit top-up
    // the webhook then parks in HELD_FOR_REVIEW. That is the 2026-08-16
    // incident, reproduced through a status nobody was checking.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(
        new Error("Response not successful: Received status code 429"),
        { statusCode: 429 },
      ),
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("REFUSES on a 403, and on the 401 a revoked token produces", async () => {
    // The persisted cache is what makes this reachable: `useHomeAuthedQuery`
    // serves the username `cache-first`, so the screen still looks signed in
    // while the token behind it is dead. Degrading there hands that customer
    // the editable link on an account nothing has authorised.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    })
    expect(await ask()).toEqual({ kind: "serverError" })

    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    })
    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("still degrades on the 400 an OLD BACKEND rejects an unknown field with", async () => {
    // The rollback path, pinned. apollo-server answers a validation failure
    // with HTTP 400, so it too arrives as a ServerError with an empty
    // `graphQLErrors` — the real errors are inside `networkError.result`, which
    // is why the hook has to READ that body rather than trust the status. This
    // one IS our fault (we shipped a document the server predates), so it must
    // keep degrading, or every instance on an older backend loses card top-ups
    // outright the moment the other statuses start refusing.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(
        new Error("Response not successful: Received status code 400"),
        {
          statusCode: 400,
          result: {
            errors: [
              {
                message: 'Cannot query field "fygaroCheckoutCreate" on type "Mutation".',
              },
            ],
          },
        },
      ),
    })

    expect(await ask()).toEqual({ kind: "unavailable" })
  })

  it("degrades on the 400 an old backend produces with a PARSE/VALIDATION code", async () => {
    // The same rejection as above in the other shape apollo-server sends it:
    // the reason in `extensions.code` rather than spelled out in the message.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(new Error("Bad Request"), {
        statusCode: 400,
        result: {
          errors: [
            {
              message: "Syntax Error: Unexpected Name.",
              extensions: { code: "GRAPHQL_PARSE_FAILED" },
            },
          ],
        },
      }),
    })

    expect(await ask()).toEqual({ kind: "unavailable" })
  })

  it("REFUSES on a 400 that is NOT a schema rejection", async () => {
    // The negative twin of the test above, and the whole reason the 400 branch
    // reads the body instead of the status. A 400 is not automatically "the
    // backend predates this mutation" — it is also what a gateway answers a
    // malformed or rate-limited request with, and treating every 400 as our own
    // fault is the same fail-OPEN the 5xx-only rule was. Degrading here would
    // hand over the editable `?amount=` link on a request the server refused.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(
        new Error("Response not successful: Received status code 400"),
        {
          statusCode: 400,
          result: { errors: [{ message: "Rate limit exceeded" }] },
        },
      ),
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("REFUSES on a 400 with no readable body at all", async () => {
    // Nothing proves this was our document being rejected, so the inverted rule
    // applies: an answer we cannot positively identify as our fault is the
    // server having refused.
    mockCreateCheckout.mockRejectedValue({
      graphQLErrors: [],
      networkError: Object.assign(new Error("Bad Request"), { statusCode: 400 }),
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("REFUSES when the mutation RESOLVES carrying an ApolloError instead of rejecting", async () => {
    // Every refusal above reaches the catch block because `createCheckout`
    // REJECTS — and Apollo stops rejecting the moment anyone adds an `onError`.
    // `useMutation`'s own catch returns `{ data: undefined, errors: error }`
    // rather than rethrowing whenever an onError exists on either the hook
    // options or the execute options
    // (@apollo/client/react/hooks/useMutation.js). So one line —
    // `useFygaroCheckoutCreateMutation({ onError })`, added for Sentry or for a
    // log, by someone who never opened this file — would send every 5xx, 429,
    // 403 and thrown resolver past the catch to `!payload`, answer
    // `unavailable`, and put CardPayment back on `buildLegacyPaymentUrl`: the
    // editable `?amount=` link with no pre-charge allowance check. The card is
    // captured; the webhook, reading the same broken dependency, cannot credit
    // it. A control that inverts silently on a benign edit in another file is
    // not a control, so the RESOLVED envelope is read too.
    mockCreateCheckout.mockResolvedValue({
      data: undefined,
      errors: new ApolloError({ errorMessage: "Unexpected error" }),
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("REFUSES on a resolved response whose top-level errors array is populated", async () => {
    // The other shape the envelope carries errors in: a plain `FetchResult`
    // `errors` array, which is what any non-`none` errorPolicy delivers. Same
    // rule, same answer — the server ANSWERED with a failure, so it is refused
    // rather than degraded, whichever route the answer arrived by.
    mockCreateCheckout.mockResolvedValue({
      data: { fygaroCheckoutCreate: null },
      errors: [
        {
          message: "Unexpected error",
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        },
      ],
    })

    expect(await ask()).toEqual({ kind: "serverError" })
  })

  it("still signs when the resolved envelope carries an EMPTY errors array", async () => {
    // The negative twin, and the reason the envelope check asks for CONTENT
    // rather than truthiness: `[]` is truthy in JS, so reading a bare `errors`
    // as a refusal would fail CLOSED on every single top-up the moment anything
    // started reporting an empty array. Fail-closed is the right direction for
    // an answer; it is not a licence to refuse an answer that said nothing.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [],
          checkout: {
            url: "https://fygaro.com/en/pb/x?jwt=abc",
            checkoutId: "intent-1",
          },
        },
      },
      errors: [],
    })

    expect(await ask()).toEqual({
      kind: "signed",
      url: "https://fygaro.com/en/pb/x?jwt=abc",
      checkoutId: "intent-1",
    })
  })

  it("treats a success payload with no url as unavailable", async () => {
    // Never hand a null url to the WebView and call it signed.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: { errors: [], checkout: { url: null, checkoutId: "x" } },
      },
    })

    expect(await ask()).toEqual({ kind: "unavailable" })
  })

  it("treats a checkout with no id as unavailable", async () => {
    // Without an id there is nothing to poll, and a url whose outcome we cannot
    // report puts us straight back to guessing.
    mockCreateCheckout.mockResolvedValue({
      data: {
        fygaroCheckoutCreate: {
          errors: [],
          checkout: { url: "https://x", checkoutId: null },
        },
      },
    })

    expect(await ask()).toEqual({ kind: "unavailable" })
  })
})
