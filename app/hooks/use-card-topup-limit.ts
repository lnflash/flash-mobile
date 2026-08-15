import { gql } from "@apollo/client"

import { useCardTopupLimitsQuery, useTransferFlagsQuery } from "@app/graphql/generated"
import { AccountLevel, useLevel } from "@app/graphql/level-context"

// The daily-limit fields live in their OWN query, deliberately separate from
// transferFlags: that query gates the home screen's Transfer button, and a
// backend that predates these fields (or a flash rollback) rejects the whole
// query over one unknown field — which once hid the Transfer button for every
// user on test. Isolated here, an old backend fails only this query and the
// app degrades to "no client-side cap / no limit shown" while every other
// flow keeps working. The webhook stays the enforcement authority regardless.
gql`
  query cardTopupLimits {
    globals {
      fygaroTopup {
        l1DailyLimit
        l2DailyLimit
        l3DailyLimit
      }
    }
  }
`

/**
 * The signed-in user's card top-up parameters, resolved from the backend
 * globals and their account level.
 *
 * `fygaroTopup` (fees + minimum) comes from the long-standing transferFlags
 * fields and works against any backend. `dailyLimit` is the gross USD cap per
 * rolling 24h for the user's level, or undefined when it cannot be known
 * client-side: NonAuth/level-0 users (no card top-up allowance), operator
 * settings unavailable, or a backend without the daily-limit schema fields.
 * Callers must treat undefined as "no client-side cap to show or enforce".
 */
export const useCardTopupLimit = () => {
  const { currentLevel } = useLevel()
  const { data } = useTransferFlagsQuery({ fetchPolicy: "cache-and-network" })
  const { data: limitsData } = useCardTopupLimitsQuery({
    fetchPolicy: "cache-and-network",
  })

  const fygaroTopup = data?.globals?.fygaroTopup ?? null
  const limits = limitsData?.globals?.fygaroTopup ?? null

  const dailyLimit =
    currentLevel === AccountLevel.One
      ? limits?.l1DailyLimit
      : currentLevel === AccountLevel.Two
      ? limits?.l2DailyLimit
      : currentLevel === AccountLevel.Three
      ? limits?.l3DailyLimit
      : undefined

  return { fygaroTopup, dailyLimit, currentLevel }
}
