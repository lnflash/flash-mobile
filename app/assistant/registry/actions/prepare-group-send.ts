import { sha256 } from "js-sha256"
import { v4 as uuidv4 } from "uuid"

import { WalletCurrency } from "@app/graphql/generated"
import {
  MoneyAmount,
  toSpendableBalance,
  WalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import type { CardSummary, CardWallet, GroupSendSummaryCard } from "../../cards/types"
import { canonicalJson } from "../../engine/canonical-json"
import { createAttemptState } from "../../engine/executor"
import {
  AMOUNT_CURRENCIES,
  AMOUNT_PATTERN,
  AmountCurrency,
} from "../../engine/parse-amount"
import { defineAction } from "../define"
import { PrepareRefusedError } from "../refusals"
import type {
  ActionToolCtx,
  ExecuteContext,
  ExecutionOutcome,
  PreparedAction,
  ToolResult,
} from "../types"
import { requestedAmount } from "./shared/amount"
import { createLegAttempts, LegAttempt, legStatusOf } from "./shared/attempt"
import { replyingOnError, ToolReplyError } from "./shared/errors"
import { minExpiry } from "./shared/expiry"
import { amountText } from "./shared/format"
import { checkLimit } from "./shared/limits"
import { resolvePayee, ResolvedPayee } from "./shared/payee"
import { readPrice } from "./shared/price"
import {
  balanceAfter,
  dispatchSendLeg,
  PreparedSendLeg,
  prepareSendLeg,
} from "./shared/send-leg"
import { splitMoneyAmount } from "./shared/split"
import { readWallet } from "./shared/wallets"

// prepareGroupSend (docs/ai-assistant-tool-registry.md §5): one amount
// shared between several Flash users (not the API's inbound wallet splits,
// ENG-653). The shares are computed in code on MoneyAmount, the leftover
// minor units handed out in payee-list order from index 0 (ENG-688
// decision 4), and each share is a leg prepared as prepareSend prepares one
// payment, with its own AttemptState.
//
// The group pays from the cash wallet, to Flash users (contacts, picked
// contacts, Flash Lightning addresses): every leg is a keyed intraledger
// send, so a leg whose answer was lost retries under its own key, and no
// leg is a keyless send that a re-prepare could pay twice. Execution is
// serial and stops at the first leg that fails or whose outcome is
// unknown; every later leg is not attempted, and the card shows every
// leg's real status. Once a leg has gone, the group as a whole is never
// prepared again: before expiresAt a retry re-sends only the legs that did
// not go, with the states they already have. Past it, only a leg whose
// answer was lost goes again, under its own key (a replay of a dispatch the
// server may hold); the legs that never went, or failed for certain, would
// be new payments on numbers past their expiry (spec §5 "Expiry", §8), so
// they are prepared again as a new group, from a fresh price read and with
// new AttemptStates (refresh).

/** The most legs a group send takes: each is a payment and a line on the card. */
export const MAX_GROUP_LEGS = 10

export type PrepareGroupSendArgs = {
  /** Each a contact's name, a picked contact (`contact:<username>`), or a Flash user's address. */
  payees: string[]
  /** The amount to share, in display units; with no `currency`, in the display currency. */
  total: string
  currency?: AmountCurrency
  memo?: string
}

type Leg = {
  payee: ResolvedPayee
  share: MoneyAmount<WalletOrDisplayCurrency>
  prepared: PreparedSendLeg
}

const sum = (
  amounts: readonly WalletAmount<WalletCurrency>[],
): WalletAmount<WalletCurrency> => ({
  ...amounts[0],
  amount: amounts.reduce((total, { amount }) => total + amount, 0),
})

/** The group's payment identity: its legs', in order. Two cards for one split are one payment. */
const groupHash = (legs: readonly Leg[]): string =>
  sha256(canonicalJson({ group: legs.map(({ prepared }) => prepared.paymentDetailHash) }))

/**
 * Whether a leg's last dispatch lost its answer: a keyed send the server may
 * hold, which a retry under the same key replays rather than repeats.
 */
export const isLostAnswer = ({ status, last }: LegAttempt): boolean =>
  status === "unknown" && last?.kind === "unknown" && last.retry === "sameAttempt"

/**
 * Dispatch the legs that have not gone, in order, stopping at the first that
 * fails or whose outcome is unknown. A leg that went is never sent again,
 * and a leg whose answer was lost goes again only as a replay of itself.
 *
 * `replayOnly`, for a group past its expiry: only a leg whose answer was
 * lost goes again, under its own key. A leg that never went, or failed for
 * certain, would be a new payment on stale numbers, so it is left as it is,
 * for a new group prepared from fresh ones.
 */
export const runLegs = async ({
  legs,
  attempts,
  dispatch,
  replayOnly = false,
}: {
  legs: readonly PreparedSendLeg[]
  attempts: LegAttempt[]
  dispatch: (
    leg: PreparedSendLeg,
    attempt: LegAttempt,
  ) => ReturnType<typeof dispatchSendLeg>
  replayOnly?: boolean
}): Promise<void> => {
  let stopped = false
  for (const [index, leg] of legs.entries()) {
    const attempt = attempts[index]
    const lost = isLostAnswer(attempt)
    if (attempt.status !== "success" && (lost || !replayOnly)) {
      if (stopped) {
        // A lost answer keeps its status: it may have gone.
        if (!lost) attempt.status = "not_attempted"
      } else {
        const result = await dispatch(leg, attempt)
        attempt.last = result
        attempt.status = legStatusOf(result)
        stopped = result.kind !== "sent"
      }
    }
  }
}

/**
 * What a Confirm of the group did, for the executor:
 * - every leg went: succeeded;
 * - a leg's outcome cannot be retried (a dispatch that went out keyless, a
 *   key reuse answer): the card disarms and points to the history;
 * - nothing went, and no leg's answer was lost: nothing moved, so the group
 *   may be confirmed again, and prepared again if it expires;
 * - a leg's answer was lost: the group stays open, and the next Confirm
 *   replays that leg under its own key, expired or not;
 * - otherwise some legs went and the rest provably did not. Before
 *   `stale` (the group's expiresAt) the group stays open for a retry of the
 *   rest under their own states. Past it their numbers are stale: the group
 *   retires, its record kept for the legs that went, and the rest is
 *   prepared again as a new group (refresh, through the card's Try again).
 */
export const groupOutcome = (
  attempts: readonly LegAttempt[],
  summary: ExecutionOutcome["summary"],
  { stale = false }: { stale?: boolean } = {},
): ExecutionOutcome => {
  if (attempts.every(({ status }) => status === "success")) {
    return { status: "succeeded", summary }
  }
  const unretriable = attempts.some(
    ({ status, last }) =>
      status === "unknown" && last?.kind === "unknown" && last.retry === "never",
  )
  if (unretriable) {
    return {
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "checkHistory",
      summary,
    }
  }
  const sent = attempts.some(({ status }) => status === "success")
  const lost = attempts.some(isLostAnswer)
  if (!sent && !lost) {
    return {
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "confirmAgain",
      summary,
    }
  }
  if (lost || !stale) {
    return {
      status: "unknown",
      replyKey: "Assistant.groupSendPartial",
      next: "retrySameAttempt",
      summary,
    }
  }
  return {
    status: "unknown",
    replyKey: "Assistant.groupSendRestExpired",
    next: "prepareRest",
    summary,
  }
}

const resolveLegs = async (
  rawPayees: readonly string[],
  ctx: ActionToolCtx,
  myWalletIds: readonly string[],
): Promise<
  | { kind: "payees"; payees: ResolvedPayee[] }
  | Exclude<ToolResult<never>, { kind: "prepared" }>
> => {
  const payees: ResolvedPayee[] = []
  for (const raw of rawPayees) {
    // Payees resolve one at a time: a question about one is the whole
    // answer, and no partial card is ever made.
    const resolution = await resolvePayee(raw, ctx, myWalletIds)
    if (resolution.kind === "clarification") {
      return { kind: "clarification", card: resolution.card }
    }
    if (resolution.kind === "error")
      return { kind: "error", userMessage: resolution.replyKey }
    const { payee } = resolution
    if (payee.kind !== "contact" && payee.kind !== "flashUser") {
      throw new ToolReplyError("Assistant.groupSendPayeesUnsupported")
    }
    if (
      payees.some(
        ({ recipientWalletId }) => recipientWalletId === payee.recipientWalletId,
      )
    ) {
      throw new ToolReplyError("Assistant.groupSendDuplicatePayee")
    }
    payees.push(payee)
  }
  return { kind: "payees", payees }
}

/**
 * Prepare the group of `args`, or only the legs at `only` (indexes into
 * `args.payees`), for the rest of a group whose other legs went: each leg
 * keeps the share the whole group's split gave it, and everything else is
 * read afresh (payees, balance, price, limit), with new AttemptStates.
 */
const prepareGroupRun = (
  args: PrepareGroupSendArgs,
  ctx: ActionToolCtx,
  only?: readonly number[],
): Promise<ToolResult<never>> =>
  replyingOnError(async (): Promise<ToolResult<never>> => {
    const total = requestedAmount({ amount: args.total, currency: args.currency }, ctx)
    if (!total) throw new ToolReplyError("Assistant.invalidArguments")
    const legIndexes = only ?? args.payees.map((_, index) => index)
    const wallets = await ctx.graphql.wallets()
    const resolved = await resolveLegs(
      legIndexes.map((index) => args.payees[index]),
      ctx,
      wallets.map(({ id }) => id),
    )
    if (resolved.kind !== "payees") return resolved

    const allShares = splitMoneyAmount(total, args.payees.length)
    if (allShares.some(({ amount }) => amount <= 0)) {
      throw new ToolReplyError("Assistant.groupShareTooSmall")
    }
    const shares = legIndexes.map((index) => allShares[index])
    // What this group shares, in the unit the user named: the total, or the
    // part of it the legs prepared now carry.
    const groupTotal: MoneyAmount<WalletOrDisplayCurrency> = {
      ...total,
      amount: shares.reduce((sum, { amount }) => sum + amount, 0),
    }
    const source = await readWallet(ctx, undefined, wallets)
    const price = await readPrice(ctx)

    const legs: Leg[] = []
    for (const [index, payee] of resolved.payees.entries()) {
      const share = shares[index]
      const result = await prepareSendLeg(
        { payee, amount: share, memo: args.memo, source, price },
        ctx,
      )
      if (result.kind !== "leg") return { kind: "clarification", card: result.card }
      legs.push({ payee, share, prepared: result.leg })
    }

    // Each leg was checked alone; the group is one draw on the balance and
    // on the day's limit.
    const spent = sum(legs.map(({ prepared }) => prepared.total))
    if (spent.amount > source.balance.amount) {
      throw new PrepareRefusedError("insufficientBalance")
    }
    await checkLimit(
      ctx,
      "internalSend",
      legs.reduce(
        (cents, { prepared }) =>
          cents +
          prepared.detail.convertMoneyAmount(
            prepared.detail.unitOfAccountAmount,
            WalletCurrency.Usd,
          ).amount,
        0,
      ),
    )

    const format = { convert: price.convert, display: ctx.display }
    const memo = legs.every(({ prepared }) => prepared.memo)
      ? legs[0].prepared.memo
      : undefined
    const summary: CardSummary<GroupSendSummaryCard> = {
      type: "groupSendSummary",
      legs: legs.map(({ payee, share, prepared }) => ({
        payeeLabel: payee.label,
        payeeUsername: payee.username ?? payee.label,
        amountText: amountText(prepared.detail.settlementAmount, format, share),
        status: "pending" as const,
      })),
      totalText: amountText(spent, format, groupTotal),
      balanceAfterText: amountText(
        toSpendableBalance(balanceAfter(source, spent)),
        format,
      ),
      sourceWallet: source.currency as CardWallet,
      ...(memo ? { memo } : {}),
    }

    const attempts = createLegAttempts(legs.length)
    const preparedLegs = legs.map(({ prepared }) => prepared)
    const expiresAt = minExpiry(preparedLegs.map(({ expiresAt: legExpiry }) => legExpiry))
    const preparedAction: PreparedAction = {
      id: uuidv4(),
      intent: "prepareGroupSend",
      threadId: ctx.threadId,
      createdAt: ctx.now(),
      expiresAt,
      summary,
      // The action's own state is unused: each leg dispatches under its own.
      attempt: createAttemptState(),
      dispatch: {
        paymentDetailHash: groupHash(legs),
        match: { kind: "anyOf", matches: preparedLegs.map(({ match }) => match) },
        // Every leg leaves the cash wallet.
        sourceWalletCurrency: source.currency,
      },
      execute: async ({ journalDispatch }: ExecuteContext) => {
        // The executor re-prepares an armed action past its expiry, but a
        // group that sent anything is unresolved, and comes here whenever it
        // is confirmed: past expiresAt only its lost answers go again.
        const stale = ctx.now() >= expiresAt
        await runLegs({
          legs: preparedLegs,
          attempts,
          dispatch: (leg, { attempt }) =>
            dispatchSendLeg({ leg, ctx, attempt, journalDispatch }),
          replayOnly: stale,
        })
        return groupOutcome(
          attempts,
          {
            ...summary,
            legs: summary.legs.map((leg, index) => ({
              ...leg,
              status: attempts[index].status,
            })),
          },
          { stale },
        )
      },
      // The same inputs again, for the legs that did not go: all of them
      // until one goes. A leg whose dispatch may have gone is never prepared
      // again, since a new group would pay it under a new key.
      refresh: async () => {
        if (attempts.some(({ status }) => status === "unknown")) {
          return { kind: "error", userMessage: "Assistant.checkHistory" }
        }
        const rest = legIndexes.filter((_, index) => attempts[index].status !== "success")
        if (rest.length === 0)
          return { kind: "error", userMessage: "Assistant.alreadySent" }
        return prepareGroupRun(args, ctx, rest)
      },
    }
    return { kind: "prepared", preparedAction }
  })

export const prepareGroupSendRun = (
  args: PrepareGroupSendArgs,
  ctx: ActionToolCtx,
): Promise<ToolResult<never>> => prepareGroupRun(args, ctx)

export const prepareGroupSend = defineAction<PrepareGroupSendArgs, never>({
  intent: "prepareGroupSend",
  description:
    "Prepare one amount shared between several Flash users, from the cash wallet, for the user to confirm.",
  input: {
    type: "object",
    properties: {
      payees: {
        type: "array",
        items: { type: "string", pattern: "^[\\s\\S]{1,320}$" },
        minItems: 1,
        maxItems: MAX_GROUP_LEGS,
      },
      total: { type: "string", pattern: AMOUNT_PATTERN },
      currency: { enum: AMOUNT_CURRENCIES },
      memo: { type: "string", pattern: "^[\\s\\S]{1,80}$" },
    },
    required: ["payees", "total"],
    additionalProperties: false,
  },
  run: prepareGroupSendRun,
})
