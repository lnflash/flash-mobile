import { useTransferFlagsQuery } from "@app/graphql/generated"
import { AccountLevel, useLevel } from "@app/graphql/level-context"

/**
 * The signed-in user's card top-up parameters, resolved from the backend
 * globals (Globals.fygaroTopup) and their account level.
 *
 * `dailyLimit` is the gross USD cap per rolling 24h for the user's level, or
 * undefined when it cannot be known client-side: NonAuth/level-0 users (no
 * card top-up allowance) or a null fygaroTopup (operator settings
 * unavailable). Callers must treat undefined as "no client-side cap to show
 * or enforce" — the webhook remains the authority either way.
 */
export const useCardTopupLimit = () => {
  const { currentLevel } = useLevel()
  const { data } = useTransferFlagsQuery({ fetchPolicy: "cache-and-network" })
  const fygaroTopup = data?.globals?.fygaroTopup ?? null

  const dailyLimit =
    currentLevel === AccountLevel.One
      ? fygaroTopup?.l1DailyLimit
      : currentLevel === AccountLevel.Two
      ? fygaroTopup?.l2DailyLimit
      : currentLevel === AccountLevel.Three
      ? fygaroTopup?.l3DailyLimit
      : undefined

  return { fygaroTopup, dailyLimit, currentLevel }
}
