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
// leg's real status. Once a leg has gone, the group is never prepared
// again: a retry re-sends only the legs that did not go, with the states
// they already have.

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
 * Dispatch the legs that have not gone, in order, stopping at the first that
 * fails or whose outcome is unknown. A leg that went is never sent again.
 */
export const runLegs = async (
  legs: readonly PreparedSendLeg[],
  attempts: LegAttempt[],
  dispatch: (
    leg: PreparedSendLeg,
    attempt: LegAttempt,
  ) => ReturnType<typeof dispatchSendLeg>,
): Promise<void> => {
  let stopped = false
  for (const [index, leg] of legs.entries()) {
    const attempt = attempts[index]
    if (attempt.status !== "success") {
      if (stopped) {
        attempt.status = "not_attempted"
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
 * - nothing went and a leg failed: nothing moved, so the group may be
 *   confirmed again, and prepared again if it expires;
 * - otherwise something may have moved (a leg went, or a leg's answer was
 *   lost): the group stays open for a retry of the legs that did not go,
 *   under their own states, and is never prepared again.
 */
export const groupOutcome = (
  attempts: readonly LegAttempt[],
  summary: ExecutionOutcome["summary"],
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
  const anythingMayHaveMoved = attempts.some(
    ({ status }) => status === "success" || status === "unknown",
  )
  if (!anythingMayHaveMoved) {
    return {
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "confirmAgain",
      summary,
    }
  }
  return {
    status: "unknown",
    replyKey: "Assistant.groupSendPartial",
    next: "retrySameAttempt",
    summary,
  }
}

const resolveLegs = async (
  args: PrepareGroupSendArgs,
  ctx: ActionToolCtx,
  myWalletIds: readonly string[],
): Promise<
  | { kind: "payees"; payees: ResolvedPayee[] }
  | Exclude<ToolResult<never>, { kind: "prepared" }>
> => {
  const payees: ResolvedPayee[] = []
  for (const raw of args.payees) {
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

export const prepareGroupSendRun = (
  args: PrepareGroupSendArgs,
  ctx: ActionToolCtx,
): Promise<ToolResult<never>> =>
  replyingOnError(async (): Promise<ToolResult<never>> => {
    const total = requestedAmount({ amount: args.total, currency: args.currency }, ctx)
    if (!total) throw new ToolReplyError("Assistant.invalidArguments")
    const wallets = await ctx.graphql.wallets()
    const resolved = await resolveLegs(
      args,
      ctx,
      wallets.map(({ id }) => id),
    )
    if (resolved.kind !== "payees") return resolved

    const shares = splitMoneyAmount(total, resolved.payees.length)
    if (shares.some(({ amount }) => amount <= 0)) {
      throw new ToolReplyError("Assistant.groupShareTooSmall")
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
      totalText: amountText(spent, format, total),
      balanceAfterText: amountText(
        toSpendableBalance(balanceAfter(source, spent)),
        format,
      ),
      sourceWallet: source.currency as CardWallet,
      ...(memo ? { memo } : {}),
    }

    const attempts = createLegAttempts(legs.length)
    const preparedLegs = legs.map(({ prepared }) => prepared)
    const preparedAction: PreparedAction = {
      id: uuidv4(),
      intent: "prepareGroupSend",
      threadId: ctx.threadId,
      createdAt: ctx.now(),
      expiresAt: minExpiry(preparedLegs.map(({ expiresAt }) => expiresAt)),
      summary,
      // The action's own state is unused: each leg dispatches under its own.
      attempt: createAttemptState(),
      dispatch: {
        paymentDetailHash: groupHash(legs),
        match: { kind: "anyOf", matches: preparedLegs.map(({ match }) => match) },
      },
      execute: async ({ journalDispatch }: ExecuteContext) => {
        await runLegs(preparedLegs, attempts, (leg, { attempt }) =>
          dispatchSendLeg({ leg, ctx, attempt, journalDispatch }),
        )
        return groupOutcome(attempts, {
          ...summary,
          legs: summary.legs.map((leg, index) => ({
            ...leg,
            status: attempts[index].status,
          })),
        })
      },
      refresh: () => prepareGroupSendRun(args, ctx),
    }
    return { kind: "prepared", preparedAction }
  })

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
