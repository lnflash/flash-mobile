// The classic send flow's half of `send_open_to_confirm` (ENG-687,
// docs/ai-assistant-tool-registry.md §8): how long a user takes from opening
// the send flow to a confirmed send, so the assistant's thread-open-to-
// confirm time has a baseline to be compared with.
//
// The flow opens on the destination screen. Every send started from Send, a
// contact or the map passes through it, and it stays mounted under the rest
// of the flow, so it marks the open on mount and clears the mark on unmount.
// A send that starts elsewhere (a scanned card, an NFC tap) never opens it
// and reports nothing, rather than a time measured from an unrelated screen.

let openedAt: number | undefined

/** The destination screen mounted: the send flow is open. */
export const markSendFlowOpened = (now: number = Date.now()): void => {
  openedAt = now
}

/** The destination screen unmounted: the flow was left, or is over. */
export const clearSendFlowOpened = (): void => {
  openedAt = undefined
}

/**
 * Milliseconds from the open to `now`, for the send that just went through,
 * or undefined when the flow was not opened on the destination screen. The
 * mark is used up, so one open is reported once.
 */
export const takeSendFlowOpenToConfirmMs = (
  now: number = Date.now(),
): number | undefined => {
  if (openedAt === undefined) return undefined
  const elapsed = now - openedAt
  openedAt = undefined
  return elapsed
}
