import { useCallback } from "react"
import { gql } from "@apollo/client"

import { useFygaroCheckoutCreateMutation } from "@app/graphql/generated"

// Isolated from every other operation on purpose, for the same reason
// `cardTopupLimits` is: a backend that predates these fields — or a rollback —
// rejects the WHOLE document over one unknown field. Alone in here, an old
// backend costs us the signed URL and nothing else, and the caller falls back
// to the device-built link that has always worked.
//
// Only the fields the caller actually uses. `amount` (the authorised cents,
// echoed back) and `remainingAllowance` were both selected and read nowhere:
// the screen already knows the amount it asked for, and the refusal renders the
// server's sentence, which states the remaining allowance in words. Every
// unused field is one more thing an older backend can reject the document over.
gql`
  mutation fygaroCheckoutCreate($input: FygaroCheckoutCreateInput!) {
    fygaroCheckoutCreate(input: $input) {
      errors {
        message
        code
      }
      checkout {
        url
        checkoutId
        expiresAt
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
}

export type FygaroCheckoutResult =
  // `expiresAtSeconds` is seconds since epoch, and it is load-bearing rather
  // than decoration: past it the payment provider rejects the URL outright. A
  // customer who left the WebView open would otherwise be typing card details
  // into a page that can only fail, with nothing on screen saying why.
  //
  // Optional despite the schema marking it non-null, because a client that
  // crashes — or worse, computes a NaN deadline and declares the link dead on
  // arrival — over a field the server did not send is a worse failure than one
  // that simply stops watching the clock.
  | { kind: "signed"; url: string; checkoutId: string; expiresAtSeconds?: number }
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

  // MUST stay referentially stable. Apollo's `useMutation` calls
  // `setResult({ loading: true })` synchronously the moment the mutate function
  // is invoked, which re-renders every consumer of this hook. A plain arrow here
  // would hand the caller a NEW function on that re-render — and CardPayment's
  // checkout effect depends on it, so the effect would tear down and cancel the
  // very request it had just started, leaving the WebView with no URL forever.
  const requestCheckout = useCallback(
    async (amountCents: number): Promise<FygaroCheckoutResult> => {
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

      const errors = payload.errors ?? []
      // Search the WHOLE array, not just the head. A refusal the customer can
      // act on must win over anything else the server happens to report
      // alongside it: if an unrelated error sorted first, the caller would fall
      // back to the legacy editable link and the customer would be charged for
      // a top-up the webhook then refuses — the exact incident this hook exists
      // to end.
      const refusal = errors.find((e) => e.code && CUSTOMER_REFUSAL_CODES.has(e.code))
      if (refusal?.code) {
        return { kind: "refused", message: refusal.message, code: refusal.code }
      }
      // Errors, but none of them the customer's to fix. Ours — degrade.
      if (errors.length > 0) return { kind: "unavailable" }

      const checkout = payload.checkout
      if (!checkout?.url || !checkout.checkoutId) return { kind: "unavailable" }

      return {
        kind: "signed",
        url: checkout.url,
        checkoutId: checkout.checkoutId,
        expiresAtSeconds: checkout.expiresAt ?? undefined,
      }
    },
    [createCheckout],
  )

  return { requestCheckout, requesting: loading }
}
