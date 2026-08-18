import { gql } from "@apollo/client"

import { useFygaroTopupAllowanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// Isolated, like every other card-top-up operation: a backend without these
// fields rejects the whole document, and losing the allowance must degrade to
// "show the flat cap" rather than break the screen.
gql`
  query fygaroTopupAllowance {
    fygaroTopupAllowance {
      limit
      spent
      held
      remaining
      resetsAt
      holdsExpireAt
    }
  }
`

export type CardTopupAllowance = {
  limitCents: number
  spentCents: number
  // Unpaid checkout links. NOT spent — nothing has been charged — but not
  // available either. Rendered separately because "you've spent $0 and have $65
  // of $125" is otherwise unexplainable to the person reading it.
  heldCents: number
  remainingCents: number
  resetsAt?: Date
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
 */
export const useCardTopupAllowance = () => {
  const isAuthed = useIsAuthed()
  const { data, loading, refetch } = useFygaroTopupAllowanceQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
  })

  const raw = data?.fygaroTopupAllowance
  const allowance: CardTopupAllowance | undefined = raw
    ? {
        limitCents: raw.limit,
        spentCents: raw.spent,
        heldCents: raw.held,
        remainingCents: raw.remaining,
        resetsAt: raw.resetsAt ? new Date(raw.resetsAt * 1000) : undefined,
        holdsExpireAt: raw.holdsExpireAt ? new Date(raw.holdsExpireAt * 1000) : undefined,
      }
    : undefined

  return { allowance, loading, refetch }
}
