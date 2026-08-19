import { useCallback } from "react"
import { gql, NetworkStatus } from "@apollo/client"

import { useFygaroTopupAllowanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// Isolated, like every other card-top-up operation: a backend without these
// fields rejects the whole document, and losing the allowance must degrade to
// "show the flat cap" rather than break the screen.
//
// Only the fields the screen actually renders. `spent` and `resetsAt` were
// queried and converted here and then displayed nowhere at all.
gql`
  query fygaroTopupAllowance {
    fygaroTopupAllowance {
      limit
      held
      remaining
      holdsExpireAt
    }
  }
`

export type CardTopupAllowance = {
  limitCents: number
  // Unpaid checkout links. NOT spent — nothing has been charged — but not
  // available either. Rendered separately because "you've spent $0 and have $65
  // of $125" is otherwise unexplainable to the person reading it.
  heldCents: number
  remainingCents: number
  // When those holds lapse and the held amount comes back. Rendered under the
  // held line: it is the whole answer to "when do I get the rest back?".
  holdsExpireAt?: Date
}

/**
 * What this account may still top up today, as the backend computes it.
 *
 * `undefined` means "cannot be established" — not signed in, an older backend,
 * card top-ups switched off, or ERPNext unreadable. Callers must fall back to
 * showing the flat per-level cap and must NOT treat undefined as "no limit":
 * the pre-charge check still refuses, and the webhook still refuses after that.
 *
 * `network-only` on purpose. A cached allowance is a stale allowance, and this
 * number's whole job is to stop the app inviting a top-up that will be refused.
 *
 * `skip` exists because this is the CARD allowance and nothing else. Firing it
 * on a bank-transfer or Bridge screen costs a round trip and — worse — invites
 * the caller to apply a card limit to a rail that has entirely different ones.
 *
 * `refetch` exists because this number goes stale the moment the customer
 * leaves the screen. Asking for a checkout MINTS a reservation, so someone who
 * enters $60 against $65 remaining and then comes back — refused, or simply
 * having backed out of the payment page — is looking at a figure that is now
 * $60 too high, on a screen that never unmounted. Without a refresh the app
 * invites the very top-up it is about to refuse, which is the failure this
 * whole allowance exists to end.
 *
 * `notifyOnNetworkStatusChange` is what makes that refresh visible. Without it
 * Apollo keeps serving the PREVIOUS `data` and never flips `loading` during a
 * refetch, so the refresh closes only half the loop: for the whole round trip
 * after the customer returns from a refusal the screen still renders the old
 * figure and still gates against it, and tapping Continue in that window —
 * precisely what someone just told to change their amount does — is waved
 * through into another reservation the server refuses.
 */
export const useCardTopupAllowance = ({ skip = false }: { skip?: boolean } = {}) => {
  const isAuthed = useIsAuthed()
  const skipped = skip || !isAuthed
  const { data, loading, refetch, networkStatus } = useFygaroTopupAllowanceQuery({
    skip: skipped,
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  })

  /**
   * Re-ask for the allowance. Safe to call from anywhere, which is the point of
   * wrapping Apollo's own `refetch`:
   *
   * - It is a no-op while the query is skipped. Apollo's `refetch` ignores
   *   `skip` and fires the request anyway, so an unguarded one would ask for the
   *   CARD allowance on a bank-transfer screen — or while signed out.
   * - It swallows rejections. `refetch` rejects on a network error; nothing here
   *   can act on that (the screen keeps whatever figure it already had), but an
   *   unhandled rejection out of a focus handler is a red screen in dev.
   */
  const refresh = useCallback(() => {
    if (skipped) return
    Promise.resolve(refetch?.()).catch(() => undefined)
  }, [skipped, refetch])

  const raw = data?.fygaroTopupAllowance
  const allowance: CardTopupAllowance | undefined = raw
    ? {
        limitCents: raw.limit,
        heldCents: raw.held,
        remainingCents: raw.remaining,
        holdsExpireAt: raw.holdsExpireAt ? new Date(raw.holdsExpireAt * 1000) : undefined,
      }
    : undefined

  /**
   * A refetch is in flight and `allowance` above is therefore the OLD figure.
   * Exposed separately from `loading` because the two say different things and
   * callers need both: `loading && !allowance` is "we have never had a number",
   * while this is "the number on screen is about to be replaced". Callers that
   * gate money on the figure must hold on either.
   */
  const refreshing = networkStatus === NetworkStatus.refetch

  /**
   * A refresh was asked for and did NOT land, so `allowance` above is a figure
   * we know to be superseded and will not be corrected on its own.
   *
   * This is the failure door `refreshing` leaves open, and it is the refetch's
   * MOST LIKELY outcome, not an exotic one. A refetch that rejects never passes
   * through `NetworkStatus.refetch`: Apollo routes it via
   * `ObservableQuery.reportError` into useQuery's observer error handler, which
   * sets `{ data: previousResult.data, error, loading: false, networkStatus:
   * NetworkStatus.error }` (@apollo/client/react/hooks/useQuery.js). So the
   * PRE-reservation figure is still served, `loading` is false, and `refreshing`
   * is false — a screen gating money on it cannot tell the difference between
   * "fresh" and "the refresh we fired on focus died on the wire".
   *
   * Concretely, and this is the exact loop the on-focus refetch exists to close:
   * L1, $125 cap, nothing held. The customer enters $60, Continue mints a $60
   * server hold, they back out of the Fygaro page. The focus refetch fires, their
   * connection drops for that one round trip, and it rejects (swallowed by the
   * `.catch` in `refresh` above). Without this flag the screen re-renders
   * "$125.00 of $125.00 left today", shows no held line, gates Continue against
   * $125, waves through another $65 — a SECOND hold, $125 held, $0 available —
   * and the customer is locked out of card top-ups until both holds lapse.
   *
   * The `allowance` half is what separates a failed REFRESH from a failed FIRST
   * load: a retained figure alongside a failed attempt can only mean there was a
   * previous result to retain. A first load that fails has no data at all, so
   * `allowance` is already `undefined` and the caller is already on the flat cap.
   */
  const stale = networkStatus === NetworkStatus.error && Boolean(allowance)

  return { allowance, loading, refreshing, stale, refetch: refresh }
}
