import { WalletCurrency } from "@app/graphql/generated"
import { getPaymentRequestFullUri } from "@app/screens/receive-bitcoin-screen/payment/helpers"
import { Invoice } from "@app/screens/receive-bitcoin-screen/payment/index.types"
import { btcRailUnavailableState } from "@app/payments/btc-rail"
import type { MoneyAmount } from "@app/types/amounts"
import type { CardWallet, InvoiceCard } from "../../cards/types"
import {
  AMOUNT_CURRENCIES,
  AMOUNT_PATTERN,
  AmountCurrency,
} from "../../engine/parse-amount"
import { defineAction } from "../define"
import { btcUnavailable } from "../projections"
import type { ActionToolCtx, ToolResult } from "../types"
import { requestedAmount } from "./shared/amount"
import { replyingOnError, ToolReplyError } from "./shared/errors"
import { decodeBolt11 } from "./shared/expiry"
import { amountText } from "./shared/format"
import { readPrice } from "./shared/price"
import { readWallet, WalletChoice } from "./shared/wallets"

// prepareReceive (docs/ai-assistant-tool-registry.md §5): a payment request
// for one of the user's wallets, made the way the receive screen makes it
// (receive-bitcoin-screen/payment/payment-request.ts):
//
// - BTC Lightning: a bolt11 from the BTC rail (receivePaymentBreez);
// - BTC on-chain: the BTC wallet's address from the BTC rail
//   (receiveOnchainBreez);
// - USD or USDT Lightning: lnUsdInvoiceCreate, the amount in cents, 0 for
//   none, expiring in 5 minutes;
// - USD or USDT on-chain: onChainAddressCurrent.
//
// The server-side BTC invoice mutations (lnInvoiceCreate,
// lnNoAmountInvoiceCreate) are never used: the BTC wallet is external. There
// is nothing to confirm, so the answer is the invoice card itself.

export type PrepareReceiveArgs = {
  /** The wallet that receives; the cash wallet when the call names none. */
  wallet?: WalletChoice
  method?: "lightning" | "onchain"
  /** In display units; with no `currency`, in the account's display currency. */
  amount?: string
  currency?: AmountCurrency
  memo?: string
}

/** payment-request.ts's memo when the user sets none and the username is not at hand. */
export const DEFAULT_RECEIVE_MEMO = "Pay to Flash Wallet User"

/** The BTC rail's own not-running error, as the reply for the wallet's state. */
const btcRailReply = (err: unknown): never => {
  const state = btcRailUnavailableState(err)
  if (state) throw new ToolReplyError(btcUnavailable(state).replyKey)
  throw err
}

const requestFor = async ({
  currency,
  method,
  walletId,
  settlement,
  memo,
  ctx,
}: {
  currency: WalletCurrency
  method: "lightning" | "onchain"
  walletId: string
  settlement?: MoneyAmount<WalletCurrency>
  memo: string
  ctx: ActionToolCtx
}): Promise<string> => {
  if (currency === WalletCurrency.Btc) {
    if (method === "lightning") {
      const invoice = await ctx.btcRail
        .createInvoice(settlement?.amount, memo)
        .catch(btcRailReply)
      return invoice.paymentRequest
    }
    const address = await ctx.btcRail.getOnchainAddress().catch(btcRailReply)
    return address.paymentRequest
  }
  if (method === "lightning") {
    const invoice = await ctx.graphqlActions.lnUsdInvoiceCreate({
      walletId,
      // Cents, which USD and USDT settlement amounts already are; 0 asks for no amount.
      amount: settlement?.amount ?? 0,
      memo,
    })
    return invoice.paymentRequest
  }
  return ctx.graphqlActions.onChainAddressCurrent(walletId)
}

export const prepareReceiveRun = (
  args: PrepareReceiveArgs,
  ctx: ActionToolCtx,
): Promise<ToolResult<InvoiceCard>> =>
  replyingOnError(async (): Promise<ToolResult<InvoiceCard>> => {
    const method = args.method ?? "lightning"
    const amount = requestedAmount(args, ctx)
    // The BTC wallet must be running (it is read through the rail, never
    // the server): syncing, off or failed is its own reply.
    const target = await readWallet(ctx, args.wallet)
    const price = await readPrice(ctx)
    const settlement = amount ? price.convert(amount, target.currency) : undefined
    if (settlement && !(settlement.amount > 0)) {
      throw new ToolReplyError("Assistant.amountTooSmall")
    }
    const memo = args.memo ?? DEFAULT_RECEIVE_MEMO

    const request = await requestFor({
      currency: target.currency,
      method,
      walletId: target.id,
      settlement,
      memo,
      ctx,
    })
    if (!request) throw new ToolReplyError("Assistant.toolFailed")

    const type = method === "lightning" ? Invoice.Lightning : Invoice.OnChain
    // A BIP21 amount is in bitcoin. The cash wallet's on-chain request
    // carries none: the screen would write its cents there as sats.
    const uriAmount =
      method === "onchain" && target.currency !== WalletCurrency.Btc
        ? undefined
        : settlement?.amount
    const uri = (uppercase: boolean) =>
      getPaymentRequestFullUri({
        input: request,
        amount: uriAmount,
        memo,
        uppercase,
        type,
        wallet: target.currency,
        convertMoneyAmount: price.convert,
      })
    const expiresAt =
      method === "lightning" ? decodeBolt11(request)?.expiresAt : undefined

    const card: InvoiceCard = {
      type: "invoice",
      // The QR holds what the receive screen's QR holds, and Share sends what it shares.
      paymentRequest: uri(true),
      shareText: uri(false),
      ...(settlement
        ? {
            amountText: amountText(
              settlement,
              { convert: price.convert, display: ctx.display },
              amount,
            ),
          }
        : {}),
      receiveWallet: target.currency as CardWallet,
      method,
      ...(typeof expiresAt === "number" ? { expiresAt } : {}),
    }
    return { kind: "answer", payload: card }
  })

export const prepareReceive = defineAction<PrepareReceiveArgs, InvoiceCard>({
  intent: "prepareReceive",
  description:
    "Make a payment request (a Lightning invoice or an on-chain address) for one of the user's wallets.",
  input: {
    type: "object",
    properties: {
      wallet: { enum: AMOUNT_CURRENCIES },
      method: { enum: ["lightning", "onchain"] },
      amount: { type: "string", pattern: AMOUNT_PATTERN },
      currency: { enum: AMOUNT_CURRENCIES },
      memo: { type: "string", pattern: "^[\\s\\S]{1,80}$" },
    },
    additionalProperties: false,
  },
  run: prepareReceiveRun,
})
