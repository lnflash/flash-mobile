import { useCallback, useEffect, useState } from "react"

import type { CanConfirm, ConfirmResult } from "../engine/executor"
import type { AssistantReplyKey } from "../registry/types"
import { AfterConfirm, afterConfirm, CardActions } from "./card-actions"

/**
 * Whether the executor would take a Confirm of this card now (canConfirm):
 * it says so, with the reason when it would not (no way to authenticate a
 * voice action, a disarmed card). Asked again after each Confirm. Until it
 * answers, and if it fails, Confirm stays disabled: it fails closed.
 */
export const useCanConfirm = (
  actions: Pick<CardActions, "canConfirm">,
  preparedActionId: string,
  askAgain: unknown,
): { enabled: boolean; replyKey?: AssistantReplyKey } => {
  const [answer, setAnswer] = useState<CanConfirm | undefined>(undefined)

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

  if (!answer) return { enabled: false }
  return answer.enabled
    ? { enabled: true }
    : { enabled: false, replyKey: answer.replyKey }
}

/**
 * A card's Confirm: executePreparedAction with the card's own id, and
 * nothing else. One run at a time from the card (the executor runs one at a
 * time anyway). `singleUse`: after the first Confirm, whatever its outcome,
 * never again (a settlement offer, decision 5).
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
  const after: AfterConfirm | undefined = result ? afterConfirm(result) : undefined

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
    /** Why Confirm is not available, when the executor said why. */
    blockedReply: can.enabled ? undefined : can.replyKey,
    after,
  }
}
