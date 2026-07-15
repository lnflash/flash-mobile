import { gql } from "@apollo/client"

import { useAccountStatusQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { AccountLevel, useLevel } from "@app/graphql/level-context"

gql`
  query accountStatus {
    me {
      defaultAccount {
        id
        ... on ConsumerAccount {
          statusHeadline
          capabilities {
            verified
            bankPayout
            business
            usdAccount
          }
        }
      }
    }
  }
`

export type AccountStatusHeadline = "TRIAL" | "VERIFIED" | "BUSINESS"

export type AccountCapabilities = {
  verified: boolean
  bankPayout: boolean
  business: boolean
  usdAccount: boolean
}

// Fallback for older backends that don't expose statusHeadline yet: the same
// derivation the backend uses, from the stored level.
const headlineFromLevel = (level: AccountLevel): AccountStatusHeadline => {
  if (level === AccountLevel.Three) return "BUSINESS"
  if (level === AccountLevel.One || level === AccountLevel.Two) return "VERIFIED"
  return "TRIAL"
}

/**
 * ENG-516 "light headline status": the account leads with one word —
 * Trial → Verified → Business — with capability badges as supporting detail.
 * Pro/International/Merchant are retired as user-facing tiers; the numeric
 * level is internal.
 */
export const useAccountStatus = () => {
  const isAuthed = useIsAuthed()
  const { currentLevel } = useLevel()

  const { data, loading, refetch } = useAccountStatusQuery({
    fetchPolicy: "cache-and-network",
    skip: !isAuthed,
  })

  const account = data?.me?.defaultAccount
  const statusHeadline: AccountStatusHeadline =
    (account && "statusHeadline" in account && account.statusHeadline) ||
    headlineFromLevel(currentLevel)

  const capabilities: AccountCapabilities | undefined =
    account && "capabilities" in account && account.capabilities
      ? account.capabilities
      : undefined

  return { statusHeadline, capabilities, loading, refetch }
}
