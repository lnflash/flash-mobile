import { useCallback, useEffect, useState } from "react"

import type { ConfirmResult, ConfirmState } from "../engine/executor"
import type { AssistantReplyKey } from "../registry/types"
import { AfterConfirm, afterConfirm, afterRetirement, CardActions } from "./card-actions"

/** What the executor says about a card's action, once it has answered. */
export type ConfirmView = {
  /** Whether Confirm would run now. */
  enabled: boolean
  /** Where the executor has the action; undefined until it answers, or if asking failed. */
  state?: ConfirmState
  /** Why Confirm is off, or what an unresolved or disarmed action's last Confirm left the card saying. */
  replyKey?: AssistantReplyKey
}

/**
 * Whether the executor would take a Confirm of this card now, and where it
 * has the action (canConfirm): it says so, with the reason when it would not
 * (no way to authenticate a voice action, a disarmed card). Asked again
 * after each Confirm. Until it answers, and if it fails, Confirm stays
 * disabled: it fails closed.
 */
export const useCanConfirm = (
  actions: Pick<CardActions, "canConfirm">,
  preparedActionId: string,
  askAgain: unknown,
): ConfirmView => {
  const [answer, setAnswer] = useState<ConfirmView | undefined>(undefined)

  useEffect(() => {
    let live = true
    setAnswer(undefined)
    actions.canConfirm(preparedActionId).then(
      (next) => {
        if (live) setAnswer(next)
      },
      () => {
        if (live) setAnswer({ enabled: false, replyKey: "Assistant.toolFailed" })
      },
    )
    return () => {
      live = false
    }
  }, [actions, preparedActionId, askAgain])

  return answer ?? { enabled: false }
}

/**
 * A card's Confirm: executePreparedAction with the card's own id, and
 * nothing else. One run at a time from the card (the executor runs one at a
 * time anyway). `singleUse`: after the first Confirm, whatever its outcome,
 * never again (a settlement offer, decision 5).
 *
 * What the card shows comes from the executor (canConfirm), not only from
 * this card's own memory of its last Confirm, which a remount loses.
 */
export const useConfirm = (
  actions: CardActions,
  preparedActionId: string,
  { singleUse = false }: { singleUse?: boolean } = {},
) => {
  const [submitting, setSubmitting] = useState(false)
  const [used, setUsed] = useState(false)
  const [result, setResult] = useState<ConfirmResult | undefined>(undefined)
  const can = useCanConfirm(actions, preparedActionId, result)
  // What this card's last Confirm left it offering, or, with none to
  // remember (a remount), what the executor's retirement of the action left
  // it offering: a card that remounts offers what the card it replaces did.
  const after: AfterConfirm | undefined = result
    ? afterConfirm(result)
    : afterRetirement(can)

  const confirm = useCallback(async () => {
    if (submitting || (singleUse && used)) return
    setSubmitting(true)
    setUsed(true)
    let answer: ConfirmResult
    try {
      answer = await actions.executePreparedAction(preparedActionId)
    } catch {
      // The executor never rejects. If it did, the outcome is not known.
      answer = {
        kind: "disarmed",
        actionId: preparedActionId,
        replyKey: "Assistant.checkHistory",
      }
    }
    setResult(answer)
    setSubmitting(false)
    actions.onResult?.(answer)
  }, [actions, preparedActionId, singleUse, submitting, used])

  const blocked =
    submitting ||
    !can.enabled ||
    (singleUse && used) ||
    (after !== undefined && !after.confirmAgain)

  return {
    confirm,
    submitting,
    /** Confirm is offered and may run now. */
    canPress: !blocked,
    /** Where the executor has the action; undefined until it answers. */
    state: can.state,
    /**
     * What the executor says about the action: why Confirm is not available,
     * or what an unresolved or disarmed action's last Confirm left it saying.
     */
    stateReply: can.replyKey,
    after,
    /** The action's payment went: after this card's Confirm, or before it remounted. */
    done: after?.done === true || can.state === "sent",
    /**
     * Whether the card may turn into the expired card past expiresAt, with
     * Refresh. Only for an action the executor holds armed, or holds no
     * longer and has no word of (gone), once it has said which, and not
     * while a Confirm runs or after one answered: an unresolved action
     * retries its own attempt whatever the time, a disarmed one offers no
     * re-prepare (spec §5), one whose payment already went offers none
     * either, and the rest of a group is prepared from its own Try again, so
     * their cards keep the retry, the reply or the history notice.
     */
    mayExpire:
      !submitting &&
      after === undefined &&
      (can.state === "armed" || can.state === "gone"),
  }
}
