import {
  compileSchema,
  isPlainObject,
  JsonSchema,
  ObjectSchema,
  Validator,
} from "../engine/schema-validator"
import { PREPARE_REFUSAL_REPLY } from "../registry/refusals"
import type {
  ClarificationCard,
  PrepareRefusalCard,
  PreparedAction,
} from "../registry/types"

// The action cards (docs/ai-assistant-tool-registry.md §6): the boundary the
// model's words never cross. Every number on a card is text the tool
// formatted from a rail's answer; a card component renders these fields and
// formats nothing. Every payload is checked at render time by the same
// hand-written validator the router checks tool input with (spec v0.2.5),
// and one that fails renders the templated error card, never part of a card.
//
// A prepared action carries its card in `summary`: the card's fields
// without its id and expiry, which come from the action itself. The summary
// is what the executor compares, byte for byte, when an expired action is
// prepared again (executor.ts, step 4), so it holds the numbers the user
// sees and nothing that changes on its own (not the expiry).

/** Which wallet a payment leaves or reaches; the card names it. */
export type CardWallet = "BTC" | "USD" | "USDT"

export type ConfirmPaymentCard = {
  type: "confirmPayment"
  /** The contact's name, the address, the invoice shortened. */
  payeeLabel: string
  /** A Flash user's full username, always shown when there is one (spec §4). */
  payeeUsername?: string
  amountText: string
  feeText: string
  totalText: string
  /** The source wallet's balance after the payment (spec v0.2.5 §5.1). */
  balanceAfterText: string
  sourceWallet: CardWallet
  /**
   * Set for a conversion (prepareConversion): the payment goes to the
   * user's own other wallet, which the card names, and payeeLabel holds
   * that wallet's currency.
   */
  toWallet?: CardWallet
  /**
   * What reaches that wallet, when it is not the amount: a conversion to
   * the BTC wallet arrives less the wallet's own fee for receiving. It is
   * its own line, so amount and fee still add up to the total that leaves
   * the source wallet.
   */
  receiveText?: string
  /** The memo the payment carries, when it carries one. */
  memo?: string
  expiresAt: number
  preparedActionId: string
}

export type InvoiceCard = {
  type: "invoice"
  /** What the QR code holds: a bolt11, or an on-chain address. */
  paymentRequest: string
  /** What Share and Copy hand on: the request in full. */
  shareText: string
  /** The amount asked for, when the request asks for one. */
  amountText?: string
  receiveWallet: CardWallet
  method: "lightning" | "onchain"
  /** When a Lightning invoice stops being payable, epoch ms. An address does not expire. */
  expiresAt?: number
}

/**
 * A group send leg's state: pending before the first Confirm, then what its
 * dispatch did, or not_attempted when an earlier leg stopped the run.
 */
export type LegStatus = "pending" | "success" | "failed" | "not_attempted" | "unknown"

export type GroupSendLeg = {
  payeeLabel: string
  payeeUsername: string
  amountText: string
  status: LegStatus
}

export type GroupSendSummaryCard = {
  type: "groupSendSummary"
  legs: GroupSendLeg[]
  totalText: string
  balanceAfterText: string
  sourceWallet: CardWallet
  memo?: string
  expiresAt: number
  preparedActionId: string
}

export type TxListCard = {
  type: "txList"
  txIds: string[]
  /** What was searched, so a miss is never silent ("your last 100 payments"). */
  windowText: string
}

export type CashoutOfferCard = {
  type: "cashoutOffer"
  /** What leaves the cash wallet. */
  amountText: string
  feeText: string
  /** What reaches the bank account. */
  receiveText: string
  bankLabel: string
  expiresAt: number
  preparedActionId: string
}

/** A card whose numbers went stale: its Confirm became Refresh. */
export type ExpiredCard = { type: "expired"; preparedActionId: string }

export type ActionCard =
  | ConfirmPaymentCard
  | InvoiceCard
  | GroupSendSummaryCard
  | TxListCard
  | ClarificationCard
  | CashoutOfferCard
  | ExpiredCard
  // The templated error card for a refused prepare (spec §5.1): what runTool
  // answers a shortfall, a limit or a gated branch with (registry/refusals.ts).
  | PrepareRefusalCard

export type CardType = ActionCard["type"]

/** A card's fields as a prepared action's summary holds them. */
export type CardSummary<C extends { expiresAt: number; preparedActionId: string }> = Omit<
  C,
  "expiresAt" | "preparedActionId"
>

// ---------------------------------------------------------------------------
// Render-time validation
// ---------------------------------------------------------------------------

/** Text a card shows: a string with something in it. */
const text: JsonSchema = { type: "string", pattern: "\\S" }
const wallet: JsonSchema = { enum: ["BTC", "USD", "USDT"] }
const expiry: JsonSchema = { type: "number" }

const closed = (
  properties: Record<string, JsonSchema>,
  required: readonly string[],
): ObjectSchema => ({ type: "object", properties, required, additionalProperties: false })

const SCHEMAS: Record<CardType, ObjectSchema> = {
  confirmPayment: closed(
    {
      type: { enum: ["confirmPayment"] },
      payeeLabel: text,
      payeeUsername: text,
      amountText: text,
      feeText: text,
      totalText: text,
      balanceAfterText: text,
      sourceWallet: wallet,
      toWallet: wallet,
      receiveText: text,
      memo: text,
      expiresAt: expiry,
      preparedActionId: text,
    },
    [
      "type",
      "payeeLabel",
      "amountText",
      "feeText",
      "totalText",
      "balanceAfterText",
      "sourceWallet",
      "expiresAt",
      "preparedActionId",
    ],
  ),
  invoice: closed(
    {
      type: { enum: ["invoice"] },
      paymentRequest: text,
      shareText: text,
      amountText: text,
      receiveWallet: wallet,
      method: { enum: ["lightning", "onchain"] },
      expiresAt: expiry,
    },
    ["type", "paymentRequest", "shareText", "receiveWallet", "method"],
  ),
  groupSendSummary: closed(
    {
      type: { enum: ["groupSendSummary"] },
      legs: {
        type: "array",
        minItems: 1,
        items: closed(
          {
            payeeLabel: text,
            payeeUsername: text,
            amountText: text,
            status: {
              enum: ["pending", "success", "failed", "not_attempted", "unknown"],
            },
          },
          ["payeeLabel", "payeeUsername", "amountText", "status"],
        ),
      },
      totalText: text,
      balanceAfterText: text,
      sourceWallet: wallet,
      memo: text,
      expiresAt: expiry,
      preparedActionId: text,
    },
    [
      "type",
      "legs",
      "totalText",
      "balanceAfterText",
      "sourceWallet",
      "expiresAt",
      "preparedActionId",
    ],
  ),
  txList: closed(
    {
      type: { enum: ["txList"] },
      txIds: { type: "array", items: text },
      windowText: text,
    },
    ["type", "txIds", "windowText"],
  ),
  clarification: closed(
    {
      type: { enum: ["clarification"] },
      // A key of the Assistant namespace; the card resolves it through LL.
      prompt: { type: "string", pattern: "^Assistant\\.[A-Za-z]+$" },
      options: {
        type: "array",
        items: closed({ id: text, label: text, sublabel: text }, ["id", "label"]),
      },
      about: text,
    },
    ["type", "prompt", "options"],
  ),
  cashoutOffer: closed(
    {
      type: { enum: ["cashoutOffer"] },
      amountText: text,
      feeText: text,
      receiveText: text,
      bankLabel: text,
      expiresAt: expiry,
      preparedActionId: text,
    },
    [
      "type",
      "amountText",
      "feeText",
      "receiveText",
      "bankLabel",
      "expiresAt",
      "preparedActionId",
    ],
  ),
  expired: closed({ type: { enum: ["expired"] }, preparedActionId: text }, [
    "type",
    "preparedActionId",
  ]),
  prepareRefused: closed(
    {
      type: { enum: ["prepareRefused"] },
      // Every reason a prepare can refuse with, each with its own reply.
      reason: { enum: Object.keys(PREPARE_REFUSAL_REPLY) },
    },
    ["type", "reason"],
  ),
}

// Compiled once, when the module loads: a schema the validator cannot
// enforce fails here, not at a user's card.
const VALIDATORS = Object.fromEntries(
  Object.entries(SCHEMAS).map(([type, schema]) => [type, compileSchema(schema)]),
) as Record<CardType, Validator>

export type CardValidation =
  | { valid: true; card: ActionCard }
  | { valid: false; path: string; problem: string }

/**
 * Check a card payload before it renders. A payload of an unknown type, with
 * a field missing, an empty text or a field no card of its type has, fails:
 * the renderer then shows the templated error card.
 */
export const validateCard = (payload: unknown): CardValidation => {
  if (!isPlainObject(payload) || typeof payload.type !== "string") {
    return { valid: false, path: "$.type", problem: "is not a card" }
  }
  if (!Object.prototype.hasOwnProperty.call(VALIDATORS, payload.type)) {
    return {
      valid: false,
      path: "$.type",
      problem: `is not a card type: ${payload.type}`,
    }
  }
  const result = VALIDATORS[payload.type as CardType](payload)
  return result.valid ? { valid: true, card: payload as ActionCard } : result
}

/** The card for a prepared action: its summary, with the action's own id and expiry. */
export const cardOf = (
  action: Pick<PreparedAction, "id" | "expiresAt" | "summary">,
  summary: PreparedAction["summary"] = action.summary,
): unknown => ({ ...summary, expiresAt: action.expiresAt, preparedActionId: action.id })
