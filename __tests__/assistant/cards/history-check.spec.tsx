import * as React from "react"
import { act, fireEvent, waitFor } from "@testing-library/react-native"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { CashoutOfferCard } from "@app/assistant/cards/CashoutOfferCard"
import { ConfirmPaymentCard } from "@app/assistant/cards/ConfirmPaymentCard"
import { cashoutOfferFixture, confirmPaymentFixture } from "@app/assistant/cards/fixtures"
import type { ConfirmResult } from "@app/assistant/engine/executor"
import { RECONCILE_STALE_AFTER_MS } from "@app/assistant/engine/reconcile"
import { lostResponse, SENT, setupSendingExecutor, T0 } from "../executor-harness"
import { fundedBefore, graphqlTx, page } from "../fakes"
import { en, executorActions, fakeActions, flush, renderCard } from "./render-card"

// "I checked my history" (spec §5.1, ENG-689 decision 1). A Confirm blocked
// by earlier dispatches of the same payment that the transaction list
// cannot settle, each at least a day old, may go through on the user's word
// that their history does not show the payment. The card offers that only
// when the executor says so (pendingDispatch, historyCheckable), says that
// tapping it sends, and confirms again with `historyChecked`, once.

const ID = confirmPaymentFixture.preparedActionId

const blocked = (historyCheckable: boolean): ConfirmResult => ({
  kind: "pendingDispatch",
  actionId: ID,
  replyKey: "Assistant.checkHistory",
  historyCheckable,
})

const confirmCard = (
  actions: ReturnType<typeof fakeActions>,
  payload: unknown = confirmPaymentFixture,
) => renderCard(<ConfirmPaymentCard payload={payload} actions={actions} />)

/** Tap Confirm, and let its result land. */
const pressConfirm = async (screen: ReturnType<typeof renderCard>) => {
  await waitFor(() =>
    expect(screen.getByTestId("assistant-card-confirm-button")).not.toBeDisabled(),
  )
  await act(async () => {
    fireEvent.press(screen.getByTestId("assistant-card-confirm-button"))
  })
  await flush()
}

describe("the history check on a confirm card", () => {
  it("is offered, with what tapping it does, when the dispatch in the way is a day old", async () => {
    const actions = fakeActions({ result: blocked(true) })
    const screen = confirmCard(actions)

    await pressConfirm(screen)

    expect(screen.getByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.getByTestId("assistant-card-history-checked")).toBeTruthy()
    expect(screen.getByText(en.AssistantCards.historyChecked())).toBeTruthy()
    expect(screen.getByTestId("assistant-card-history-hint").props.children).toBe(
      en.AssistantCards.historyCheckedHint(),
    )
    // Confirm itself is not offered again.
    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
  })

  it("is not offered while the dispatch in the way could still settle", async () => {
    const actions = fakeActions({ result: blocked(false) })
    const screen = confirmCard(actions)

    await pressConfirm(screen)

    expect(screen.getByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-history-checked")).toBeNull()
    expect(screen.queryByTestId("assistant-card-history-hint")).toBeNull()
  })

  it("confirms again with historyChecked, and only the card's id besides", async () => {
    const actions = fakeActions({ result: blocked(true) })
    const screen = confirmCard(actions)
    await pressConfirm(screen)
    actions.executePreparedAction.mockResolvedValue({
      kind: "executed",
      actionId: ID,
      outcome: { status: "succeeded" },
    })

    await act(async () => {
      fireEvent.press(screen.getByTestId("assistant-card-history-checked"))
    })
    await flush()

    expect(actions.executePreparedAction.mock.calls).toEqual([
      [ID],
      [ID, { historyChecked: true }],
    ])
    expect(screen.getByTestId("assistant-card-done")).toBeTruthy()
  })

  it("does nothing on a second tap while the first runs", async () => {
    const actions = fakeActions({ result: blocked(true) })
    const screen = confirmCard(actions)
    await pressConfirm(screen)
    let finish: (result: ConfirmResult) => void = () => undefined
    actions.executePreparedAction.mockImplementation(
      () =>
        new Promise<ConfirmResult>((resolve) => {
          finish = resolve
        }),
    )

    const button = screen.getByTestId("assistant-card-history-checked")
    await act(async () => {
      fireEvent.press(button)
      fireEvent.press(button)
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId("assistant-card-history-checked"))
    })

    expect(actions.executePreparedAction).toHaveBeenCalledTimes(2)
    await act(async () => {
      finish({ kind: "executed", actionId: ID, outcome: { status: "succeeded" } })
    })
    await flush()
  })

  it("is offered on a settlement offer too, which a blocked Confirm did not spend", async () => {
    const cashoutId = cashoutOfferFixture.preparedActionId
    const actions = fakeActions({
      result: { ...blocked(true), actionId: cashoutId },
    })
    const screen = renderCard(
      <CashoutOfferCard payload={cashoutOfferFixture} actions={actions} />,
    )
    await pressConfirm(screen)

    await act(async () => {
      fireEvent.press(screen.getByTestId("assistant-card-history-checked"))
    })
    await flush()

    expect(actions.executePreparedAction).toHaveBeenLastCalledWith(cashoutId, {
      historyChecked: true,
    })
  })
})

describe("the history check, through the executor, journal and reconciler", () => {
  // $5 to Alice lost its answer and the user left the thread. A day later
  // the list still cannot settle it: it shows a send since then that names
  // nothing. A new card for the same $5 to Alice is blocked, then sent on
  // the user's word.
  const landed = graphqlTx({
    id: "ibex-send",
    createdAt: Math.floor(T0 / 1000) + 2,
    settlementAmount: -500,
    initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
    settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
  })

  it("clears the record in the way exactly once, sends, and a second tap does nothing", async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const lost = run.prepare("thread-a")
    run.executor.addPrepared(lost, "text")
    await run.executor.executePreparedAction(lost.id)
    run.executor.leaveThread("thread-a")
    run.advance(RECONCILE_STALE_AFTER_MS)
    run.graphql.transactions.mockResolvedValue(page([landed, fundedBefore(T0, "USD")]))
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const again = run.prepare("thread-b")
    run.executor.addPrepared(again, "text")
    const clear = jest.spyOn(run.journal, "clear")
    const actions = executorActions(run.executor)
    const screen = confirmCard(actions as unknown as ReturnType<typeof fakeActions>, {
      // The card's countdown runs on the real clock; the executor's on the
      // harness's, so the fixture's far-off expiry stays.
      ...confirmPaymentFixture,
      preparedActionId: again.id,
    })

    await pressConfirm(screen)
    expect(run.keysSent()).toHaveLength(1)
    expect(clear).not.toHaveBeenCalled()

    const button = screen.getByTestId("assistant-card-history-checked")
    await act(async () => {
      fireEvent.press(button)
      fireEvent.press(button)
    })
    await flush()

    expect(clear.mock.calls.filter(([id]) => id === lost.id)).toHaveLength(1)
    expect(run.keysSent()).toHaveLength(2)
    expect(screen.getByTestId("assistant-card-done")).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-history-checked")).toBeNull()
    // Only the new card's own record is left to clear, and it was, on Success.
    await expect(run.journal.pending()).resolves.toEqual([])
  })
})
