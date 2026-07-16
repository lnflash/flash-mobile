import { gql } from "@apollo/client"

import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useAccountStatusQuery, useBridgeKycStatusQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useLevel } from "@app/graphql/level-context"

import {
  AccountCapabilities,
  AccountStatusHeadline,
  capabilitiesFromLevel,
  headlineFromLevel,
} from "./account-status-derivation"

export type { AccountCapabilities, AccountStatusHeadline }
export { capabilitiesFromLevel, headlineFromLevel }

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

/**
 * ENG-516 "light headline status": the account leads with one word —
 * Trial → Verified → Business — with capability badges as supporting detail.
 * Pro/International/Merchant are retired as user-facing tiers; the numeric
 * level is internal.
 *
 * `capabilities` is always defined: the backend object when available, else
 * the level-derived fallback (with Bridge KYC status standing in for
 * usdAccount). This is the single source of capability truth — screens must
 * not re-derive from the level.
 */
export const useAccountStatus = () => {
  const isAuthed = useIsAuthed()
  const { currentLevel } = useLevel()
  const { bridgeTopupEnabled } = useFeatureFlags()

  const { data, loading, refetch } = useAccountStatusQuery({
    fetchPolicy: "cache-and-network",
    skip: !isAuthed,
  })

  // Only feeds the usdAccount fallback; Apollo dedupes it against other
  // watchers of the same query (useBridgeKyc, useBankAccounts).
  const { data: kycData } = useBridgeKycStatusQuery({
    fetchPolicy: "cache-and-network",
    skip: !isAuthed || !bridgeTopupEnabled,
  })

  const account = data?.me?.defaultAccount
  const statusHeadline: AccountStatusHeadline =
    (account && "statusHeadline" in account && account.statusHeadline) ||
    headlineFromLevel(currentLevel)

  const capabilities: AccountCapabilities =
    account && "capabilities" in account && account.capabilities
      ? account.capabilities
      : capabilitiesFromLevel(currentLevel, kycData?.bridgeKycStatus === "approved")

  return { statusHeadline, capabilities, loading, refetch }
}
