import type { ToolCall } from "../engine/intent-router"
import { isPlainObject } from "../engine/schema-validator"
import type {
  BalancesProjection,
  PricePayload,
  TransactionsProjection,
} from "../registry/projections"
import type { AssistantReplyKey } from "../registry/types"

// The Ask Flash thread's transcript (ENG-689): what the user said and what
// came back, in order, in memory. The runtime holds one per Apollo client,
// so leaving the screen and coming back finds the same cards; a relaunch,
// a logout or an account switch starts a new one. Nothing here is written
// to disk: the dispatch journal already covers process death.

/**
 * One line of the thread.
 *
 * - user: what the user typed.
 * - reply: a templated reply, a key of the Assistant namespace.
 * - balances, transactions, price: a read tool's answer, drawn from its
 *   payload by the thread's own components; `stale` when it came from the
 *   cache, offline.
 * - card: an action card's payload (a confirm card, an invoice, a question),
 *   drawn by ActionCardView, and the call that made it: a pick of a
 *   question, and a card's Try again or Refresh, issue that call again.
 */
export type ThreadEntry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "reply"; replyKey: AssistantReplyKey }
  | { id: string; kind: "balances"; payload: BalancesProjection; stale: boolean }
  | { id: string; kind: "transactions"; payload: TransactionsProjection; stale: boolean }
  | { id: string; kind: "price"; payload: PricePayload }
  | { id: string; kind: "card"; card: unknown; call?: ToolCall }

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
    entry: (id) => state.entries.find((entry) => entry.id === id),
    cardEntry: (preparedActionId) =>
      state.entries.find(
        (entry): entry is CardEntry =>
          entry.kind === "card" && preparedActionIdOf(entry.card) === preparedActionId,
      ),
  }
}
