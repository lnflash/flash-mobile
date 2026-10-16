import type { BtcRail } from "@app/payments/btc-rail"
import type { SendPaymentDeps } from "@app/payments/send-payment"
import { journalMutations } from "../../../engine/attempt-journal"
import type { ActionToolCtx, ExecuteContext } from "../../types"

// Every dispatch an action's execute() makes is written down first (spec
// §5.1, "Process death"). journalMutations does it for the nine GraphQL
// triggers; this does it for the BTC rail's three sends, so a Breez send is
// recorded too. A write that fails sends nothing, and says so in a way
// sendPayment reads as a refusal before dispatch, which re-arms Confirm.
// sendPayment keeps Confirm disarmed on any rejection out of payInvoice
// (ENG-720) or payOnchain (ENG-714), as a payment that may have left (spec
// v0.2.11 §5): so those two answer success: false with no outcomeUnknown,
// as payLightningBreez and payOnchainBreez answer every refusal before their
// dispatch. payLnurl rejects: the LNURL branch's shared catch re-arms on any
// rejection but LnurlPayOutcomeUnknownError (ENG-711).

/** What the bolt11 send answers when its dispatch could not be written down. */
export const UNRECORDED_INVOICE_SEND =
  "The payment could not be recorded, so it was not sent."

/** What the on-chain send answers when its dispatch could not be written down. */
export const UNRECORDED_ONCHAIN_SEND =
  "The withdrawal could not be recorded, so it was not sent."

/** The BTC rail, its sends each awaiting the journal first. Its reads pass through. */
export const journaledBtcRail = (
  rail: BtcRail,
  journalDispatch: ExecuteContext["journalDispatch"],
): BtcRail => ({
  ...rail,
  payInvoice: async (...args) => {
    try {
      await journalDispatch(null)
    } catch {
      return { success: false, error: UNRECORDED_INVOICE_SEND }
    }
    return rail.payInvoice(...args)
  },
  payLnurl: async (...args) => {
    await journalDispatch(null)
    return rail.payLnurl(...args)
  },
  payOnchain: async (...args) => {
    try {
      await journalDispatch(null)
    } catch {
      return { success: false, error: UNRECORDED_ONCHAIN_SEND }
    }
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
