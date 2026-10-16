import type { BtcRail } from "@app/payments/btc-rail"
import type { SendPaymentDeps } from "@app/payments/send-payment"
import { journalMutations } from "../../../engine/attempt-journal"
import type { ActionToolCtx, ExecuteContext } from "../../types"

// Every dispatch an action's execute() makes is written down first (spec
// §5.1, "Process death"). journalMutations does it for the nine GraphQL
// triggers; this does it for the BTC rail's three sends, so a Breez send is
// recorded too. A write that fails rejects the send before it goes out:
// sendPayment's Breez branch reads that rejection as a refusal before
// dispatch, which it is.

/** The BTC rail, its sends each awaiting the journal first. Its reads pass through. */
export const journaledBtcRail = (
  rail: BtcRail,
  journalDispatch: ExecuteContext["journalDispatch"],
): BtcRail => ({
  ...rail,
  payInvoice: async (...args) => {
    await journalDispatch(null)
    return rail.payInvoice(...args)
  },
  payLnurl: async (...args) => {
    await journalDispatch(null)
    return rail.payLnurl(...args)
  },
  payOnchain: async (...args) => {
    await journalDispatch(null)
    return rail.payOnchain(...args)
  },
})

/** sendPayment's deps for one Confirm: every trigger and every rail send journaled. */
export const journaledSendDeps = (
  ctx: Pick<ActionToolCtx, "send" | "btcRail">,
  journalDispatch: ExecuteContext["journalDispatch"],
): SendPaymentDeps => ({
  mutations: journalMutations(ctx.send.mutations, journalDispatch),
  btcRail: journaledBtcRail(ctx.btcRail, journalDispatch),
  graphqlUri: ctx.send.graphqlUri,
  lnAddressHostname: ctx.send.lnAddressHostname,
})
