import { v4 as uuidv4 } from "uuid"

import { WalletCurrency } from "@app/graphql/generated"
import { btcRailUnavailableState } from "@app/payments/btc-rail"
import { createLightningDestination } from "@app/screens/send-bitcoin-screen/payment-destination"
import {
  addMoneyAmounts,
  toBtcMoneyAmount,
  toSpendableBalance,
  WalletAmount,
} from "@app/types/amounts"
import type { CardSummary, CardWallet, ConfirmPaymentCard } from "../../cards/types"
import { createAttemptState } from "../../engine/executor"
import {
  AMOUNT_CURRENCIES,
  AMOUNT_PATTERN,
  AmountCurrency,
} from "../../engine/parse-amount"
import { defineAction } from "../define"
import { btcUnavailable } from "../projections"
import type { ActionToolCtx, PreparedAction, ToolResult } from "../types"
import { requestedAmount } from "./shared/amount"
import { replyingOnError, ToolReplyError } from "./shared/errors"
import { decodeBolt11 } from "./shared/expiry"
import { amountText } from "./shared/format"
import { assertBreezSendOpen } from "./shared/gates"
import { executionOutcomeOf } from "./shared/outcome"
import type { ResolvedPayee } from "./shared/payee"
import { readPrice } from "./shared/price"
import { balanceAfter, dispatchSendLeg, prepareSendLeg } from "./shared/send-leg"
import { readWallet, WalletChoice } from "./shared/wallets"

// prepareConversion (docs/ai-assistant-tool-registry.md §5): there is no
// conversion mutation. The conversion screen swaps across the two rails by
// paying itself (app/hooks/useSwap.ts), and so does this:
//
// - cash -> BTC: a Breez invoice on the BTC wallet for the amount
//   (BtcRail.createInvoice, useSwap.ts:147), probed with
//   lnUsdInvoiceFeeProbe on the cash wallet (useSwap.ts:153, failing closed
//   on a probe error or no fee), paid with lnInvoicePaymentSend from cash;
// - BTC -> cash: a no-amount lnUsdInvoiceCreate invoice on the cash wallet
//   (useSwap.ts:87), probed with BtcRail.probeFee (useSwap.ts:99), paid
//   from the BTC wallet.
//
// The probe runs on the paying side (decision 1). prepare makes the invoice
// and probes it; execute only pays, through the shared sendPayment, and
// never makes an invoice: a card that expired is prepared again, which makes
// a new one. useSwap itself is left as it is.
//
// The BTC -> cash pay leg is a BTC-wallet bolt11 send, the branch gated on
// ENG-720: until it merges, that direction answers the not-available card
// before anything is made.

/** useSwap's own memos for the two directions. */
export const SWAP_MEMO = {
  cashToBtc: "Swap USD to BTC",
  btcToCash: "Swap BTC to USD",
} as const

export type PrepareConversionArgs = {
  from: WalletChoice
  to: WalletChoice
  /** In display units; with no `currency`, in the account's display currency. */
  amount: string
  currency?: AmountCurrency
}

type Direction = keyof typeof SWAP_MEMO

const isCash = (wallet: WalletChoice) => wallet === "USD" || wallet === "USDT"

/** USD and USDT both name the cash wallet; exactly one side is BTC. */
const directionOf = ({ from, to }: PrepareConversionArgs): Direction => {
  if (from === "BTC" && isCash(to)) return "btcToCash"
  if (isCash(from) && to === "BTC") return "cashToBtc"
  throw new ToolReplyError("Assistant.invalidArguments")
}

/** The BTC rail's own not-running error, as the reply for the wallet's state. */
const btcRailReply = (err: unknown): never => {
  const state = btcRailUnavailableState(err)
  if (state) throw new ToolReplyError(btcUnavailable(state).replyKey)
  throw err
}

export const prepareConversionRun = (
  args: PrepareConversionArgs,
  ctx: ActionToolCtx,
): Promise<ToolResult<never>> =>
  replyingOnError(async (): Promise<ToolResult<never>> => {
    const direction = directionOf(args)
    const amount = requestedAmount({ amount: args.amount, currency: args.currency }, ctx)
    if (!amount) throw new ToolReplyError("Assistant.invalidArguments")
    // Refused before any invoice is made or any balance is read.
    if (direction === "btcToCash") assertBreezSendOpen("lightning")

    const wallets = await ctx.graphql.wallets()
    // Both wallets take part: one pays, the other is paid. A BTC wallet that
    // is syncing, off or failed is its own reply either way.
    const cash = await readWallet(ctx, "USD", wallets)
    const btc = await readWallet(ctx, "BTC", wallets)
    const price = await readPrice(ctx)
    const source = direction === "cashToBtc" ? cash : btc
    const target = direction === "cashToBtc" ? btc : cash

    // The counter-invoice on the receiving side, as useSwap makes it.
    let paymentRequest: string
    let receiveFee: WalletAmount<WalletCurrency> | undefined
    if (direction === "cashToBtc") {
      const sats = price.convert(amount, WalletCurrency.Btc).amount
      if (!(sats > 0)) throw new ToolReplyError("Assistant.amountTooSmall")
      const invoice = await ctx.btcRail
        .createInvoice(sats, SWAP_MEMO.cashToBtc)
        .catch(btcRailReply)
      paymentRequest = invoice.paymentRequest
      // The BTC wallet's own fee for receiving, which the conversion screen
      // counts in its fee (useSwap.ts:187).
      receiveFee = toBtcMoneyAmount(Number(invoice.fee ?? 0))
    } else {
      const invoice = await ctx.graphqlActions.lnUsdInvoiceCreate({
        walletId: cash.id,
        amount: 0,
        memo: SWAP_MEMO.btcToCash,
      })
      paymentRequest = invoice.paymentRequest
    }

    const decoded = decodeBolt11(paymentRequest)
    if (!decoded) throw new ToolReplyError("Assistant.toolFailed")
    const payee: ResolvedPayee = {
      kind: "lightning",
      destination: createLightningDestination({
        paymentType: "lightning",
        valid: true,
        paymentRequest,
        ...(decoded.sats ? { amount: decoded.sats } : {}),
      } as Parameters<typeof createLightningDestination>[0]),
      label: target.currency,
    }
    const prepared = await prepareSendLeg(
      {
        payee,
        // The cash -> BTC invoice carries the amount; the BTC -> cash one
        // has none, and the payment sets it.
        amount: direction === "cashToBtc" ? undefined : amount,
        memo: direction === "cashToBtc" ? SWAP_MEMO.cashToBtc : undefined,
        source,
        price,
        limitBucket: "convert",
      },
      ctx,
    )
    if (prepared.kind !== "leg") throw new ToolReplyError("Assistant.toolFailed")
    const { leg } = prepared

    const format = { convert: price.convert, display: ctx.display }
    const fee = receiveFee
      ? addMoneyAmounts({ a: leg.fee, b: price.convert(receiveFee, source.currency) })
      : leg.fee
    const summary: CardSummary<ConfirmPaymentCard> = {
      type: "confirmPayment",
      payeeLabel: target.currency,
      toWallet: target.currency as CardWallet,
      amountText: amountText(leg.detail.settlementAmount, format, amount),
      feeText: amountText(fee, format),
      totalText: amountText(leg.total, format),
      balanceAfterText: amountText(
        toSpendableBalance(balanceAfter(source, leg.total)),
        format,
      ),
      sourceWallet: source.currency as CardWallet,
    }

    const preparedAction: PreparedAction = {
      id: uuidv4(),
      intent: "prepareConversion",
      threadId: ctx.threadId,
      createdAt: ctx.now(),
      expiresAt: leg.expiresAt,
      summary,
      attempt: createAttemptState(),
      dispatch: { paymentDetailHash: leg.paymentDetailHash, match: leg.match },
      // Pays the invoice prepare made; makes none.
      execute: async ({ attempt, journalDispatch }) =>
        executionOutcomeOf(
          await dispatchSendLeg({ leg, ctx, attempt, journalDispatch }),
          {
            keyless: leg.keyless,
          },
        ),
      refresh: () => prepareConversionRun(args, ctx),
    }
    return { kind: "prepared", preparedAction }
  })

export const prepareConversion = defineAction<PrepareConversionArgs, never>({
  intent: "prepareConversion",
  description:
    "Prepare a conversion between the user's cash wallet and BTC wallet, for the user to confirm.",
  input: {
    type: "object",
    properties: {
      from: { enum: AMOUNT_CURRENCIES },
      to: { enum: AMOUNT_CURRENCIES },
      amount: { type: "string", pattern: AMOUNT_PATTERN },
      currency: { enum: AMOUNT_CURRENCIES },
    },
    required: ["from", "to", "amount"],
    additionalProperties: false,
  },
  run: prepareConversionRun,
})
