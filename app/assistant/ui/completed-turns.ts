import type { AuthOrigin } from "../engine/auth-policy"
import type { ThreadEntry } from "./thread-store"
export type CompletedTurn = {
  id: number
  origin: AuthOrigin
  entries: readonly ThreadEntry[]
}
export const createCompletedTurns = () => {
  let nextId = 0
  const listeners = new Set<(turn: CompletedTurn) => void>()
  return {
    subscribe: (listener: (turn: CompletedTurn) => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    complete: (origin: AuthOrigin, entries: readonly ThreadEntry[]): void => {
      nextId += 1
      const turn = { id: nextId, origin, entries }
      listeners.forEach((listener) => {
        try {
          listener(turn)
        } catch {
          /* Optional narration cannot fail a wallet turn. */
        }
      })
    },
  }
}
