import type { ToolResult } from "../registry/types"
import { AssistantTelemetry, report } from "./telemetry"

// The experience metrics a conversation produces (docs/ai-assistant-tool-
// registry.md §8, v0.2.5): weekly actives from thread opens, the time from
// opening a thread to its first confirmed send, and clarification loops the
// user walks away from. Counts and durations only, never what was said.

export type ThreadMetrics = {
  open: (threadId: string) => void
  /** Every tool result shown in the thread, so open clarifications are known. */
  noteResult: (threadId: string, result: ToolResult<unknown>) => void
  /** A send in the thread went through. */
  confirmed: (threadId: string) => void
  leave: (threadId: string) => void
}

type Thread = {
  /** Cleared after the first confirmed send, so a thread reports it once. */
  openedAt: number | undefined
  /** Clarifications shown since the last answer or prepared action. */
  openClarifications: number
}

export const createThreadMetrics = ({
  now,
  telemetry,
}: {
  now: () => number
  telemetry: AssistantTelemetry
}): ThreadMetrics => {
  const threads = new Map<string, Thread>()

  return {
    open: (threadId) => {
      threads.set(threadId, { openedAt: now(), openClarifications: 0 })
      report(() => telemetry.threadOpened())
    },
    noteResult: (threadId, result) => {
      const thread = threads.get(threadId)
      if (!thread) return
      if (result.kind === "clarification") thread.openClarifications += 1
      // A picked option leads to an answer or a prepared action; an error
      // leaves the question open.
      else if (result.kind === "answer" || result.kind === "prepared") {
        thread.openClarifications = 0
      }
    },
    confirmed: (threadId) => {
      const thread = threads.get(threadId)
      if (thread?.openedAt === undefined) return
      const openToConfirmMs = now() - thread.openedAt
      thread.openedAt = undefined
      report(() => telemetry.openToConfirm({ openToConfirmMs }))
    },
    leave: (threadId) => {
      const thread = threads.get(threadId)
      threads.delete(threadId)
      if (thread && thread.openClarifications > 0) {
        const clarificationCount = thread.openClarifications
        report(() => telemetry.clarificationAbandoned({ clarificationCount }))
      }
    },
  }
}
