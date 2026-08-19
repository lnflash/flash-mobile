import { useCallback } from "react"
import { gql, type ApolloError } from "@apollo/client"

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
  // "The network failed" means no status line came back. A 5xx is NOT this: the
  // server answered, and what it answered was its own failure. See the catch
  // below.
  //
  // Note what is NOT here: an error the server DID return. See DEGRADE_CODES.
  | { kind: "unavailable" }
  // The request outlived its deadline. Kept apart from `unavailable` because
  // the server may have decided — and refused — without us hearing it, so this
  // must NOT degrade to the editable legacy link. Minted by the caller's
  // deadline, never by this hook.
  | { kind: "timedOut" }
  // The server DID answer, and its answer was a top-level GraphQL error rather
  // than a payload: the resolver threw instead of mapping the failure to a
  // code. Like `timedOut`, and unlike `unavailable`, this must not degrade to
  // the editable legacy link — the server refused to authorise, and the
  // webhook reading the same broken dependency will refuse to credit. Carries
  // no message because there is no sentence meant for a customer in a thrown
  // exception; the caller supplies localised copy.
  | { kind: "serverError" }

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
      } catch (e) {
        // Look at WHAT was thrown. A blanket degrade here contradicts the rule
        // stated above — "an error the server DID return" is not `unavailable`
        // — because `useMutation` has no errorPolicy set here and none is set
        // globally (app/graphql/client.tsx builds its ApolloClient with no
        // defaultOptions), so the default `errorPolicy: "none"` makes
        // `client.mutate` REJECT on top-level GraphQL errors, not only on a
        // dead network (@apollo/client/react/hooks/useMutation.js — the
        // `.then` builds an ApolloError from `response.errors` and throws it).
        //
        // That is the 2026-08-16 incident through the one door with no test:
        // ERPNext or Redis is down, the resolver throws instead of mapping to
        // FYGARO_ALLOWANCE_UNAVAILABLE, the mutate rejects — and degrading
        // loads the legacy editable `?amount=` link, the card is captured, and
        // the webhook (reading the same unavailable data) fails without
        // crediting.
        //
        // The inverted-allowlist argument that governs `payload.errors`
        // applies verbatim here: only OUR faults may degrade. A transport
        // failure — no status line at all — is ours. A document the backend
        // cannot parse or validate is ours (it predates this mutation, or we
        // rolled back). Anything else is the server having refused, and is
        // refused back.
        const err = e as ApolloError | undefined
        const graphQLErrors = err?.graphQLErrors ?? []

        // Splitting on `graphQLErrors` ALONE is not enough, because an HTTP
        // failure never populates it. Apollo turns EVERY response with
        // `status >= 300` into a `ServerError` on `networkError`
        // (@apollo/client/link/http/parseAndCheckHttpResponse.js) and
        // `throwServerError` (link/utils/throwServerError.js) stamps
        // `statusCode` on it — `graphQLErrors` stays `[]`. So a 502/503/504
        // from the ingress (restart, rolling deploy, OOM-killed pod), or a 500
        // out of a failed apollo-server-express context function — exactly what
        // an ERPNext or Redis failure UPSTREAM of the resolver produces — used
        // to land on the degrade path and hand over the editable `?amount=`
        // link with no pre-charge allowance check at all. Card captured, and
        // the webhook reading the same 5xx backend cannot credit it: the
        // 2026-08-16 incident, through the last door left open.
        //
        // `fygaroCheckoutCreate` is on `noRetryOperations` (it mints a
        // reservation), so the RetryLink no longer papers over a transient 502
        // either — the first one arrives straight here.
        const status = (err?.networkError as { statusCode?: number } | null)?.statusCode

        const schemaReject = graphQLErrors.some(
          (g) =>
            g.extensions?.code === "GRAPHQL_VALIDATION_FAILED" ||
            g.extensions?.code === "GRAPHQL_PARSE_FAILED",
        )
        // The server answered, and its answer was its own failure. Whatever is
        // broken behind a 5xx is the same thing the webhook must read before it
        // can credit, so refuse. 4xx deliberately still degrades: that is the
        // status an older backend rejects an unknown field with (apollo-server
        // answers a validation failure with 400), and degrading is the whole
        // reason the legacy link is still here.
        if (typeof status === "number" && status >= 500) return { kind: "serverError" }
        if (graphQLErrors.length > 0 && !schemaReject) return { kind: "serverError" }
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
