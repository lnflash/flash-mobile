import { gql } from "@apollo/client"

import { useFeatureFlags } from "@app/config/feature-flags-context"
import { useTransferFlagsQuery } from "@app/graphql/generated"

gql`
  query transferFlags {
    globals {
      topupEnabled
      cashoutEnabled
      bridgeEnabled
      fygaroTopup {
        minimumAmount
        processorFeePercent
        processorFeeFixed
        flashFeePercent
        flashFeeFixed
      }
    }
  }
`

/**
 * Instance-wide transfer feature flags, sourced from the backend globals query.
 *
 * The backend is the source of truth for bridge; the Firebase remote-config
 * flag (bridgeTopupEnabled) must also be on, acting as a client-side kill switch.
 *
 * DO NOT add newly-introduced schema fields to the query above. It gates the
 * home screen's Transfer button: one unknown field fails the WHOLE query with
 * GRAPHQL_VALIDATION_FAILED on any backend that predates the field, and the
 * button vanishes for every user. New/optional metadata belongs in its own
 * query so it can degrade alone (see use-card-topup-limit.ts, which exists
 * because this exact outage happened with the daily-limit fields).
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
