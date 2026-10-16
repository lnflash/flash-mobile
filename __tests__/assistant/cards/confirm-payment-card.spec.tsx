import * as React from "react"
import { act, fireEvent, waitFor } from "@testing-library/react-native"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import type { CardActions } from "@app/assistant/cards/card-actions"
import { ConfirmPaymentCard } from "@app/assistant/cards/ConfirmPaymentCard"
import { confirmPaymentFixture } from "@app/assistant/cards/fixtures"
import type { CanConfirm, ConfirmResult, Executor } from "@app/assistant/engine/executor"
import type { ExecutionOutcome } from "@app/assistant/registry/types"
import { makeAction, setupExecutor } from "../executor-harness"
import { en, fakeActions, flush, renderCard } from "./render-card"

const ID = confirmPaymentFixture.preparedActionId

const executed = (
  outcome: Extract<ConfirmResult, { kind: "executed" }>["outcome"],
): ConfirmResult => ({ kind: "executed", actionId: ID, outcome })

const show = (payload: unknown, actions = fakeActions()) => ({
  screen: renderCard(<ConfirmPaymentCard payload={payload} actions={actions} />),
  actions,
})

const confirmButton = (screen: ReturnType<typeof renderCard>) =>
  screen.getByTestId("assistant-card-confirm-button")

afterEach(() => {
  jest.useRealTimers()
})

describe("ConfirmPaymentCard", () => {
  it("shows every figure as the tool wrote it, and the payee's full username", async () => {
    const { screen } = show(confirmPaymentFixture)
    await flush()

    for (const text of [
      "Mom",
      "jane_doe",
      "J$785.00 ($5.00)",
      "J$0.00 ($0.00)",
      "J$11,775.00 ($75.00)",
      "Lunch",
      en.common.usdAccount(),
    ]) {
      // The fixture's amount and total read the same.
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
    await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())
    await flush()
  })

  it("reads under a screen reader: payee, amount, fee and total labeled, Confirm a button with its amount", async () => {
    const { screen } = show(confirmPaymentFixture)
    await flush()

    expect(screen.getByTestId("assistant-card-payee").props.accessibilityLabel).toBe(
      `${en.common.to()}, Mom, jane_doe`,
    )
    expect(screen.getByTestId("assistant-card-amount").props.accessibilityLabel).toBe(
      `${en.SendBitcoinScreen.amount()}, J$785.00 ($5.00)`,
    )
    expect(screen.getByTestId("assistant-card-fee").props.accessibilityLabel).toBe(
      `${en.common.Fee()}, J$0.00 ($0.00)`,
    )
    expect(screen.getByTestId("assistant-card-total").props.accessibilityLabel).toBe(
      `${en.common.total()}, J$785.00 ($5.00)`,
    )
    const button = confirmButton(screen)
    expect(button.props.accessibilityRole).toBe("button")
    expect(button.props.accessibilityLabel).toBe(
      en.AssistantCards.confirmWithAmount({ amount: "J$785.00 ($5.00)" }),
    )
    await waitFor(() => expect(button).not.toBeDisabled())
    await flush()
  })

  it("Confirm calls executePreparedAction with the card's own id, and nothing else", async () => {
    const { screen, actions } = show(confirmPaymentFixture)
    await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())

    fireEvent.press(confirmButton(screen))

    await waitFor(() => expect(actions.onResult).toHaveBeenCalled())
    expect(actions.executePreparedAction).toHaveBeenCalledTimes(1)
    expect(actions.executePreparedAction).toHaveBeenCalledWith(ID)
    expect(actions.canConfirm).toHaveBeenCalledWith(ID)
    expect(actions.reprepare).not.toHaveBeenCalled()
    await flush()
  })

  it("keeps Confirm disabled until the executor says it would run: it fails closed", async () => {
    let answer: (value: CanConfirm) => void = () => undefined
    const actions = fakeActions()
    actions.canConfirm.mockImplementation(
      () =>
        new Promise<CanConfirm>((resolve) => {
          answer = resolve
        }),
    )
    const { screen } = show(confirmPaymentFixture, actions)
    await flush()

    expect(confirmButton(screen)).toBeDisabled()
    fireEvent.press(confirmButton(screen))
    expect(actions.executePreparedAction).not.toHaveBeenCalled()

    await act(async () => answer({ enabled: true, state: "armed" }))
    expect(confirmButton(screen)).not.toBeDisabled()
    await flush()
  })

  it("disables Confirm, saying why, without an auth method", async () => {
    const { screen, actions } = show(
      confirmPaymentFixture,
      fakeActions({
        can: { enabled: false, state: "armed", replyKey: "Assistant.authUnavailable" },
      }),
    )

    expect(await screen.findByText(en.Assistant.authUnavailable())).toBeTruthy()
    expect(confirmButton(screen)).toBeDisabled()
    fireEvent.press(confirmButton(screen))
    expect(actions.executePreparedAction).not.toHaveBeenCalled()
    await flush()
  })

  it("disables Confirm when the executor cannot be asked", async () => {
    const actions = fakeActions()
    actions.canConfirm.mockRejectedValue(new Error("gone"))
    const { screen } = show(confirmPaymentFixture, actions)

    await waitFor(() => expect(actions.canConfirm).toHaveBeenCalled())
    expect(confirmButton(screen)).toBeDisabled()
    await flush()
  })

  it("past expiresAt becomes the expired card: Refresh prepares again and executes nothing", async () => {
    const { screen, actions } = show({
      ...confirmPaymentFixture,
      expiresAt: Date.now() - 1,
    })
    await flush()

    expect(screen.getByText(en.AssistantCards.expiredTitle())).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()

    fireEvent.press(screen.getByTestId("assistant-card-refresh"))

    expect(actions.reprepare).toHaveBeenCalledWith(ID)
    expect(actions.executePreparedAction).not.toHaveBeenCalled()
    await flush()
  })

  it("turns into the expired card the moment expiresAt passes", async () => {
    jest.useFakeTimers()
    const expiresAt = Date.now() + 60_000
    const { screen } = show({ ...confirmPaymentFixture, expiresAt })
    await flush()
    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(screen.getByText(en.AssistantCards.expiredTitle())).toBeTruthy()
    await flush()
  })

  it("says it went after a success, and offers nothing more", async () => {
    const { screen } = show(confirmPaymentFixture)
    await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())

    fireEvent.press(confirmButton(screen))

    expect(await screen.findByText(en.AssistantCards.legSent())).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
    expect(screen.queryByTestId("assistant-card-reprepare")).toBeNull()
    await flush()
  })

  it("after an unknown outcome stays disarmed with the history message, and offers no re-prepare", async () => {
    const actions = fakeActions({
      result: executed({
        status: "unknown",
        replyKey: "Assistant.checkHistory",
        next: "checkHistory",
      }),
    })
    const { screen } = show(confirmPaymentFixture, actions)
    await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())

    fireEvent.press(confirmButton(screen))

    expect(await screen.findByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
    expect(screen.queryByTestId("assistant-card-reprepare")).toBeNull()
    expect(actions.reprepare).not.toHaveBeenCalled()
    await flush()
  })

  it("after a refusal before dispatch shows the error and offers to prepare again", async () => {
    const actions = fakeActions({
      result: executed({
        status: "failed",
        replyKey: "Assistant.paymentFailed",
        next: "reprepare",
      }),
    })
    const { screen } = show(confirmPaymentFixture, actions)
    await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())

    fireEvent.press(confirmButton(screen))

    expect(await screen.findByText(en.Assistant.paymentFailed())).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
    fireEvent.press(screen.getByTestId("assistant-card-reprepare"))
    expect(actions.reprepare).toHaveBeenCalledWith(ID)
    expect(actions.executePreparedAction).toHaveBeenCalledTimes(1)
    await flush()
  })

  it("after a keyed failure lets Confirm run again, and after a lost answer retries it", async () => {
    for (const outcome of [
      { status: "failed", replyKey: "Assistant.paymentFailed", next: "confirmAgain" },
      { status: "unknown", replyKey: "Assistant.checkHistory", next: "retrySameAttempt" },
    ] as const) {
      const actions = fakeActions({ result: executed(outcome) })
      const { screen } = show(confirmPaymentFixture, actions)
      await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())

      fireEvent.press(confirmButton(screen))

      expect(
        await screen.findByText(
          en.Assistant[outcome.replyKey.slice(10) as "paymentFailed"](),
        ),
      ).toBeTruthy()
      await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())
      expect(screen.queryByTestId("assistant-card-reprepare")).toBeNull()
      screen.unmount()
    }
    await flush()
  })

  it("shows what reaches the other wallet on its own labeled line, for a conversion", async () => {
    const { screen } = show({
      ...confirmPaymentFixture,
      payeeLabel: "BTC",
      payeeUsername: undefined,
      toWallet: "BTC",
      receiveText: "$4.99 (7,917 sats)",
    })
    await flush()

    expect(screen.getByTestId("assistant-card-receive").props.accessibilityLabel).toBe(
      `${en.AssistantCards.youReceive()}, $4.99 (7,917 sats)`,
    )
    await flush()
  })

  it("names the user's own wallet for a conversion, with no username", async () => {
    const { screen } = show({
      ...confirmPaymentFixture,
      payeeLabel: "BTC",
      payeeUsername: undefined,
      toWallet: "BTC",
    })
    await flush()

    expect(screen.getByTestId("assistant-card-payee").props.accessibilityLabel).toBe(
      `${en.common.to()}, ${en.common.btcAccount()}`,
    )
    await flush()
  })

  it("refuses a payload with a field missing, an empty text, another card's type or an extra field", async () => {
    const { payeeLabel: _payee, ...missing } = confirmPaymentFixture
    for (const payload of [
      missing,
      { ...confirmPaymentFixture, totalText: "" },
      { ...confirmPaymentFixture, type: "cashoutOffer" },
      { ...confirmPaymentFixture, payeeAddress: "bc1q..." },
      null,
    ]) {
      const { screen, actions } = show(payload)
      await flush()
      expect(screen.getByTestId("assistant-card-error")).toBeTruthy()
      expect(screen.getByText(en.AssistantCards.cardUnavailable())).toBeTruthy()
      expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
      expect(actions.canConfirm).not.toHaveBeenCalled()
      screen.unmount()
    }
    await flush()
  })
})

describe("ConfirmPaymentCard after a remount: the executor is the source of truth", () => {
  // A thread row that is virtualized away and back, or a thread re-render,
  // mounts the card again with nothing remembered. What the card offers then
  // comes from the executor (canConfirm), never from the card's own state.

  /** The card's two executor calls, wired to a real executor. */
  const executorActions = (executor: Executor) => {
    const actions = {
      canConfirm: (id: string) => executor.canConfirm(id),
      executePreparedAction: (id: string) => executor.executePreparedAction(id),
      reprepare: jest.fn(),
      onResult: jest.fn(),
    }
    return actions as typeof actions & CardActions
  }

  const showOver = (payload: unknown, actions: CardActions) => ({
    screen: renderCard(<ConfirmPaymentCard payload={payload} actions={actions} />),
  })

  /** A confirm card for `outcomes`, held by a real executor, confirmed once. */
  const confirmedOnce = async (...outcomes: ExecutionOutcome[]) => {
    const run = setupExecutor()
    const execute = jest.fn(
      async (): Promise<ExecutionOutcome> => ({ status: "succeeded" }),
    )
    outcomes.forEach((outcome) => execute.mockResolvedValueOnce(outcome))
    const action = makeAction({ execute })
    run.executor.addPrepared(action, "text")
    const actions = executorActions(run.executor)
    const payload = {
      ...confirmPaymentFixture,
      preparedActionId: action.id,
      expiresAt: Date.now() + 60_000,
    }
    const first = showOver(payload, actions)
    await waitFor(() => expect(confirmButton(first.screen)).not.toBeDisabled())
    fireEvent.press(confirmButton(first.screen))
    await waitFor(() => expect(actions.onResult).toHaveBeenCalled())
    first.screen.unmount()
    // Back past the card's expiry, and past the action's in the executor.
    run.advance(5 * 60_000)
    return { ...run, action, actions, stale: { ...payload, expiresAt: Date.now() - 1 } }
  }

  it("keeps a disarmed action's history notice, past expiresAt: no Refresh, no re-prepare", async () => {
    const { action, actions, stale } = await confirmedOnce({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "checkHistory",
    })

    const { screen } = showOver(stale, actions)

    expect(await screen.findByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()
    expect(screen.queryByTestId("assistant-card-refresh")).toBeNull()
    expect(screen.queryByTestId("assistant-card-reprepare")).toBeNull()
    expect(confirmButton(screen)).toBeDisabled()
    fireEvent.press(confirmButton(screen))
    expect(action.execute).toHaveBeenCalledTimes(1)
    expect(action.refresh).not.toHaveBeenCalled()
    expect(actions.reprepare).not.toHaveBeenCalled()
    await flush()
  })

  it("keeps a lost answer's retry, past expiresAt: Confirm retries the same attempt, no Refresh", async () => {
    const { action, actions, stale } = await confirmedOnce({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "retrySameAttempt",
    })

    const { screen } = showOver(stale, actions)

    expect(await screen.findByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()
    await waitFor(() => expect(confirmButton(screen)).not.toBeDisabled())
    fireEvent.press(confirmButton(screen))

    expect(await screen.findByText(en.AssistantCards.legSent())).toBeTruthy()
    expect(action.execute).toHaveBeenCalledTimes(2)
    // The retry ran with the action's own attempt: its key, not a new one.
    expect(action.execute.mock.calls[1][0].attempt).toBe(
      action.execute.mock.calls[0][0].attempt,
    )
    expect(action.refresh).not.toHaveBeenCalled()
    expect(actions.reprepare).not.toHaveBeenCalled()
    await flush()
  })

  it("says a payment that went did, past expiresAt: no Refresh, no Confirm", async () => {
    const { actions, stale } = await confirmedOnce({ status: "succeeded" })

    const { screen } = showOver(stale, actions)

    expect(await screen.findByText(en.AssistantCards.legSent())).toBeTruthy()
    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()
    expect(screen.queryByTestId("assistant-card-confirm-button")).toBeNull()
    await flush()
  })

  it("offers Refresh only once the executor says the action is armed, or gone", async () => {
    for (const state of ["armed", "gone"] as const) {
      let answer: (value: CanConfirm) => void = () => undefined
      const actions = fakeActions()
      actions.canConfirm.mockImplementation(
        () =>
          new Promise<CanConfirm>((resolve) => {
            answer = resolve
          }),
      )
      const { screen } = show(
        { ...confirmPaymentFixture, expiresAt: Date.now() - 1 },
        actions,
      )
      await flush()

      // Not knowing where the action stands, it offers no Refresh: it fails
      // closed, as Confirm does.
      expect(screen.queryByTestId("assistant-card-refresh")).toBeNull()
      expect(confirmButton(screen)).toBeDisabled()

      await act(async () => answer({ enabled: state === "armed", state }))
      expect(screen.getByTestId("assistant-card-refresh")).toBeTruthy()
      screen.unmount()
    }
    await flush()
  })
})
