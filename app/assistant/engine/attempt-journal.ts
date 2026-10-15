import AsyncStorage from "@react-native-async-storage/async-storage"
import { sha256 } from "js-sha256"

import type { WalletCurrency } from "@app/graphql/generated"
import type { GraphqlMutationFns } from "@app/payments/send-payment"
import type { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import type { TransactionMatch } from "../registry/types"
import { canonicalJson } from "./canonical-json"
import { isPlainObject } from "./schema-validator"

// The record of sends whose outcome is not known yet (docs/ai-assistant-tool-
// registry.md §5.1, "Process death"). A send is written down before it is
// dispatched and crossed off when a status comes back. If the app dies in
// between, the record outlives it, and the executor reconciles it against
// the transaction list before it lets the same payment be attempted again:
// a relaunch must not mint a second idempotency key for a payment that may
// already have gone (ENG-533).

export type DispatchRecord = {
  preparedActionId: string
  /** The key the dispatch carried; null for a keyless one. */
  idempotencyKey: string | null
  /** hashPaymentDetail of the payment, which a new action for it shares. */
  paymentDetailHash: string
  /** Epoch milliseconds of the action's first dispatch. */
  dispatchedAt: number
  /** How to find the payment in the transaction list (reconcile.ts). */
  match: TransactionMatch
}

export type AttemptJournal = {
  /** The dispatches still unaccounted for, across relaunches. */
  pending: () => Promise<readonly DispatchRecord[]>
  /**
   * Write a dispatch down. Rejects when it cannot, so nothing is sent
   * unrecorded. An action's first dispatch is the one kept: it is the
   * earliest the payment can have reached the server.
   */
  record: (record: DispatchRecord) => Promise<void>
  /** Cross an action's dispatch off: a status came back. */
  clear: (preparedActionId: string) => Promise<void>
}

export type JournalStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
}

export const ATTEMPT_JOURNAL_KEY = "assistant.pendingDispatches.v1"

const MATCH_FIELDS: Record<TransactionMatch["kind"], readonly string[]> = {
  lightning: ["paymentHash"],
  intraledger: ["counterPartyWalletId", "settlementCurrency", "amount"],
  onchain: ["address"],
}

const isMatch = (value: unknown): value is TransactionMatch => {
  if (!isPlainObject(value) || typeof value.kind !== "string") return false
  const fields: readonly string[] | undefined =
    MATCH_FIELDS[value.kind as TransactionMatch["kind"]]
  return fields !== undefined && fields.every((field) => value[field] !== undefined)
}

const isRecord = (value: unknown): value is DispatchRecord =>
  isPlainObject(value) &&
  typeof value.preparedActionId === "string" &&
  (typeof value.idempotencyKey === "string" || value.idempotencyKey === null) &&
  typeof value.paymentDetailHash === "string" &&
  typeof value.dispatchedAt === "number" &&
  isMatch(value.match)

/** The journal in AsyncStorage, one JSON list, written one operation at a time. */
export const createAttemptJournal = ({
  storage = AsyncStorage,
  key = ATTEMPT_JOURNAL_KEY,
}: { storage?: JournalStorage; key?: string } = {}): AttemptJournal => {
  let queue: Promise<unknown> = Promise.resolve()
  // Read-modify-write runs one at a time, so two dispatches cannot each
  // write a list without the other's record.
  const serially = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation, operation)
    queue = next.catch(() => undefined)
    return next
  }

  const read = async (): Promise<DispatchRecord[]> => {
    const raw = await storage.getItem(key)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isRecord) : []
    } catch (err) {
      console.warn("[assistant] unreadable dispatch journal", err)
      return []
    }
  }
  const write = (records: DispatchRecord[]) =>
    storage.setItem(key, JSON.stringify(records))

  return {
    pending: () => serially(read),
    record: (record) =>
      serially(async () => {
        const records = await read()
        if (
          records.some(
            ({ preparedActionId }) => preparedActionId === record.preparedActionId,
          )
        ) {
          return
        }
        await write([...records, record])
      }),
    clear: (preparedActionId) =>
      serially(async () => {
        const records = await read()
        const kept = records.filter(
          (record) => record.preparedActionId !== preparedActionId,
        )
        if (kept.length !== records.length) await write(kept)
      }),
  }
}

/**
 * The identity of a payment: what it pays, from which wallet, and the amount
 * the user denominated it in. A new action for the same payment hashes the
 * same, whatever was re-derived meanwhile: a settlement amount that moved
 * with the rate, or a freshly minted LNURL invoice, is not in it. The memo
 * is not in it either, so a payment cannot slip past the check by a new memo.
 */
export const hashPaymentDetail = (
  detail: Pick<
    PaymentDetail<WalletCurrency>,
    "paymentType" | "destination" | "sendingWalletDescriptor" | "unitOfAccountAmount"
  >,
): string =>
  sha256(
    canonicalJson({
      paymentType: detail.paymentType,
      destination: detail.destination,
      sendingWallet: {
        id: detail.sendingWalletDescriptor.id,
        currency: detail.sendingWalletDescriptor.currency,
      },
      amount: {
        amount: detail.unitOfAccountAmount.amount,
        currency: detail.unitOfAccountAmount.currency,
      },
    }),
  )

/** The idempotency key a send trigger's options carry, if any. */
const idempotencyKeyOf = (options: unknown): string | null => {
  const variables = isPlainObject(options) ? options.variables : undefined
  const input = isPlainObject(variables) ? variables.input : undefined
  const key = isPlainObject(input) ? input.idempotencyKey : undefined
  return typeof key === "string" ? key : null
}

/**
 * The nine GraphQL send triggers, each writing its dispatch down (and waiting
 * for the write) before it sends. An action's execute() hands these to
 * sendPayment in place of the plain triggers. A trigger whose record cannot
 * be written rejects without sending.
 */
export const journalMutations = (
  mutations: GraphqlMutationFns,
  journalDispatch: (idempotencyKey: string | null) => Promise<void>,
): GraphqlMutationFns => {
  const journaled =
    <O, R>(trigger: (options?: O) => Promise<R>) =>
    async (options?: O): Promise<R> => {
      await journalDispatch(idempotencyKeyOf(options))
      return trigger(options)
    }
  return {
    intraLedgerPaymentSend: journaled(mutations.intraLedgerPaymentSend),
    intraLedgerUsdPaymentSend: journaled(mutations.intraLedgerUsdPaymentSend),
    lnInvoicePaymentSend: journaled(mutations.lnInvoicePaymentSend),
    lnNoAmountInvoicePaymentSend: journaled(mutations.lnNoAmountInvoicePaymentSend),
    lnNoAmountUsdInvoicePaymentSend: journaled(mutations.lnNoAmountUsdInvoicePaymentSend),
    onChainPaymentSend: journaled(mutations.onChainPaymentSend),
    onChainPaymentSendAll: journaled(mutations.onChainPaymentSendAll),
    onChainUsdPaymentSend: journaled(mutations.onChainUsdPaymentSend),
    onChainUsdPaymentSendAsBtcDenominated: journaled(
      mutations.onChainUsdPaymentSendAsBtcDenominated,
    ),
  }
}
