import type { PaymentType } from "@galoymoney/client"

import { PrepareRefusedError } from "../../refusals"

// Which of sendPayment's Breez branches the assistant may dispatch through
// (ENG-688 plan, addendum of 2026-10-15; spec v0.2.10 §5.1). A Breez send
// carries no idempotency key the SDK is known to replay (ENG-715), so a
// rejection that comes after the SDK dispatched must keep Confirm disarmed
// (spec v0.2.6 §5). sendPayment does that for the LNURL and intraledger
// branch since ENG-711, and for the on-chain branch since ENG-714 (#786);
// the bolt11 branch still re-arms on such a rejection, so the assistant
// refuses it at prepare, before any card exists, with the templated "not
// available yet" card. Each gate names the ticket that opens it: set its
// entry to null, and flip the branch's tests, when it merges.

export type BreezSendType = Extract<
  PaymentType,
  "lightning" | "lnurl" | "intraledger" | "onchain"
>

export const BREEZ_SEND_GATES: Record<BreezSendType, string | null> = {
  intraledger: null, // ENG-694, ENG-711
  lnurl: null, // ENG-694, ENG-711
  lightning: "ENG-720", // bolt11: payLightningBreez re-arms on a rejection after dispatch
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
