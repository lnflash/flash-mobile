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
          checkout: { url: "https://fygaro.com/en/pb/x?jwt=abc", checkoutId: "intent-1" },
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
          remainingAllowance: 448,
        },
      },
    })

    expect(await ask(8000)).toEqual({
      kind: "refused",
      code: "FYGARO_DAILY_ALLOWANCE_EXCEEDED",
      message: "You have $4.48 left of today's top-up limit",
      remainingAllowanceCents: 448,
    })
  })

  it("treats OUR faults as unavailable, so the top-up is not blocked", async () => {
    // Signed checkout being switched off is not the customer's problem. Blocking
    // their top-up over our own config would be a worse outcome than the
    // editable link they have always had.
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
