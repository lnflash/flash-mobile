import type {
  CashoutOfferCard,
  ConfirmPaymentCard,
  ExpiredCard,
  GroupSendSummaryCard,
  InvoiceCard,
  TxListCard,
} from "./types"
import type { ClarificationCard, PrepareRefusalCard } from "../registry/types"

// One valid payload per card type, for the card stories and specs. Not used
// by the app: real cards come from the action tools.

/** Far enough ahead that a story or a spec card has not expired. */
export const FIXTURE_EXPIRES_AT = 4_102_444_800_000 // 2100-01-01

export const confirmPaymentFixture: ConfirmPaymentCard = {
  type: "confirmPayment",
  payeeLabel: "Mom",
  payeeUsername: "jane_doe",
  amountText: "J$785.00 ($5.00)",
  feeText: "J$0.00 ($0.00)",
  totalText: "J$785.00 ($5.00)",
  balanceAfterText: "J$11,775.00 ($75.00)",
  sourceWallet: "USD",
  memo: "Lunch",
  expiresAt: FIXTURE_EXPIRES_AT,
  preparedActionId: "action-confirm",
}

export const invoiceFixture: InvoiceCard = {
  type: "invoice",
  paymentRequest:
    "lnbc50u1p3assistantfixture0000000000000000000000000000000000000000000000000000",
  shareText:
    "lnbc50u1p3assistantfixture0000000000000000000000000000000000000000000000000000",
  amountText: "J$785.00 ($5.00)",
  receiveWallet: "USD",
  method: "lightning",
  expiresAt: FIXTURE_EXPIRES_AT,
}

export const groupSendFixture: GroupSendSummaryCard = {
  type: "groupSendSummary",
  legs: [
    {
      payeeLabel: "Alice",
      payeeUsername: "alice",
      amountText: "$3.34",
      status: "pending",
    },
    { payeeLabel: "Bob", payeeUsername: "bob", amountText: "$3.33", status: "pending" },
    {
      payeeLabel: "Carol",
      payeeUsername: "carol",
      amountText: "$3.33",
      status: "pending",
    },
  ],
  totalText: "$10.00",
  balanceAfterText: "$70.00",
  sourceWallet: "USD",
  memo: "Dinner",
  expiresAt: FIXTURE_EXPIRES_AT,
  preparedActionId: "action-group",
}

export const txListFixture: TxListCard = {
  type: "txList",
  txIds: ["tx-1", "tx-2", "tx-3"],
  windowText: "Searched your last 100 payments.",
}

export const clarificationFixture: ClarificationCard = {
  type: "clarification",
  prompt: "Assistant.pickContact",
  options: [
    { id: "contact:alice", label: "Alice", sublabel: "alice" },
    { id: "contact:alina", label: "Alina", sublabel: "alina_k" },
  ],
}

/** A Flash user who is not a contact, offered alone (ENG-730). */
export const flashUserClarificationFixture: ClarificationCard = {
  type: "clarification",
  prompt: "Assistant.pickFlashUser",
  options: [{ id: "contact:dreadmax", label: "dreadmax", sublabel: "dreadmax" }],
  about: "dreadmax",
}

export const cashoutOfferFixture: CashoutOfferCard = {
  type: "cashoutOffer",
  amountText: "$100.00",
  feeText: "$2.00",
  receiveText: "J$15,386.00",
  bankLabel: "NCB ••4321",
  expiresAt: FIXTURE_EXPIRES_AT,
  preparedActionId: "action-cashout",
}

export const expiredFixture: ExpiredCard = {
  type: "expired",
  preparedActionId: "action-expired",
}

export const prepareRefusedFixture: PrepareRefusalCard = {
  type: "prepareRefused",
  reason: "insufficientBalance",
}
