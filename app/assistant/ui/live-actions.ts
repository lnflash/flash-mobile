import type { CardActions } from "../cards/card-actions"
import type { Executor } from "../engine/executor"

// The production CardActions (cards/card-actions.ts): a card's Confirm and
// what it asks the executor are the executor's own, so Confirm only ever
// runs executePreparedAction with the card's id; Try again and Refresh, and
// what each Confirm answered, are the thread's.

export const createLiveCardActions = ({
  executor,
  reprepare,
  onResult,
}: {
  executor: Pick<Executor, "canConfirm" | "executePreparedAction">
  reprepare: NonNullable<CardActions["reprepare"]>
  onResult: NonNullable<CardActions["onResult"]>
}): CardActions => ({
  canConfirm: (preparedActionId) => executor.canConfirm(preparedActionId),
  executePreparedAction: (preparedActionId, options) =>
    options
      ? executor.executePreparedAction(preparedActionId, options)
      : executor.executePreparedAction(preparedActionId),
  reprepare,
  onResult,
})
