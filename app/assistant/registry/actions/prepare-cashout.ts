import { v4 as uuidv4 } from "uuid"

import { WalletCurrency } from "@app/graphql/generated"
import { last4Of } from "@app/components/topup-cashout-flow/use-cashout-accounts"
import { pickDefaultBankAccount } from "@app/screens/topup-cashout-flow/cashout-estimate"
import { toUsdMoneyAmount } from "@app/types/amounts"
import type { CardSummary, CashoutOfferCard } from "../../cards/types"
import { hashCashout } from "../../engine/attempt-journal"
import { createAttemptState } from "../../engine/executor"
import {
  AMOUNT_CURRENCIES,
  AMOUNT_PATTERN,
  AmountCurrency,
} from "../../engine/parse-amount"
import type { CashoutOfferRow } from "../../rails/graphql-action-rail"
import { defineAction } from "../define"
import { PrepareRefusedError } from "../refusals"
import type {
  ActionToolCtx,
  ExecutionOutcome,
  PreparedAction,
  ToolResult,
} from "../types"
import { requestedAmount } from "./shared/amount"
import { replyingOnError, ToolReplyError } from "./shared/errors"
import { timestampToMs } from "./shared/expiry"
import { amountText, CardFormat } from "./shared/format"
import { readPrice } from "./shared/price"
import { readWallet } from "./shared/wallets"

// prepareCashout (docs/ai-assistant-tool-registry.md §5): settle cash to a
// bank account, as the settle screens do (CashoutDetails.tsx,
// CashoutConfirmation.tsx). Only when the server says the account may
// (AccountCapabilities.bankPayout): the server field decides, never a
// level-derived guess. prepare asks for an offer (requestCashout) and shows
// it; execute accepts it (initiateCashout).
//
// Neither input carries an idempotency key, so the card treats an offer as
// single use: the first Confirm is the only one, whatever its outcome
// (decision 5), and a failure means a fresh offer. Since ENG-695 the server
// refuses a second execution of one offer too (OFFER_ALREADY_EXECUTED).
//
// Neither guard stops a second offer for the same request, so a settlement
// takes the per-payment rules of spec §5.1 as a send does. Its identity is
// the request, not the offer (hashCashout): Confirms of two cards for the
// same settlement run one after the other, and the second is answered
// "already sent" once the first went. Every Confirm writes the settlement to
// the dispatch journal before initiateCashout, so a settlement whose answer
// was lost blocks the same request afterwards, from a new card too, until
// it is accounted for. The transaction list shows nothing that says which
// settlement a row was, so its record reconciles to unknown (match kind
// `cashout`, as a BTC-rail payment's does): it clears on the user's word
// after the 24-hour history check, until ENG-716 gives the client a way to
// match one.

export type PrepareCashoutArgs = {
  /** In display units; with no `currency`, in the account's display currency. */
  amount: string
  currency?: AmountCurrency
  /** A bank account's id; the account the settle screen would pick when absent. */
  bankAccountId?: string
}

/** The code the API answers a second execution of an offer with (ENG-695). */
export const OFFER_ALREADY_EXECUTED = "OFFER_ALREADY_EXECUTED"

/** J$ as the settle confirmation screen writes it (CashoutConfirmation.tsx). */
const jmdText = (jmdCents: number): string => `J$${(jmdCents / 100).toFixed(2)}`

/** What reaches the bank, written as the settle confirmation screen writes it. */
const receiveTextOf = (offer: CashoutOfferRow, format: CardFormat): string => {
  const usd =
    offer.receiveUsd === null || offer.receiveUsd === undefined
      ? undefined
      : amountText(toUsdMoneyAmount(offer.receiveUsd), format)
  const jmd =
    offer.receiveJmd === null || offer.receiveJmd === undefined
      ? undefined
      : jmdText(offer.receiveJmd)
  if (usd && jmd) return `${usd} (${jmd})`
  if (usd ?? jmd) return (usd ?? jmd) as string
  throw new ToolReplyError("Assistant.toolFailed")
}

/** What one Confirm of the offer did. */
const outcomeOf = (answer: {
  id?: string | null
  errors: readonly { code?: string | null }[]
}): ExecutionOutcome => {
  if (answer.id) return { status: "succeeded" }
  // The offer went already, if not from this card; or the server answered
  // neither an id nor an error, which says nothing either way: something
  // may have moved.
  if (
    answer.errors.length === 0 ||
    answer.errors.some(({ code }) => code === OFFER_ALREADY_EXECUTED)
  ) {
    return { status: "unknown", replyKey: "Assistant.checkHistory", next: "checkHistory" }
  }
  return { status: "failed", replyKey: "Assistant.cashoutFailed", next: "reprepare" }
}

export const prepareCashoutRun = (
  args: PrepareCashoutArgs,
  ctx: ActionToolCtx,
): Promise<ToolResult<never>> =>
  replyingOnError(async (): Promise<ToolResult<never>> => {
    const amount = requestedAmount({ amount: args.amount, currency: args.currency }, ctx)
    if (!amount) throw new ToolReplyError("Assistant.invalidArguments")

    // The server's capability first: without it, no offer is asked for.
    const { bankPayout } = await ctx.graphqlActions.accountCapabilities()
    if (!bankPayout) throw new ToolReplyError("Assistant.cashoutUnavailable")

    const cash = await readWallet(ctx, "USD")
    const price = await readPrice(ctx)
    // An offer is in whole US cents (USDCents). An amount named in another
    // currency converts at the read price, and the part of a cent it cannot
    // send is left out: the card shows the offer's own numbers either way.
    const cents = Math.floor(price.convert(amount, WalletCurrency.Usd).amount)
    if (!(cents > 0)) throw new ToolReplyError("Assistant.amountTooSmall")
    // The settle screen's own check: no more than the cash balance.
    if (cents > cash.balance.amount) throw new PrepareRefusedError("insufficientBalance")

    const accounts = await ctx.graphqlActions.bankAccounts()
    if (
      args.bankAccountId !== undefined &&
      !accounts.some(({ id }) => id === args.bankAccountId)
    ) {
      // A named account that is not the user's is not one to guess around.
      throw new ToolReplyError("Assistant.invalidArguments")
    }
    // The same pick the settle screen sends with.
    const bankAccount = pickDefaultBankAccount(accounts, {
      selectedId: args.bankAccountId,
    })
    if (!bankAccount?.id) throw new ToolReplyError("Assistant.noBankAccount")

    const offer = await ctx.graphqlActions.requestCashout({
      amount: cents,
      bankAccountId: bankAccount.id,
      walletId: cash.id,
    })

    const format = { convert: price.convert, display: ctx.display }
    const summary: CardSummary<CashoutOfferCard> = {
      type: "cashoutOffer",
      amountText: amountText(toUsdMoneyAmount(offer.send), format),
      feeText: amountText(toUsdMoneyAmount(offer.flashFee), format),
      receiveText: receiveTextOf(offer, format),
      // From the bank-accounts query, never from the model (decision 6).
      bankLabel: `${bankAccount.bankName} ••${last4Of(bankAccount.accountNumber)}`,
    }

    let confirmed = false
    const preparedAction: PreparedAction = {
      id: uuidv4(),
      intent: "prepareCashout",
      threadId: ctx.threadId,
      createdAt: ctx.now(),
      expiresAt: timestampToMs(offer.expiresAt),
      summary,
      attempt: createAttemptState(),
      dispatch: {
        paymentDetailHash: hashCashout({
          walletId: cash.id,
          bankAccountId: bankAccount.id,
          amount,
        }),
        match: { kind: "cashout" },
        sourceWalletCurrency: cash.currency,
      },
      execute: async ({ journalDispatch }) => {
        // Single use, whatever the first Confirm's outcome.
        if (confirmed) {
          return {
            status: "unknown",
            replyKey: "Assistant.checkHistory",
            next: "checkHistory",
          }
        }
        confirmed = true
        // Written down before it goes (spec §5.1, "Process death"). A write
        // that fails sends nothing, so nothing moved.
        try {
          await journalDispatch(null)
        } catch {
          return {
            status: "failed",
            replyKey: "Assistant.cashoutFailed",
            next: "reprepare",
          }
        }
        try {
          return outcomeOf(
            await ctx.graphqlActions.initiateCashout({
              offerId: offer.offerId,
              walletId: offer.walletId,
            }),
          )
        } catch {
          // The answer was lost: the offer may have gone.
          return {
            status: "unknown",
            replyKey: "Assistant.checkHistory",
            next: "checkHistory",
          }
        }
      },
      // A new offer for the same request.
      refresh: () => prepareCashoutRun(args, ctx),
    }
    return { kind: "prepared", preparedAction }
  })

export const prepareCashout = defineAction<PrepareCashoutArgs, never>({
  intent: "prepareCashout",
  description:
    "Prepare a settlement of cash to the user's bank account, for the user to confirm.",
  input: {
    type: "object",
    properties: {
      amount: { type: "string", pattern: AMOUNT_PATTERN },
      currency: { enum: AMOUNT_CURRENCIES },
      bankAccountId: { type: "string", pattern: "^[\\s\\S]{1,128}$" },
    },
    required: ["amount"],
    additionalProperties: false,
  },
  run: prepareCashoutRun,
})
