import type { CanConfirm, ConfirmResult } from "../engine/executor"
import type { CardActions } from "./card-actions"

// A stand-in executor for the card stories: canConfirm answers `can`, and
// Confirm answers `result` after a moment, so a story shows the card before
// and after. Not used by the app.

export const storyActions = ({
  can = { enabled: true, state: "armed" },
  result,
}: {
  can?: CanConfirm
  result?: (preparedActionId: string) => ConfirmResult
} = {}): CardActions => ({
  canConfirm: async () => can,
  executePreparedAction: (preparedActionId) =>
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve(
            result
              ? result(preparedActionId)
              : {
                  kind: "executed",
                  actionId: preparedActionId,
                  outcome: { status: "succeeded" },
                },
          ),
        600,
      )
    }),
  reprepare: () => undefined,
  onResult: () => undefined,
})
