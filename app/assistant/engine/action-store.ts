import type { PreparedAction } from "../registry/types"
import type { AuthOrigin } from "./auth-policy"

// The prepared actions a conversation holds (docs/ai-assistant-tool-registry.md
// §3, "Pending actions"): at most three per thread, oldest evicted first.
// The actions' closures are the only live reference to their PaymentDetail
// and AttemptState, so dropping an action from here is also what frees them.

export const MAX_PREPARED_PER_THREAD = 3

/**
 * - armed: Confirm runs the action.
 * - unresolved: a dispatch's outcome was lost (a GraphQL send whose response
 *   never came); Confirm retries the same attempt under the same key, and
 *   expiry does not re-prepare it, since a new action would mint a new key.
 * - disarmed: something may have moved and cannot be retried safely; Confirm
 *   only points the user to their history.
 */
export type ActionState = "armed" | "unresolved" | "disarmed"

export type StoredAction = {
  readonly action: PreparedAction
  readonly origin: AuthOrigin
}

export type ActionStore = {
  get: (actionId: string) => StoredAction | undefined
  stateOf: (actionId: string) => ActionState | undefined
  setState: (actionId: string, state: ActionState) => void
  /** True the first time it is called for an action, so its expiry is counted once. */
  firstExpiry: (actionId: string) => boolean
  /** Hold a new action, armed. Returns the ids it evicted, oldest first. */
  add: (stored: StoredAction) => string[]
  /** Put a refreshed action in the old one's place. False if the old one is gone. */
  replace: (actionId: string, next: StoredAction) => boolean
  remove: (actionId: string) => void
  /** Drop a thread's actions. Returns their ids. */
  removeThread: (threadId: string) => string[]
}

type Slot = StoredAction & { state: ActionState; expiryCounted: boolean }

/**
 * Every method is synchronous: no await can fall between reading a thread's
 * list and writing it back, so two quick prepares cannot leave four.
 */
export const createActionStore = (
  maxPerThread: number = MAX_PREPARED_PER_THREAD,
): ActionStore => {
  const threads = new Map<string, Slot[]>()
  const threadOf = new Map<string, string>()

  const slot = (actionId: string): Slot | undefined => {
    const threadId = threadOf.get(actionId)
    if (threadId === undefined) return undefined
    return threads.get(threadId)?.find(({ action }) => action.id === actionId)
  }

  const remove = (actionId: string): void => {
    const threadId = threadOf.get(actionId)
    if (threadId === undefined) return
    threadOf.delete(actionId)
    const left = (threads.get(threadId) ?? []).filter(
      ({ action }) => action.id !== actionId,
    )
    if (left.length > 0) threads.set(threadId, left)
    else threads.delete(threadId)
  }

  return {
    get: (actionId) => {
      const held = slot(actionId)
      return held && { action: held.action, origin: held.origin }
    },
    stateOf: (actionId) => slot(actionId)?.state,
    setState: (actionId, state) => {
      const held = slot(actionId)
      if (held) held.state = state
    },
    firstExpiry: (actionId) => {
      const held = slot(actionId)
      if (!held || held.expiryCounted) return false
      held.expiryCounted = true
      return true
    },
    add: ({ action, origin }) => {
      if (threadOf.has(action.id)) throw new Error(`Action ${action.id} is already held`)
      const list = [
        ...(threads.get(action.threadId) ?? []),
        { action, origin, state: "armed" as const, expiryCounted: false },
      ]
      const evicted = list.splice(0, Math.max(0, list.length - maxPerThread))
      threads.set(action.threadId, list)
      threadOf.set(action.id, action.threadId)
      evicted.forEach(({ action: gone }) => threadOf.delete(gone.id))
      return evicted.map(({ action: gone }) => gone.id)
    },
    replace: (actionId, next) => {
      const threadId = threadOf.get(actionId)
      if (threadId === undefined) return false
      const replacement: Slot = { ...next, state: "armed", expiryCounted: false }
      threads.set(
        threadId,
        (threads.get(threadId) ?? []).map((held) =>
          held.action.id === actionId ? replacement : held,
        ),
      )
      threadOf.delete(actionId)
      threadOf.set(next.action.id, threadId)
      return true
    },
    remove,
    removeThread: (threadId) => {
      const ids = (threads.get(threadId) ?? []).map(({ action }) => action.id)
      ids.forEach(remove)
      return ids
    },
  }
}
