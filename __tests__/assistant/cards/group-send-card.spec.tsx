import * as React from "react"
import { fireEvent, waitFor } from "@testing-library/react-native"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { groupSendFixture } from "@app/assistant/cards/fixtures"
import { GroupSendSummaryCard } from "@app/assistant/cards/GroupSendSummaryCard"
import type { LegStatus } from "@app/assistant/cards/types"
import type { ExecutionOutcome } from "@app/assistant/registry/types"
import { makeAction, setupExecutor } from "../executor-harness"
import { en, executorActions, fakeActions, flush, renderCard } from "./render-card"

const withStatuses = (...statuses: LegStatus[]) => ({
  ...groupSendFixture,
  legs: groupSendFixture.legs.map((leg, index) => ({ ...leg, status: statuses[index] })),
})

const show = (payload: unknown, actions = fakeActions()) => ({
  screen: renderCard(<GroupSendSummaryCard payload={payload} actions={actions} />),
  actions,
})

describe("GroupSendSummaryCard", () => {
  it("lists every leg with its full username, share and status, each read as one element", async () => {
    const { screen } = show(groupSendFixture)
    await flush()

    groupSendFixture.legs.forEach((leg, index) => {
      expect(
        screen.getByTestId(`assistant-card-leg-${index}`).props.accessibilityLabel,
      ).toBe(
        `${leg.payeeLabel}, ${leg.payeeUsername}, ${
          leg.amountText
        }, ${en.AssistantCards.legReady()}`,
      )
    })
    expect(screen.getByText("$10.00")).toBeTruthy()
    await flush()
  })

  it("Confirm calls executePreparedAction with the card's id, announced with the total", async () => {
    const { screen, actions } = show(groupSendFixture)
    await flush()
    const button = screen.getByTestId("assistant-card-confirm-button")
    expect(button.props.accessibilityLabel).toBe(
      en.AssistantCards.confirmWithAmount({ amount: "$10.00" }),
    )
    await waitFor(() => expect(button).not.toBeDisabled())

    fireEvent.press(button)

    // The result lands, and the card asks the executor again.
    await waitFor(() => expect(actions.onResult).toHaveBeenCalled())
    expect(actions.executePreparedAction).toHaveBeenCalledWith("action-group")
    await waitFor(() => expect(actions.canConfirm).toHaveBeenCalledTimes(2))
    await flush()
  })

  it("shows every leg's real status after a run that stopped, and offers to retry the rest", async () => {
    const { screen } = show(withStatuses("success", "failed", "not_attempted"))
    await flush()

    expect(screen.getByText(en.AssistantCards.legSent())).toBeTruthy()
    expect(screen.getByText(en.AssistantCards.legFailed())).toBeTruthy()
    expect(screen.getByText(en.AssistantCards.legNotSent())).toBeTruthy()
    expect(screen.getByText(en.AssistantCards.retryFailed())).toBeTruthy()
    await flush()
  })

  it("shows a leg to check in the history, and offers nothing once the executor disarms the card", async () => {
    const { screen } = show(
      withStatuses("success", "unknown", "not_attempted"),
      fakeActions({
        can: { enabled: false, state: "disarmed", replyKey: "Assistant.checkHistory" },
      }),
    )
    await flush()

    expect(screen.getByText(en.AssistantCards.legCheckHistory())).toBeTruthy()
    expect(await screen.findByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.getByTestId("assistant-card-confirm-button")).toBeDisabled()
    await flush()
  })

  it("offers no button once every leg went", async () => {
    const { screen } = show(withStatuses("success", "success", "success"))
    await flush()

    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
    await flush()
  })

  it("past expiresAt, before any leg went, becomes the expired card", async () => {
    const { screen } = show({ ...groupSendFixture, expiresAt: Date.now() - 1 })
    await flush()

    expect(screen.getByText(en.AssistantCards.expiredTitle())).toBeTruthy()
    await flush()
  })

  it("past expiresAt, once a leg went, stays the group card: a sent group is never prepared again", async () => {
    const { screen } = show({
      ...withStatuses("success", "failed", "not_attempted"),
      expiresAt: Date.now() - 1,
    })
    await flush()

    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()
    expect(screen.getByText(en.AssistantCards.retryFailed())).toBeTruthy()
    await flush()
  })

  it("after a remount with its first payload, past expiresAt, stays the group card while the executor holds the run unresolved", async () => {
    // The thread re-rendered the card it first showed, every leg ready; the
    // executor knows a leg went and another lost its answer.
    const { screen } = show(
      { ...groupSendFixture, expiresAt: Date.now() - 1 },
      fakeActions({
        can: {
          enabled: true,
          state: "unresolved",
          replyKey: "Assistant.groupSendPartial",
        },
      }),
    )

    expect(await screen.findByText(en.Assistant.groupSendPartial())).toBeTruthy()
    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()
    expect(screen.queryByTestId("assistant-card-refresh")).toBeNull()
    expect(screen.getByText(en.AssistantCards.retryFailed())).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByTestId("assistant-card-confirm-button")).not.toBeDisabled(),
    )
    await flush()
  })

  it("after a remount, past expiresAt, offers no Refresh for a disarmed run", async () => {
    const { screen } = show(
      { ...groupSendFixture, expiresAt: Date.now() - 1 },
      fakeActions({
        can: { enabled: false, state: "disarmed", replyKey: "Assistant.checkHistory" },
      }),
    )

    expect(await screen.findByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-refresh")).toBeNull()
    expect(screen.getByTestId("assistant-card-confirm-button")).toBeDisabled()
    await flush()
  })

  it("after a remount with its outcome's legs, past expiresAt, still offers to prepare the rest of a group retired for it", async () => {
    // Part of the group went and the rest's numbers went stale: the Confirm
    // retired it (prepareRest), its record kept for the legs that went. The
    // thread re-renders the card from that outcome's summary.
    const run = setupExecutor()
    const action = makeAction({
      execute: jest.fn(
        async (): Promise<ExecutionOutcome> => ({
          status: "unknown",
          replyKey: "Assistant.groupSendRestExpired",
          next: "prepareRest",
        }),
      ),
    })
    run.executor.addPrepared(action, "text")
    await run.executor.executePreparedAction(action.id)
    const actions = executorActions(run.executor)

    const screen = renderCard(
      <GroupSendSummaryCard
        payload={{
          ...withStatuses("success", "failed", "not_attempted"),
          preparedActionId: action.id,
          expiresAt: Date.now() - 1,
        }}
        actions={actions}
      />,
    )

    expect(await screen.findByText(en.Assistant.groupSendRestExpired())).toBeTruthy()
    expect(screen.queryByText(en.Assistant.actionNotFound())).toBeNull()
    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()
    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
    fireEvent.press(screen.getByTestId("assistant-card-reprepare"))
    expect(actions.reprepare).toHaveBeenCalledWith(action.id)
    expect(action.execute).toHaveBeenCalledTimes(1)
    await flush()
  })

  it("refuses a payload with no legs, or a leg without its username", async () => {
    for (const payload of [
      { ...groupSendFixture, legs: [] },
      {
        ...groupSendFixture,
        legs: [{ payeeLabel: "Alice", amountText: "$1.00", status: "pending" }],
      },
    ]) {
      const { screen } = show(payload)
      await flush()
      expect(screen.getByTestId("assistant-card-error")).toBeTruthy()
      screen.unmount()
    }
    await flush()
  })
})
