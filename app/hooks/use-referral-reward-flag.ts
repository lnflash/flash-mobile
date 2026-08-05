import { gql } from "@apollo/client"

import { useReferralRewardFlagQuery } from "@app/graphql/generated"

gql`
  query referralRewardFlag {
    globals {
      referralRewardEnabled
    }
  }
`

/**
 * Whether referral rewards are enabled instance-wide (backend is the source of
 * truth: config.referralReward.enabled). Gates reward-promising UI — the
 * home-screen "invite a friend" card — so it only shows when a reward will
 * actually be paid. Defaults to false while loading, so no reward is ever
 * promised during the initial fetch.
 */
export const useReferralRewardFlag = () => {
  const { data, loading } = useReferralRewardFlagQuery({
    fetchPolicy: "cache-and-network",
  })

  return {
    referralRewardEnabled: data?.globals?.referralRewardEnabled ?? false,
    loading,
  }
}
