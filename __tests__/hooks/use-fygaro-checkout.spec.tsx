import { renderHook } from "@testing-library/react-native"

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
