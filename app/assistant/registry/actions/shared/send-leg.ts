import { WalletCurrency } from "@app/graphql/generated"
import { AttemptState, sendPayment, SendPaymentArgs } from "@app/payments/send-payment"
import type {
  PaymentDetail,
  SendPaymentMutation,
} from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import {
  addMoneyAmounts,
  MoneyAmount,
  toBtcMoneyAmount,
  WalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { hashPaymentDetail } from "../../../engine/attempt-journal"
import { PrepareRefusedError } from "../../refusals"
import type {
  ActionToolCtx,
  ClarificationCard,
  ExecuteContext,
  SingleTransactionMatch,
} from "../../types"
import { isRateDependent } from "./amount"
import { ToolReplyError } from "./errors"
import {
  decodeBolt11,
  FEE_PROBE_TTL_MS,
  MAX_ACTION_TTL_MS,
  minExpiry,
  RATE_TTL_MS,
} from "./expiry"
import { probeSendFee } from "./fee"
import { assertBreezSendOpen } from "./gates"
import { journaledSendDeps } from "./journal"
import { checkLimit } from "./limits"
import { DispatchResult, dispatchResultOf } from "./outcome"
import type { ResolvedPayee } from "./payee"
import type { PriceRead } from "./price"
import type { SourceWallet } from "./wallets"

// One payment, prepared the way the send flow prepares it (spec §5): the
// destination's own PaymentDetail builder, the amount and memo set on it,
// an LNURL invoice minted for a cash-wallet send, the fee probed, the
// balance and the limit checked, and how long its numbers hold. prepareSend
// is one of these; a group send is one per leg.

/** The least an on-chain send from the cash wallet may move: the send screen's own floor (isValidAmount). */
export const CASH_ONCHAIN_MIN_CENTS = 200

export type SendLegInput = {
  payee: ResolvedPayee
  /** The amount in the unit the user named; undefined when the request fixes it. */
  amount?: MoneyAmount<WalletOrDisplayCurrency>
  memo?: string
  source: SourceWallet
  price: PriceRead
}

export type PreparedSendLeg = {
  detail: PaymentDetail<WalletCurrency>
  fee: WalletAmount<WalletCurrency>
  /** What leaves the source wallet: the settlement amount and the fee. */
  total: WalletAmount<WalletCurrency>
  /**
   * The send carries no idempotency key to the server: a BTC-rail send, or
   * an on-chain one. It is never retried from its card (spec v0.2.6 §5).
   */
  keyless: boolean
  /** The payment's identity and how the transaction list shows it. */
  paymentDetailHash: string
  match: SingleTransactionMatch
  /** When its numbers stop holding, epoch ms. */
  expiresAt: number
  /**
   * The user's memo, when the payment carries it: set on the detail, or
   * sent as an LNURL comment the service takes. The BTC rail sends none
   * (sendPayment pays an LNURL with an empty comment), so a card shows a
   * memo only when it travels.
   */
  memo?: string
  /** sendPayment's arguments, frozen at prepare. */
  sendArgs: SendPaymentArgs
}

export type SendLegResult =
  | { kind: "leg"; leg: PreparedSendLeg }
  | { kind: "clarification"; card: ClarificationCard }

/**
 * sendPayment's closure argument for a BTC-wallet send. sendPayment's Breez
 * branch never calls it: the rail pays the detail's destination itself. A
 * BTC LNURL detail has no closure of its own (it gets an invoice only from
 * Breez, at send time), so this stands in, and refuses if it ever runs.
 */
const BREEZ_SENDS_THIS: SendPaymentMutation = () =>
  Promise.reject(new Error("A BTC-wallet send goes through the BTC rail"))

/**
 * Mint the cash-wallet LNURL invoice the send screen mints at Next, at
 * exactly the amount, and attach it. The user's memo goes as the comment
 * when the service takes one that long. (The screen sends the detail's memo,
 * which for an LNURL payee is the service's own description.)
 */
const withLnurlInvoice = async (
  detail: PaymentDetail<WalletCurrency>,
  memo: string | undefined,
  ctx: Pick<ActionToolCtx, "requestLnurlInvoice">,
): Promise<{ detail: PaymentDetail<WalletCurrency>; comment?: string }> => {
  if (detail.paymentType !== "lnurl") return { detail }
  const sats = detail.convertMoneyAmount(
    detail.unitOfAccountAmount,
    WalletCurrency.Btc,
  ).amount
  if (!Number.isSafeInteger(sats) || sats <= 0) {
    throw new ToolReplyError("Assistant.amountTooSmall")
  }
  // The service's own bounds, in sats (LUD-06): outside them it mints nothing.
  const { min, max, commentAllowed } = detail.lnurlParams
  if (sats < min || sats > max) {
    throw new ToolReplyError("Assistant.amountOutsideRecipientLimits")
  }
  const comment = memo && commentAllowed >= memo.length ? memo : undefined
  let invoice: string
  try {
    ;({ invoice } = await ctx.requestLnurlInvoice({
      lnUrlOrAddress: detail.destination,
      sats,
      comment,
    }))
  } catch {
    throw new ToolReplyError("Assistant.recipientInvoiceFailed")
  }
  // The screen refuses an invoice for another amount than it asked for
  // (lnurlInvoiceIncorrectAmount), and so does this.
  if (decodeBolt11(invoice)?.sats !== sats) {
    throw new ToolReplyError("Assistant.recipientInvoiceFailed")
  }
  return {
    detail: detail.setInvoice({
      paymentRequest: invoice,
      paymentRequestAmount: toBtcMoneyAmount(sats),
    }),
    comment,
  }
}

/** How the transaction list will show this payment (reconcile.ts). */
const matchOf = (
  detail: PaymentDetail<WalletCurrency>,
  payee: ResolvedPayee,
): SingleTransactionMatch => {
  // The BTC wallet's payments are not in the GraphQL list at all.
  if (detail.sendingWalletDescriptor.currency === WalletCurrency.Btc)
    return { kind: "btcRail" }
  switch (detail.paymentType) {
    case "intraledger":
      if (!payee.recipientWalletId) throw new ToolReplyError("Assistant.toolFailed")
      return {
        kind: "intraledger",
        counterPartyWalletId: payee.recipientWalletId,
        settlementCurrency: detail.settlementAmount.currency,
        amount: Math.abs(detail.settlementAmount.amount),
      }
    case "onchain":
      return { kind: "onchain", address: detail.destination }
    default: {
      // A bolt11, whether scanned or minted for an LNURL payee.
      const paymentHash = detail.paymentRequest
        ? decodeBolt11(detail.paymentRequest)?.paymentHash
        : undefined
      if (!paymentHash) throw new ToolReplyError("Assistant.toolFailed")
      return { kind: "lightning", paymentHash }
    }
  }
}

/** The memo the payment carries for the user, if any. */
const memoCarried = ({
  detail,
  memo,
  comment,
  fromBtc,
}: {
  detail: PaymentDetail<WalletCurrency>
  memo?: string
  comment?: string
  fromBtc: boolean
}): string | undefined => {
  if (fromBtc || !memo) return undefined
  if (detail.paymentType === "lnurl") return comment
  return detail.memo === memo ? memo : undefined
}

export const prepareSendLeg = async (
  { payee, amount, memo, source, price }: SendLegInput,
  ctx: ActionToolCtx,
): Promise<SendLegResult> => {
  const paymentType = payee.destination.validDestination.paymentType
  const fromBtc = source.currency === WalletCurrency.Btc
  // A gated Breez branch is refused before anything is asked of anyone.
  if (fromBtc) assertBreezSendOpen(paymentType)

  let detail = payee.destination.createPaymentDetail({
    convertMoneyAmount: price.convert,
    sendingWalletDescriptor: { id: source.id, currency: source.currency },
  })

  if (detail.canSetAmount) {
    if (!amount) {
      return {
        kind: "clarification",
        card: { type: "clarification", prompt: "Assistant.amountRequired", options: [] },
      }
    }
    detail = detail.setAmount(amount)
  } else if (amount) {
    // The request names its own amount; a second one is not a guess to make.
    throw new ToolReplyError("Assistant.amountFixedByRequest")
  }
  if (memo && detail.canSetMemo) detail = detail.setMemo(memo)

  // The cash wallet's on-chain send is USD-denominated only. An on-chain
  // request that sets a bitcoin amount (BIP21) settles through the
  // BTC-denominated mutation, which the API refuses
  // (payOnChainByWalletIdForUsdWalletAndBtcAmount): no card for it.
  if (!fromBtc && detail.paymentType === "onchain" && !detail.canSetAmount) {
    throw new ToolReplyError("Assistant.onchainAmountUnsupported")
  }

  let comment: string | undefined
  if (!fromBtc) ({ detail, comment } = await withLnurlInvoice(detail, memo, ctx))

  const settlement = detail.settlementAmount
  if (!Number.isFinite(settlement.amount))
    throw new ToolReplyError("Assistant.toolFailed")
  if (settlement.amount <= 0) throw new ToolReplyError("Assistant.amountTooSmall")
  if (
    !fromBtc &&
    detail.paymentType === "onchain" &&
    settlement.amount < CASH_ONCHAIN_MIN_CENTS
  ) {
    throw new ToolReplyError("Assistant.onchainBelowMinimum")
  }

  // A cash-wallet send to a Flash user costs nothing and asks no network
  // for its fee (payment-details/intraledger.ts); every other fee is probed.
  const probedAt = ctx.now()
  const fee = await probeSendFee(detail, ctx)
  const feeWasProbed = fromBtc || detail.paymentType !== "intraledger"
  const total = addMoneyAmounts({ a: settlement, b: fee })

  // Affordability before a card (spec §5.1): the payment and its fee.
  if (total.amount > source.balance.amount) {
    throw new PrepareRefusedError("insufficientBalance")
  }
  await checkLimit(
    ctx,
    detail.paymentType === "intraledger" ? "internalSend" : "withdrawal",
    // In cents, as the send screen counts a payment against its limits.
    detail.convertMoneyAmount(detail.unitOfAccountAmount, WalletCurrency.Usd).amount,
  )

  const decodedInvoice = detail.paymentRequest
    ? decodeBolt11(detail.paymentRequest)
    : null
  const expiresAt = minExpiry([
    // The longest any card holds: the fixed-cent intraledger send's hygiene cap.
    ctx.now() + MAX_ACTION_TTL_MS,
    feeWasProbed ? probedAt + FEE_PROBE_TTL_MS : null,
    isRateDependent(detail.unitOfAccountAmount, settlement.currency)
      ? price.readAt + RATE_TTL_MS
      : null,
    decodedInvoice?.expiresAt,
  ])

  if (!fromBtc && !detail.canSendPayment) throw new ToolReplyError("Assistant.toolFailed")
  const sendPaymentMutation =
    !fromBtc && detail.canSendPayment ? detail.sendPaymentMutation : BREEZ_SENDS_THIS

  return {
    kind: "leg",
    leg: {
      detail,
      fee,
      total,
      keyless: fromBtc || detail.paymentType === "onchain",
      paymentDetailHash: hashPaymentDetail(detail),
      match: matchOf(detail, payee),
      expiresAt,
      memo: memoCarried({ detail, memo, comment, fromBtc }),
      sendArgs: { sendPaymentMutation, paymentDetail: detail },
    },
  }
}

/**
 * Dispatch one prepared payment through the shared sendPayment (ENG-686),
 * under the caller's AttemptState for it, with every trigger and every rail
 * send writing its dispatch down first, and read what it did.
 */
export const dispatchSendLeg = ({
  leg,
  ctx,
  attempt,
  journalDispatch,
}: {
  leg: PreparedSendLeg
  ctx: Pick<ActionToolCtx, "send" | "btcRail">
  /** The one AttemptState of this payment: the action's, or its leg's. */
  attempt: AttemptState
  journalDispatch: ExecuteContext["journalDispatch"]
}): Promise<DispatchResult> =>
  dispatchResultOf(
    () => sendPayment(leg.sendArgs, journaledSendDeps(ctx, journalDispatch), attempt),
    attempt,
  )

/** The source wallet's balance after a payment, in its own currency (cents for cash). */
export const balanceAfter = (
  source: SourceWallet,
  spent: WalletAmount<WalletCurrency>,
): WalletAmount<WalletCurrency> => ({
  ...source.balance,
  amount: source.balance.amount - spent.amount,
})
