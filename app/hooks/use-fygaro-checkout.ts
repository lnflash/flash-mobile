import { gql } from "@apollo/client"

import { useFygaroCheckoutCreateMutation } from "@app/graphql/generated"

// Isolated from every other operation on purpose, for the same reason
// `cardTopupLimits` is: a backend that predates these fields — or a rollback —
// rejects the WHOLE document over one unknown field. Alone in here, an old
// backend costs us the signed URL and nothing else, and the caller falls back
// to the device-built link that has always worked.
gql`
  mutation fygaroCheckoutCreate($input: FygaroCheckoutCreateInput!) {
    fygaroCheckoutCreate(input: $input) {
      errors {
        message
        code
      }
      remainingAllowance
      checkout {
        url
        checkoutId
        expiresAt
        amount
      }
    }
  }
`

export type FygaroCheckoutRefusal = {
  kind: "refused"
  // Server wording, already phrased for the customer. Rendered as-is: it is the
  // only place that knows which threshold was tripped and by how much.
  message: string
  code?: string
  remainingAllowanceCents?: number
}

export type FygaroCheckoutResult =
  | { kind: "signed"; url: string; checkoutId: string }
  | FygaroCheckoutRefusal
  // The server could not authorise for a reason that is NOT about this
  // customer: the feature is switched off, the backend is older than the
  // mutation, or the network failed. Falling back to the device-built URL keeps
  // top-ups working exactly as they do today — worse than a signed link, but a
  // dead Top Up button would be worse than both.
  | { kind: "unavailable" }

// Refusals the customer caused, and can act on. Anything else is ours, and
// blocking their top-up over our own misconfiguration would be the wrong call.
const CUSTOMER_REFUSAL_CODES = new Set([
  "FYGARO_BELOW_MINIMUM",
  "FYGARO_ABOVE_SINGLE_PAYMENT_LIMIT",
  "FYGARO_DAILY_ALLOWANCE_EXCEEDED",
  "FYGARO_CHECKOUT_ALREADY_OPEN",
  "FYGARO_LEVEL_NOT_ELIGIBLE",
])

export const useFygaroCheckout = () => {
  const [createCheckout, { loading }] = useFygaroCheckoutCreateMutation()

  const requestCheckout = async (amountCents: number): Promise<FygaroCheckoutResult> => {
    let payload
    try {
      const { data } = await createCheckout({
        variables: { input: { amount: amountCents } },
      })
      payload = data?.fygaroCheckoutCreate
    } catch {
      // Network error, or a backend without this mutation. Neither is the
      // customer's problem and neither should stop them topping up.
      return { kind: "unavailable" }
    }

    if (!payload) return { kind: "unavailable" }

    const error = payload.errors?.[0]
    if (error) {
      const code = error.code ?? undefined
      if (code && CUSTOMER_REFUSAL_CODES.has(code)) {
        return {
          kind: "refused",
          message: error.message,
          code,
          remainingAllowanceCents: payload.remainingAllowance ?? undefined,
        }
      }
      return { kind: "unavailable" }
    }

    const checkout = payload.checkout
    if (!checkout?.url || !checkout.checkoutId) return { kind: "unavailable" }

    return { kind: "signed", url: checkout.url, checkoutId: checkout.checkoutId }
  }

  return { requestCheckout, requesting: loading }
}
