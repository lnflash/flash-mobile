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
// echoed back), `remainingAllowance` and `expiresAt` were all selected and read
// nowhere: the screen already knows the amount it asked for, the refusal renders
// the server's sentence (which states the remaining allowance in words), and
// nothing watches the clock on the link. Every unused field is one more thing an
// older backend can reject the document over.
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
  | { kind: "signed"; url: string; checkoutId: string }
  | FygaroCheckoutRefusal
  // The server never answered at all — the network failed, the backend predates
  // the mutation, or the payload came back empty. Falling back to the
  // device-built URL keeps top-ups working exactly as they do today: worse than
  // a signed link, but a dead Top Up button would be worse than both.
  //
  // Note what is NOT here: an error the server DID return. See DEGRADE_CODES.
  | { kind: "unavailable" }

/**
 * The only error codes that may fall back to the legacy editable link.
 *
 * This is an allowlist of OUR faults, and it is deliberately inverted from what
 * it replaced. The previous version allowlisted the refusals it recognised and
 * degraded on everything else — which cannot be maintained from this side of the
 * wire, because the server owns the enum (flash `src/graphql/error-map.ts`) and
 * grows it without this file. It was already out of date: it had no
 * `FYGARO_ALLOWANCE_UNAVAILABLE`, the code the backend returns when it
 * deliberately fails CLOSED because it could not measure the allowance at all
 * (ERPNext settings/history unreadable, or the Redis reservation index down).
 * That unknown code fell through to "degrade", loaded the legacy `?amount=` URL,
 * and let the customer be charged during exactly the outage in which the server
 * had just refused to authorise — while the webhook, reading the same
 * unavailable data, 500s without crediting. Card captured, wallet not credited:
 * the 2026-08-16 incident, reproduced by the change meant to end it.
 *
 * Inverted, an unrecognised code is a refusal. The cost of getting that wrong is
 * a customer told to change their amount when they did not have to; the cost of
 * the other mistake is a charge we cannot credit.
 */
const DEGRADE_CODES = new Set(["FYGARO_CHECKOUT_DISABLED"])

export const useFygaroCheckout = () => {
  const [createCheckout] = useFygaroCheckoutCreateMutation()

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
      // Search the WHOLE array, not just the head. A refusal must win over
      // anything else the server happens to report alongside it: if a degradable
      // error sorted first, the caller would fall back to the legacy editable
      // link and the customer would be charged for a top-up the webhook then
      // refuses — the exact incident this hook exists to end.
      //
      // A missing code counts as a refusal too. The server declined to
      // authorise; not being able to name why is no reason to charge anyway.
      const refusal = errors.find((e) => !e.code || !DEGRADE_CODES.has(e.code))
      if (refusal) {
        return {
          kind: "refused",
          message: refusal.message,
          code: refusal.code ?? undefined,
        }
      }
      // Every error was one of ours (the feature is switched off). Degrade.
      if (errors.length > 0) return { kind: "unavailable" }

      const checkout = payload.checkout
      if (!checkout?.url || !checkout.checkoutId) return { kind: "unavailable" }

      return {
        kind: "signed",
        url: checkout.url,
        checkoutId: checkout.checkoutId,
      }
    },
    [createCheckout],
  )

  // Only what a caller uses. CardPayment models its own request status because
  // it must distinguish "asking" from "asked and fell back", which a bare
  // `loading` cannot express — so exporting one invites the wrong check.
  return { requestCheckout }
}
