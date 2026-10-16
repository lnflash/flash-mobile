import type { AccountLimitsRow } from "../../../rails/graphql-rail"
import { PrepareRefusedError } from "../../refusals"
import type { ActionToolCtx } from "../../types"

/** Which daily limit a payment counts against (AccountLimits, spec §4 getAccountLimits). */
export type LimitBucket = keyof Pick<
  AccountLimitsRow,
  "withdrawal" | "internalSend" | "convert"
>

/**
 * Refuse, with the limit card, a payment over the account's remaining limit
 * in its bucket (spec v0.2.5 §5.1). The send screen checks the same
 * buckets the same way (payment-details/utils.ts, isValidAmount), with one
 * difference: a remaining limit of 0 is a limit of 0 here, where the screen
 * reads it as no limit and leaves the server to refuse after the tap. A
 * limit the server does not report (null) is left to the server.
 */
export const checkLimit = async (
  ctx: Pick<ActionToolCtx, "graphql">,
  bucket: LimitBucket,
  /** The payment in US cents, as the limits are. */
  usdCents: number,
): Promise<void> => {
  const limits = await ctx.graphql.accountLimits()
  const over = limits[bucket].some(
    ({ remainingLimit }) =>
      typeof remainingLimit === "number" && usdCents > remainingLimit,
  )
  if (over) throw new PrepareRefusedError("limitExceeded")
}
