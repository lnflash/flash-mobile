import { gql } from "@apollo/client"

import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useTransferFlagsQuery } from "@app/graphql/generated"

gql`
  query transferFlags {
    globals {
      topupEnabled
      cashoutEnabled
      bridgeEnabled
    }
  }
`

/**
 * Instance-wide transfer feature flags, sourced from the backend globals query.
 *
 * The backend is the source of truth for bridge; the Firebase remote-config
 * flag (bridgeTopupEnabled) must also be on, acting as a client-side kill switch.
 */
export const useTransferFlags = () => {
  const { bridgeTopupEnabled } = useFeatureFlags()

  const { data, loading, refetch } = useTransferFlagsQuery({
    fetchPolicy: "cache-and-network",
  })

  const topupEnabled = data?.globals?.topupEnabled ?? false
  const cashoutEnabled = data?.globals?.cashoutEnabled ?? false
  const bridgeEnabled = (data?.globals?.bridgeEnabled ?? false) && bridgeTopupEnabled

  return {
    topupEnabled,
    cashoutEnabled,
    bridgeEnabled,
    transferEnabled: topupEnabled || cashoutEnabled || bridgeEnabled,
    loading,
    refetch,
  }
}
