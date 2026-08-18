import { gql } from "@apollo/client"

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
 */
export const useCardTopupAllowance = ({ skip = false }: { skip?: boolean } = {}) => {
  const isAuthed = useIsAuthed()
  const { data, loading, refetch } = useFygaroTopupAllowanceQuery({
    skip: skip || !isAuthed,
    fetchPolicy: "network-only",
  })

  const raw = data?.fygaroTopupAllowance
  const allowance: CardTopupAllowance | undefined = raw
    ? {
        limitCents: raw.limit,
        heldCents: raw.held,
        remainingCents: raw.remaining,
        holdsExpireAt: raw.holdsExpireAt ? new Date(raw.holdsExpireAt * 1000) : undefined,
      }
    : undefined

  return { allowance, loading, refetch }
}
