import { WalletCurrency } from "@app/graphql/generated"
import type { SendPaymentArgs } from "@app/payments/send-payment"
import type { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { toWalletAmount, WalletAmount } from "@app/types/amounts"
import { PrepareRefusedError } from "../../refusals"
import type { ActionToolCtx } from "../../types"
import { ToolReplyError } from "./errors"

export type OnchainFeeSpeed = NonNullable<SendPaymentArgs["selectedFeeType"]>

/**
 * The speed a BTC-wallet on-chain send pays for, and is probed at. The send
 * screen makes the user pick one (send-bitcoin-details-screen.tsx, Fees) and
 * hands that one speed to both its fee probe and sendPayment. The assistant
 * has no picker, so it names one and hands it to both the same way
 * (probeSendFee here, the send's selectedFeeType in send-leg.ts): the card's
 * fee, its total and the affordability check are then the withdrawal's own.
 * Left out, the two would differ: the probe reads medium
 * (fee-extraction.ts) and sendPayment pays fast. Medium is the speed the
 * fee extraction reads for a caller that names none.
 */
export const BTC_ONCHAIN_FEE_SPEED: OnchainFeeSpeed = "medium"

/**
 * The fee a send will pay, in the sending wallet's currency, probed the way
 * the send screen probes it before the confirmation screen
 * (send-bitcoin-details-screen.tsx, fetchSendingFee): the BTC wallet through
 * the BTC rail's probeFee, any other wallet through the detail's own getFee
 * with the fee triggers useFee hands it. A fee that cannot be had ends the
 * prepare with a reply: a card never shows a fee of 0 that was not probed.
 */
export const probeSendFee = async (
  detail: PaymentDetail<WalletCurrency>,
  ctx: Pick<ActionToolCtx, "btcRail" | "graphqlActions" | "send">,
): Promise<WalletAmount<WalletCurrency>> => {
  const currency = detail.sendingWalletDescriptor.currency
  if (currency === WalletCurrency.Btc) {
    const { fee, err } = await ctx.btcRail.probeFee({
      paymentType: detail.paymentType,
      // The rail pays a Flash user at their Lightning address, as
      // sendPayment's intraledger branch and the send screen both do.
      paymentRequest:
        detail.paymentType === "intraledger"
          ? `${detail.destination}@${ctx.send.lnAddressHostname}`
          : detail.destination,
      amountSats: detail.settlementAmount.amount,
      // An on-chain fee depends on the speed: the one the send pays for.
      ...(detail.paymentType === "onchain"
        ? { selectedFeeType: BTC_ONCHAIN_FEE_SPEED }
        : {}),
    })
    if (err?.kind === "amount-below-min" || err?.kind === "amount-above-max") {
      throw new ToolReplyError("Assistant.amountOutsideRecipientLimits")
    }
    if (err?.kind === "insufficient-funds")
      throw new PrepareRefusedError("insufficientBalance")
    if (err || fee === null || !Number.isFinite(fee)) {
      throw new ToolReplyError("Assistant.feeUnavailable")
    }
    return toWalletAmount({ amount: fee, currency })
  }

  if (!detail.canGetFee) throw new ToolReplyError("Assistant.feeUnavailable")
  let probed: Awaited<ReturnType<typeof detail.getFee>>
  try {
    probed = await detail.getFee(ctx.graphqlActions.feeProbes)
  } catch {
    throw new ToolReplyError("Assistant.feeUnavailable")
  }
  // As useFee reads it: an error, or no amount, is no fee.
  if (probed.errors?.length || !probed.amount || !Number.isFinite(probed.amount.amount)) {
    throw new ToolReplyError("Assistant.feeUnavailable")
  }
  return probed.amount
}
