import type { BtcRail } from "@app/payments/btc-rail"
import type { AuthOrigin } from "../engine/auth-policy"
import type { ToolCall } from "../engine/intent-router"
import { isPlainObject } from "../engine/schema-validator"
import type { TransactionRow } from "../rails/graphql-rail"
import type {
  AccountLimitsPayload,
  TransactionDetailsProjection,
  BalancesProjection,
  PricePayload,
  MerchantsPayload,
  TransactionsProjection,
} from "../registry/projections"
import type { HelpTopic } from "./first-use-help"
import type { ScreenDestination } from "./screen-destinations"
import type { AssistantReplyKey } from "../registry/types"

// The Ask Flash thread's transcript (ENG-689): what the user said and what
// came back, in order, in memory. The runtime holds one per Apollo client,
// so leaving the screen and coming back finds the same cards; a relaunch,
// a logout or an account switch starts a new one. Nothing here is written
// to disk: the dispatch journal already covers process death.

/** A BTC-wallet payment, as the BTC rail lists it. */
export type BtcPaymentRow = Awaited<ReturnType<BtcRail["listPayments"]>>[number]

/**
 * A payment as its rail handed it to getTransactions, before the tool's
 * projection dropped its memo and its counterparty. The thread draws each
 * payment a history answer lists with the app's own transaction row from
 * this (spec §6: the txList card "renders existing tx rows"). It stays on
 * the device, in the thread: runTool never answers with it.
 */
export type ListedTransaction =
  | { rail: "graphql"; transaction: TransactionRow }
  | { rail: "btc"; payment: BtcPaymentRow }

/**
 * What a templated reply fills in. Only Assistant.amountUnclear takes a
 * value: the display currency code its example names, as the account had
 * it when the turn ran.
 */
export type ReplyParams = { currency: string }

/** The key a listed payment goes by: the txList card's id, `${rail}:${id}`. */
export const listedKey = (rail: "graphql" | "btc", id: string): string => `${rail}:${id}`

/**
 * One line of the thread.
 *
 * - user: what the user typed.
 * - reply: a templated reply, a key of the Assistant namespace. The amount
 *   question's example names the account's own display currency code
 *   (`params`), which readAmountPhrase reads on that account: "500 JMD" is
 *   itself a question on any account that is not in JMD.
 * - balances, transactions, price: a read tool's answer, drawn from its
 *   payload by the thread's own components; `stale` when it came from the
 *   cache, offline. A history answer also holds the payments it lists as
 *   their rails gave them (`listed`), for the app's transaction row.
 * - card: an action card's payload (a confirm card, an invoice, a question),
 *   drawn by ActionCardView, and the call that made it: a pick of a
 *   question, and a card's Try again or Refresh, issue that call again.
 *   `servedByOnDeviceModel` when the on-device model emitted that call
 *   (ENG-690), so the event of each call issued again says so too.
 */
export type ThreadEntry =
  | {
      id: string
      kind: "address"
      state: "available" | "notSet" | "unavailable"
      address?: string
      stale: boolean
    }
  | { id: string; kind: "help"; topic: HelpTopic }
  | { id: string; kind: "screen"; destination: ScreenDestination }
  | { id: string; kind: "merchants"; payload: MerchantsPayload }
  | {
      id: string
      kind: "contactAction"
      operation: "add" | "remove" | "profile"
      username: string
      hostname: string
      /** Set only after the profile lookup verified the user's selected name. */
      resolvedUsername?: string
    }
  | {
      id: string
      kind: "cardTopUp"
      amount?: string
      currency?: "USD" | "BTC" | "USDT"
      displayCurrency: string
    }
  | { id: string; kind: "cashoutAmount"; displayCurrency: string }
  | { id: string; kind: "conversionAmount"; from: "USD" | "BTC"; to: "USD" | "BTC" }
  | {
      id: string
      kind: "limits"
      payload: AccountLimitsPayload
      stale: boolean
      asOf?: number
    }
  | {
      id: string
      kind: "details"
      payload: TransactionDetailsProjection
      stale: boolean
      asOf?: number
    }
  | { id: string; kind: "user"; text: string; resolvedText?: string; readCall?: ToolCall }
  | { id: string; kind: "reply"; replyKey: AssistantReplyKey; params?: ReplyParams }
  | {
      id: string
      kind: "balances"
      payload: BalancesProjection
      stale: boolean
      asOf?: number
    }
  | {
      id: string
      kind: "transactions"
      payload: TransactionsProjection
      stale: boolean
      asOf?: number
      listed?: Readonly<Record<string, ListedTransaction>>
    }
  | { id: string; kind: "price"; payload: PricePayload }
  | {
      id: string
      kind: "card"
      card: unknown
      call?: ToolCall
      servedByOnDeviceModel?: boolean
      inputOrigin?: AuthOrigin
    }

type WithoutId<E> = E extends unknown ? Omit<E, "id"> : never

/** An entry before the thread gives it its id. */
export type NewEntry = WithoutId<ThreadEntry>

export type CardEntry = Extract<ThreadEntry, { kind: "card" }>

export type ThreadState = {
  entries: readonly ThreadEntry[]
  /** A turn is running: the input is off, and another turn does not start. */
  busy: boolean
}

export type ThreadStore = {
  get: () => ThreadState
  subscribe: (listener: () => void) => () => void
  /**
   * Start a turn. False, and nothing starts, while one runs: one turn in
   * flight per thread (spec §8, "one in-flight prepare per intent").
   * Synchronous, so two taps in one frame cannot both start one.
   */
  begin: () => boolean
  end: () => void
  append: (entries: readonly NewEntry[]) => void
  /** Put `entries` in the place of the entry `id`. False when it is gone. */
  replace: (id: string, entries: readonly NewEntry[]) => boolean
  /** A card entry's payload, changed in place: the card keeps its id and state. */
  setCard: (id: string, card: unknown) => void
  rememberRequest: (id: string, resolvedText: string, readCall?: ToolCall) => void
  rememberContact: (id: string, username: string) => void
  entry: (id: string) => ThreadEntry | undefined
  /** The card entry whose card was prepared under `preparedActionId`. */
  cardEntry: (preparedActionId: string) => CardEntry | undefined
}

/** The id a card's payload holds, if it holds one. */
export const preparedActionIdOf = (card: unknown): string | undefined =>
  isPlainObject(card) && typeof card.preparedActionId === "string"
    ? card.preparedActionId
    : undefined

export const createThreadStore = (): ThreadStore => {
  let state: ThreadState = { entries: [], busy: false }
  let nextId = 0
  const listeners = new Set<() => void>()

  const set = (next: ThreadState) => {
    state = next
    listeners.forEach((listener) => listener())
  }
  const withIds = (entries: readonly NewEntry[]): ThreadEntry[] =>
    entries.map((entry) => {
      nextId += 1
      return { ...entry, id: `entry-${nextId}` } as ThreadEntry
    })

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    begin: () => {
      if (state.busy) return false
      set({ ...state, busy: true })
      return true
    },
    end: () => set({ ...state, busy: false }),
    append: (entries) =>
      set({ ...state, entries: [...state.entries, ...withIds(entries)] }),
    replace: (id, entries) => {
      const at = state.entries.findIndex((entry) => entry.id === id)
      if (at < 0) return false
      set({
        ...state,
        entries: [
          ...state.entries.slice(0, at),
          ...withIds(entries),
          ...state.entries.slice(at + 1),
        ],
      })
      return true
    },
    setCard: (id, card) =>
      set({
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === id && entry.kind === "card" ? { ...entry, card } : entry,
        ),
      }),
    rememberRequest: (id, resolvedText, readCall) =>
      set({
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === id && entry.kind === "user"
            ? { ...entry, resolvedText, ...(readCall ? { readCall } : {}) }
            : entry,
        ),
      }),
    rememberContact: (id, resolvedUsername) =>
      set({
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === id && entry.kind === "contactAction"
            ? { ...entry, resolvedUsername }
            : entry,
        ),
      }),
    entry: (id) => state.entries.find((entry) => entry.id === id),
    cardEntry: (preparedActionId) =>
      state.entries.find(
        (entry): entry is CardEntry =>
          entry.kind === "card" && preparedActionIdOf(entry.card) === preparedActionId,
      ),
  }
}
