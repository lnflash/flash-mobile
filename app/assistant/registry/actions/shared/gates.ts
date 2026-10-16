import type { PaymentType } from "@galoymoney/client"

import { PrepareRefusedError } from "../../refusals"

// Which of sendPayment's Breez branches the assistant may dispatch through
// (ENG-688 plan, addendum of 2026-10-15; spec v0.2.11 §5.1). A Breez send
// carries no idempotency key the SDK is known to replay (ENG-715), so a
// rejection that comes after the SDK dispatched must keep Confirm disarmed
// (spec v0.2.6 §5). sendPayment does that for every branch now: the LNURL
// and intraledger branch since ENG-711, the on-chain branch since ENG-714
// (#786) and the bolt11 branch since ENG-720 (#788), each answering such a
// rejection, and any rejection out of the rail itself, with the
// check-your-history message and no re-arm. So no gate is closed. A gate
// names the ticket that must land before its branch opens: a branch found to
// re-arm after dispatch again is closed here, with its ticket, and the
// assistant then refuses it at prepare, before any card exists, with the
// templated "not available yet" card.

export type BreezSendType = Extract<
  PaymentType,
  "lightning" | "lnurl" | "intraledger" | "onchain"
>

export const BREEZ_SEND_GATES: Record<BreezSendType, string | null> = {
  intraledger: null, // ENG-694, ENG-711
  lnurl: null, // ENG-694, ENG-711
  lightning: null, // ENG-712, ENG-720: a rejection after the payment may have left stays disarmed
  onchain: null, // ENG-714: a rejection after the withdrawal may have left stays disarmed
}

const isBreezSendType = (paymentType: string): paymentType is BreezSendType =>
  paymentType in BREEZ_SEND_GATES

/** Refuse, with the not-available card, a BTC-wallet send down a gated branch. */
export const assertBreezSendOpen = (paymentType: string): void => {
  if (!isBreezSendType(paymentType) || BREEZ_SEND_GATES[paymentType] !== null) {
    throw new PrepareRefusedError("notAvailableYet")
  }
}
