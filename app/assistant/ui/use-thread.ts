import { useCallback, useMemo, useRef, useSyncExternalStore } from "react"
import { useFocusEffect } from "@react-navigation/native"

import { useI18nContext } from "@app/i18n/i18n-react"
import { toastShow } from "@app/utils/toast"
import type { CardActions } from "../cards/card-actions"
import { cardOf, validateCard } from "../cards/types"
import type { AuthOrigin } from "../engine/auth-policy"
import type { ConfirmResult } from "../engine/executor"
import { isPlainObject } from "../engine/schema-validator"
import type { AssistantRuntime } from "./assistant-runtime"
import { createLiveCardActions } from "./live-actions"
import type { ThreadEntry } from "./thread-store"
import {
  answerUtterance,
  needsNetwork,
  originOf,
  reissue,
  runCall,
  TurnEnv,
} from "./turn"

// The Ask Flash thread as the screen uses it (ENG-689): the transcript, one
// turn at a time, and the actions its cards take.
//
// - The thread is open while the screen has focus, and left when it loses
//   it (executor.openThread / leaveThread): leaving drops the thread's
//   prepared actions, as the spec's "leaving the thread" does (§3), and the
//   executor remembers any whose payment may have gone, so their cards
//   still say so when the user comes back.
// - One turn runs at a time: while it does the input is off, and a submit,
//   a pick or a Try again is ignored (spec §8).
// - Errors from this glue, not tool outcomes, go to the app's toast, as the
//   Flashcard context's do (app/contexts/Flashcard.tsx); every outcome of a
//   turn is a line in the thread.

export type Thread = {
  entries: readonly ThreadEntry[]
  /** A turn is running: the input is off and the typing line shows. */
  busy: boolean
  submit: (text: string, origin?: AuthOrigin) => Promise<void>
  /** A question's pick: its call again, with the argument it was about replaced. */
  pick: (entryId: string, optionId: string) => Promise<void>
  cardActions: CardActions
}

export const useThread = (runtime: AssistantRuntime, env: TurnEnv): Thread => {
  const { LL } = useI18nContext()
  const state = useSyncExternalStore(runtime.transcript.subscribe, runtime.transcript.get)
  // A turn reads the connection and the formatter as they are when it starts.
  const envRef = useRef(env)
  envRef.current = env
  const LLRef = useRef(LL)
  LLRef.current = LL

  useFocusEffect(
    useCallback(() => {
      runtime.executor.openThread(runtime.threadId)
      return () => runtime.executor.leaveThread(runtime.threadId)
    }, [runtime]),
  )

  /** Run one turn, unless one is running. */
  const turn = useCallback(
    async (work: () => Promise<void>) => {
      if (!runtime.transcript.begin()) return
      try {
        await work()
      } catch (err) {
        console.warn("[assistant] the thread failed a turn", err)
        toastShow({
          message: (translations) => translations.Assistant.toolFailed(),
          currentTranslation: LLRef.current,
        })
      } finally {
        runtime.transcript.end()
      }
    },
    [runtime],
  )

  const submit = useCallback(
    async (text: string, inputOrigin: AuthOrigin = "text") => {
      const utterance = text.trim()
      if (utterance.length === 0) return
      let completed: readonly ThreadEntry[] | undefined
      await turn(async () => {
        runtime.transcript.append([{ kind: "user", text: utterance }])
        const entries = await answerUtterance(runtime, utterance, {
          ...envRef.current,
          inputOrigin,
        })
        runtime.transcript.append(entries)
        if (entries.length)
          completed = runtime.transcript.get().entries.slice(-entries.length)
      })
      if (completed) runtime.completedTurns.complete(inputOrigin, completed)
    },
    [runtime, turn],
  )

  /** Offline, a call that needs the network gets the offline reply, and the thread keeps what it shows. */
  const refusedOffline = useCallback(
    (call: Parameters<typeof needsNetwork>[0]) => {
      if (!envRef.current.isOffline || !needsNetwork(call)) return false
      runtime.transcript.append([{ kind: "reply", replyKey: "Assistant.actionsOffline" }])
      return true
    },
    [runtime],
  )

  const pick = useCallback(
    (entryId: string, optionId: string) =>
      turn(async () => {
        const entry = runtime.transcript.entry(entryId)
        if (entry?.kind !== "card" || !entry.call) return
        const validation = validateCard(entry.card)
        if (!validation.valid || validation.card.type !== "clarification") return
        const call = reissue(entry.call, validation.card.about, optionId)
        if (!call || refusedOffline(call)) return
        // The answer takes the question's place. A question about the
        // model's call re-issues the model's call (CallOrigin).
        runtime.transcript.replace(
          entryId,
          await runCall(runtime, call, { ...envRef.current, ...originOf(entry) }),
        )
      }),
    [refusedOffline, runtime, turn],
  )

  /** A card's Try again or Refresh: its call again, into a card in its place. */
  const reprepare = useCallback(
    (preparedActionId: string) =>
      turn(async () => {
        const entry = runtime.transcript.cardEntry(preparedActionId)
        if (!entry?.call || refusedOffline(entry.call)) return
        // The old action makes way for the new one; one whose payment may
        // have gone is remembered as such (executor.ts).
        runtime.executor.dismiss(preparedActionId)
        runtime.transcript.replace(
          entry.id,
          await runCall(runtime, entry.call, { ...envRef.current, ...originOf(entry) }),
        )
      }),
    [refusedOffline, runtime, turn],
  )

  /**
   * What a Confirm answered, where the card cannot show it itself: a refresh
   * with new numbers takes the card's place, with a line that says why; a
   * group send's new leg statuses go on its card.
   */
  const onResult = useCallback(
    (result: ConfirmResult) => {
      if (result.kind === "refreshed") {
        const entry = runtime.transcript.cardEntry(result.replacedActionId)
        if (entry) {
          runtime.transcript.replace(entry.id, [
            {
              kind: "card",
              card: cardOf(result.preparedAction),
              call: entry.call,
              ...originOf(entry),
            },
          ])
        }
        runtime.transcript.append([{ kind: "reply", replyKey: result.replyKey }])
        return
      }
      if (result.kind === "executed" && result.outcome.summary) {
        const entry = runtime.transcript.cardEntry(
          result.replacedActionId ?? result.actionId,
        )
        if (entry && isPlainObject(entry.card)) {
          runtime.transcript.setCard(entry.id, {
            ...result.outcome.summary,
            expiresAt: entry.card.expiresAt,
            preparedActionId: entry.card.preparedActionId,
          })
        }
      }
    },
    [runtime],
  )

  const cardActions = useMemo(
    () => createLiveCardActions({ executor: runtime.executor, reprepare, onResult }),
    [onResult, reprepare, runtime],
  )

  return { entries: state.entries, busy: state.busy, submit, pick, cardActions }
}
