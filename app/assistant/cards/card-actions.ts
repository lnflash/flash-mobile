import type {
  CanConfirm,
  ConfirmOptions,
  ConfirmResult,
  ConfirmState,
} from "../engine/executor"
import type { AssistantReplyKey } from "../registry/types"

// What a card can do (docs/ai-assistant-tool-registry.md §6). The thread
// hands these in: the executor's own canConfirm and executePreparedAction,
// so Confirm only ever calls executePreparedAction(preparedActionId) and the
// executor looks the action up; the card holds nothing else to execute.

export type CardActions = {
  canConfirm: (preparedActionId: string) => Promise<CanConfirm>
  /**
   * The executor's own. Confirm passes the card's id and nothing else; only
   * "I checked my history" passes `historyChecked` (ENG-689), after a
   * Confirm the executor blocked on a day-old dispatch it calls
   * historyCheckable (spec §5.1).
   */
  executePreparedAction: (
    preparedActionId: string,
    options?: ConfirmOptions,
  ) => Promise<ConfirmResult>
  /**
   * Prepare the action again from the same inputs, into a new card: the
   * expired card's Refresh, and "Try again" after a failure where nothing
   * moved. It executes nothing. Without it the card offers neither.
   */
  reprepare?: (preparedActionId: string) => void
  /** Each Confirm's result, for the thread to show its reply or a new card. */
  onResult?: (result: ConfirmResult) => void
}

/** What a card shows, and offers, after a Confirm. */
export type AfterConfirm = {
  replyKey?: AssistantReplyKey
  /** The action did what it was for. */
  done: boolean
  /** Whether Confirm may run again for this card. */
  confirmAgain: boolean
  /**
   * Whether the card offers to prepare the action again. Never after an
   * outcome where money may have moved: preparing again is the double pay
   * (spec v0.2.6 §5).
   */
  reprepare: boolean
  /**
   * Set when the Confirm was blocked by earlier dispatches of the payment
   * that the transaction list cannot settle, each at least a day old
   * (pendingDispatch, historyCheckable): the card may offer "I checked my
   * history", which confirms again with `historyChecked` (spec §5.1,
   * ENG-689). Absent otherwise.
   */
  historyCheck?: true
}

export const afterConfirm = (result: ConfirmResult): AfterConfirm => {
  switch (result.kind) {
    case "executed": {
      const { outcome } = result
      switch (outcome.status) {
        case "succeeded":
          return { done: true, confirmAgain: false, reprepare: false }
        case "failed":
          return {
            replyKey: outcome.replyKey,
            done: false,
            confirmAgain: outcome.next === "confirmAgain",
            reprepare: outcome.next === "reprepare",
          }
        case "unknown":
          // A lost answer retries the same attempt from this card; anything
          // else stays disarmed and points to the history, with no way to
          // prepare the payment again from here. The one exception is the
          // rest of a group whose other legs went (prepareRest): the
          // action's refresh prepares only the legs that did not go.
          return {
            replyKey: outcome.replyKey,
            done: false,
            confirmAgain: outcome.next === "retrySameAttempt",
            reprepare: outcome.next === "prepareRest",
          }
      }
      break
    }
    case "denied":
      // The user may try the prompt again.
      return {
        replyKey: result.replyKey,
        done: false,
        confirmAgain: true,
        reprepare: false,
      }
    case "expired":
    case "notFound":
      // Nothing ran: the action expired past refreshing, or is gone.
      return {
        replyKey: result.replyKey,
        done: false,
        confirmAgain: false,
        reprepare: true,
      }
    case "refreshed":
      // The thread shows the new card in this one's place.
      return {
        replyKey: result.replyKey,
        done: false,
        confirmAgain: false,
        reprepare: false,
      }
    case "pendingDispatch":
      // Blocked before any dispatch: nothing ran. Only the user's word that
      // their history does not show a day-old payment lets it through.
      return {
        replyKey: result.replyKey,
        done: false,
        confirmAgain: false,
        reprepare: false,
        ...(result.historyCheckable ? { historyCheck: true as const } : {}),
      }
    case "disarmed":
    case "alreadySent":
      return {
        replyKey: result.replyKey,
        done: false,
        confirmAgain: false,
        reprepare: false,
      }
    case "sent":
      // Its payment went before this Confirm: nothing more to offer.
      return { done: true, confirmAgain: false, reprepare: false }
    case "prepareRest":
      // What went is done; the card may prepare only the rest.
      return {
        replyKey: result.replyKey,
        done: false,
        confirmAgain: false,
        reprepare: true,
      }
  }
  // An answer this card does not know: assume something may have moved.
  return {
    replyKey: "Assistant.checkHistory",
    done: false,
    confirmAgain: false,
    reprepare: false,
  }
}

/**
 * What a card offers for an action the executor retired, when the card
 * remembers no Confirm of its own (a remount, a thread re-render): the same
 * as the Confirm that retired it left the card offering. Undefined for an
 * action the executor still holds, or holds no word of: the card then goes
 * by canConfirm's `enabled` and reply, as before its first Confirm.
 */
export const afterRetirement = ({
  state,
  replyKey,
}: {
  state?: ConfirmState
  replyKey?: AssistantReplyKey
}): AfterConfirm | undefined => {
  switch (state) {
    case "sent":
      return { done: true, confirmAgain: false, reprepare: false }
    case "alreadySent":
      // A payment of this amount went: the reply says so, and there is no
      // Refresh, which would prepare it again.
      return {
        replyKey: replyKey ?? "Assistant.alreadySent",
        done: false,
        confirmAgain: false,
        reprepare: false,
      }
    case "prepareRest":
      return {
        replyKey,
        done: false,
        confirmAgain: false,
        reprepare: true,
      }
    default:
      return undefined
  }
}
