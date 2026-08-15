import { gql } from "@apollo/client"

import {
  useCardTopupLimitsQuery,
  useLevelQuery,
  useTransferFlagsQuery,
} from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { AccountLevel } from "@app/graphql/level-context"

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
 *
 * `levelLoading` is true while a signed-in user's level is still being
 * resolved (currentLevel reads "NonAuth" during that window). Card-flow
 * callers must hold the flow (disable Continue) while it is true instead of
 * treating "not resolved yet" as "no block" — otherwise a level-0 user on a
 * cold start slips past the level gate and their charge is captured by
 * Fygaro and stranded in manual review.
 */
export const useCardTopupLimit = () => {
  const isAuthed = useIsAuthed()
  // The level is fetched here directly (cache-and-network) rather than read
  // from useLevel(): that context resolves from a cache-only query, so on a
  // cold start (or deep link) an authed user's level reads "NonAuth" until
  // some other screen happens to populate the cache — precisely the window
  // where a level-0 user would fall into the "no client-side cap" bucket.
  // Fetching directly closes the window: the network resolves the level, and
  // levelLoading covers the in-flight gap.
  const { data: levelData, loading: levelQueryLoading } = useLevelQuery({
    fetchPolicy: "cache-and-network",
    skip: !isAuthed,
  })
  const level = levelData?.me?.defaultAccount?.level
  const currentLevel: AccountLevel = isAuthed && level ? level : AccountLevel.NonAuth
  // Only "still in flight with nothing resolved" counts as loading. A query
  // that settled without a level (e.g. network error) leaves currentLevel at
  // "NonAuth", which callers treat as the documented degrade path: the
  // webhook still gates authoritatively.
  const levelLoading = isAuthed && !level && levelQueryLoading

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

  return { fygaroTopup, dailyLimit, currentLevel, levelLoading }
}
