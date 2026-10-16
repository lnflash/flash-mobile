import AsyncStorage from "@react-native-async-storage/async-storage"
import { sha256 } from "js-sha256"

import type { WalletCurrency } from "@app/graphql/generated"
import type { GraphqlMutationFns } from "@app/payments/send-payment"
import type { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import type { MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"
import type { SingleTransactionMatch, TransactionMatch } from "../registry/types"
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
  /** The key the action's first dispatch carried; null for a keyless one. */
  idempotencyKey: string | null
  /** hashPaymentDetail of the payment, which a new action for it shares. */
  paymentDetailHash: string
  /**
   * Epoch milliseconds of the action's first dispatch: the earliest the
   * payment can have reached the server, so the list is read back to it.
   */
  dispatchedAt: number
  /**
   * Epoch milliseconds of the action's latest dispatch, a retry under the
   * same key included: the latest the payment can have set off, so its
   * absence from the list proves nothing until this one is old enough.
   */
  lastDispatchedAt: number
  /** How to find the payment in the transaction list (reconcile.ts). */
  match: TransactionMatch
}

export type AttemptJournal = {
  /** The dispatches still unaccounted for, across relaunches. */
  pending: () => Promise<readonly DispatchRecord[]>
  /**
   * Write a dispatch down. Rejects when it cannot, so nothing is sent
   * unrecorded. An action's first dispatch makes its record; each later one
   * (a retry under the same key) moves only the record's lastDispatchedAt
   * forward, so the record spans every moment the payment can have left.
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

const MATCH_FIELDS: Record<SingleTransactionMatch["kind"], readonly string[]> = {
  lightning: ["paymentHash"],
  intraledger: ["counterPartyWalletId", "settlementCurrency", "amount"],
  onchain: ["address"],
  btcRail: [],
  cashout: [],
}

const isSingleMatch = (value: unknown): value is SingleTransactionMatch => {
  if (!isPlainObject(value) || typeof value.kind !== "string") return false
  const fields: readonly string[] | undefined =
    MATCH_FIELDS[value.kind as SingleTransactionMatch["kind"]]
  return fields !== undefined && fields.every((field) => value[field] !== undefined)
}

/**
 * A stored match the reconciler can use. A group's `anyOf` must name at
 * least one leg, each of them a single match: an empty one could never be
 * settled, and would read as absent.
 */
const isMatch = (value: unknown): value is TransactionMatch => {
  if (isPlainObject(value) && value.kind === "anyOf") {
    return (
      Array.isArray(value.matches) &&
      value.matches.length > 0 &&
      value.matches.every(isSingleMatch)
    )
  }
  return isSingleMatch(value)
}

const isRecord = (value: unknown): value is DispatchRecord =>
  isPlainObject(value) &&
  typeof value.preparedActionId === "string" &&
  (typeof value.idempotencyKey === "string" || value.idempotencyKey === null) &&
  typeof value.paymentDetailHash === "string" &&
  typeof value.dispatchedAt === "number" &&
  typeof value.lastDispatchedAt === "number" &&
  isMatch(value.match)

/**
 * A stored record, or undefined for one the journal cannot use. A record
 * written before lastDispatchedAt existed is read as one with a single
 * dispatch: dropping it would let its payment go again unreconciled.
 */
const parseRecord = (value: unknown): DispatchRecord | undefined => {
  if (!isPlainObject(value)) return undefined
  const record =
    value.lastDispatchedAt === undefined
      ? { ...value, lastDispatchedAt: value.dispatchedAt }
      : value
  return isRecord(record) ? record : undefined
}

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
      if (!Array.isArray(parsed)) return []
      return parsed.flatMap((value) => {
        const record = parseRecord(value)
        return record ? [record] : []
      })
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
        const held = records.find(
          ({ preparedActionId }) => preparedActionId === record.preparedActionId,
        )
        if (!held) {
          await write([...records, record])
          return
        }
        // A retry: the payment can set off again from now, so the window in
        // which it may still land starts over. The first dispatch stays, as
        // the earliest it can have landed.
        const retried: DispatchRecord = {
          ...held,
          lastDispatchedAt: Math.max(held.lastDispatchedAt, record.lastDispatchedAt),
        }
        await write(records.map((existing) => (existing === held ? retried : existing)))
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
 * A payment whose destination is itself minted for each action, a
 * conversion's invoice, is not one this can name: see hashConversion.
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

/**
 * The identity of a settlement to a bank account (prepareCashout, ENG-688):
 * the wallet it leaves, the bank account it reaches, and the amount the user
 * denominated it in. Like hashPaymentDetail it leaves out what is
 * re-derived for each new action: the offer, and the cents a display-currency
 * amount converts to at the rate of the moment. Two cards for the same
 * request are then one settlement to the executor, whichever offer each
 * holds, and a settlement whose answer was lost blocks the next card for the
 * same request.
 */
export const hashCashout = ({
  walletId,
  bankAccountId,
  amount,
}: {
  walletId: string
  bankAccountId: string
  amount: MoneyAmount<WalletOrDisplayCurrency>
}): string =>
  sha256(
    canonicalJson({
      cashout: {
        walletId,
        bankAccountId,
        amount: { amount: amount.amount, currency: amount.currency },
      },
    }),
  )

/**
 * The identity of a conversion between the user's own wallets
 * (prepareConversion, ENG-688): its direction, the wallet it leaves, the
 * wallet it reaches, and the amount the user asked for, in the unit they
 * named. A conversion pays an invoice its own prepare just minted on the
 * receiving wallet, and that invoice is the payment detail's destination, so
 * hashPaymentDetail would make every conversion a payment of its own and
 * neither the per-payment queue nor the journal gate (spec §5.1) would ever
 * apply to one. Like hashCashout, this leaves out what is minted for each new
 * action: the invoice, and the settlement amount a display-currency amount
 * converts to at the rate of the moment. Two cards for the same request are
 * then one conversion to the executor, whichever invoice each pays, and a
 * conversion whose answer was lost blocks the next card for the same
 * request. Its record's match stays the invoice's own.
 */
export const hashConversion = ({
  direction,
  sourceWalletId,
  targetWalletId,
  amount,
}: {
  direction: "cashToBtc" | "btcToCash"
  sourceWalletId: string
  targetWalletId: string
  amount: MoneyAmount<WalletOrDisplayCurrency>
}): string =>
  sha256(
    canonicalJson({
      conversion: {
        direction,
        sourceWalletId,
        targetWalletId,
        amount: { amount: amount.amount, currency: amount.currency },
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
