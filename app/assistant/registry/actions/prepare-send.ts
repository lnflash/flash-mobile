import { v4 as uuidv4 } from "uuid"

import { toSpendableBalance } from "@app/types/amounts"
import type { CardSummary, CardWallet, ConfirmPaymentCard } from "../../cards/types"
import { createAttemptState } from "../../engine/executor"
import {
  AMOUNT_CURRENCIES,
  AMOUNT_PATTERN,
  AmountCurrency,
} from "../../engine/parse-amount"
import { defineAction } from "../define"
import type { ActionToolCtx, PreparedAction, ToolResult } from "../types"
import { requestedAmount } from "./shared/amount"
import { replyingOnError } from "./shared/errors"
import { amountText } from "./shared/format"
import { assertBreezSendOpen } from "./shared/gates"
import { executionOutcomeOf } from "./shared/outcome"
import { resolvePayee } from "./shared/payee"
import { readPrice } from "./shared/price"
import { balanceAfter, dispatchSendLeg, prepareSendLeg } from "./shared/send-leg"
import { readWallet, WalletChoice } from "./shared/wallets"

// prepareSend (docs/ai-assistant-tool-registry.md §5): one payment to a
// contact, a Flash user, a Lightning invoice or address, or an on-chain
// address, prepared exactly as the send flow prepares it and shown on a
// confirm card. Nothing moves until the user confirms that card; then the
// executor runs execute(), which dispatches through the shared sendPayment
// (ENG-686) under this action's one AttemptState.

export type PrepareSendArgs = {
  /** A contact's name, a picked contact (`contact:<username>`), or a payment request or address. */
  payee: string
  /** In display units; with no `currency`, in the account's display currency. */
  amount?: string
  currency?: AmountCurrency
  memo?: string
  /** The wallet the payment comes from; the cash wallet when the call names none. */
  sourceWallet?: WalletChoice
}

export const prepareSendRun = (
  args: PrepareSendArgs,
  ctx: ActionToolCtx,
): Promise<ToolResult<never>> =>
  replyingOnError(async (): Promise<ToolResult<never>> => {
    const amount = requestedAmount(args, ctx)
    const wallets = await ctx.graphql.wallets()
    const resolution = await resolvePayee(
      args.payee,
      ctx,
      wallets.map(({ id }) => id),
    )
    if (resolution.kind === "clarification") {
      return { kind: "clarification", card: resolution.card }
    }
    if (resolution.kind === "error")
      return { kind: "error", userMessage: resolution.replyKey }
    const { payee } = resolution

    // A gated Breez branch is refused before any balance, price or fee is read.
    if (args.sourceWallet === "BTC") {
      assertBreezSendOpen(payee.destination.validDestination.paymentType)
    }
    const source = await readWallet(ctx, args.sourceWallet, wallets)
    const price = await readPrice(ctx)
    const prepared = await prepareSendLeg(
      { payee, amount, memo: args.memo, source, price },
      ctx,
    )
    if (prepared.kind === "clarification") {
      return { kind: "clarification", card: prepared.card }
    }
    const { leg } = prepared

    const format = { convert: price.convert, display: ctx.display }
    const summary: CardSummary<ConfirmPaymentCard> = {
      type: "confirmPayment",
      payeeLabel: payee.label,
      ...(payee.username ? { payeeUsername: payee.username } : {}),
      // The amount leads in the unit the user named it in, when they named one.
      amountText: amountText(leg.detail.settlementAmount, format, amount),
      feeText: amountText(leg.fee, format),
      totalText: amountText(leg.total, format),
      balanceAfterText: amountText(
        toSpendableBalance(balanceAfter(source, leg.total)),
        format,
      ),
      sourceWallet: source.currency as CardWallet,
      ...(leg.memo ? { memo: leg.memo } : {}),
    }

    const preparedAction: PreparedAction = {
      id: uuidv4(),
      intent: "prepareSend",
      threadId: ctx.threadId,
      createdAt: ctx.now(),
      expiresAt: leg.expiresAt,
      summary,
      // One AttemptState for this action, made here and handed to every
      // Confirm of it (ENG-533).
      attempt: createAttemptState(),
      dispatch: {
        paymentDetailHash: leg.paymentDetailHash,
        match: leg.match,
        sourceWalletCurrency: leg.detail.sendingWalletDescriptor.currency,
      },
      execute: async ({ attempt, journalDispatch }) =>
        executionOutcomeOf(
          await dispatchSendLeg({ leg, ctx, attempt, journalDispatch }),
          {
            keyless: leg.keyless,
          },
        ),
      // The same inputs again: a new action, with a new id and AttemptState.
      refresh: () => prepareSendRun(args, ctx),
    }
    return { kind: "prepared", preparedAction }
  })

export const prepareSend = defineAction<PrepareSendArgs, never>({
  intent: "prepareSend",
  description:
    "Prepare a payment to a contact, a Flash user, a Lightning invoice or address, or an on-chain address, for the user to confirm.",
  input: {
    type: "object",
    properties: {
      payee: { type: "string", pattern: "^[\\s\\S]{1,2048}$" },
      amount: { type: "string", pattern: AMOUNT_PATTERN },
      currency: { enum: AMOUNT_CURRENCIES },
      memo: { type: "string", pattern: "^[\\s\\S]{1,80}$" },
      sourceWallet: { enum: AMOUNT_CURRENCIES },
    },
    required: ["payee"],
    additionalProperties: false,
  },
  run: prepareSendRun,
})
