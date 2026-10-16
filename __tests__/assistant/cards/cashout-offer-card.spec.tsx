import * as React from "react"
import { fireEvent, waitFor } from "@testing-library/react-native"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { CashoutOfferCard } from "@app/assistant/cards/CashoutOfferCard"
import { cashoutOfferFixture } from "@app/assistant/cards/fixtures"
import { en, fakeActions, flush, renderCard } from "./render-card"

const show = (payload: unknown, actions = fakeActions()) => ({
  screen: renderCard(<CashoutOfferCard payload={payload} actions={actions} />),
  actions,
})

describe("CashoutOfferCard", () => {
  it("shows the offer in the settle screen's words, every row labeled", async () => {
    const { screen } = show(cashoutOfferFixture)
    await flush()

    expect(screen.getByTestId("assistant-card-amount").props.accessibilityLabel).toBe(
      `${en.Cashout.sendAmount()}, $100.00`,
    )
    expect(screen.getByTestId("assistant-card-fee").props.accessibilityLabel).toBe(
      `${en.Cashout.fee()}, $2.00`,
    )
    expect(screen.getByTestId("assistant-card-receive").props.accessibilityLabel).toBe(
      `${en.Cashout.receiveAmount()}, J$15,386.00`,
    )
    expect(screen.getByTestId("assistant-card-bank").props.accessibilityLabel).toBe(
      `${en.Cashout.withdrawTo()}, NCB ••4321`,
    )
    await flush()
  })

  it("is single use: after the first Confirm, whatever it did, Confirm never runs again", async () => {
    // A denied prompt would let any other card confirm again.
    const actions = fakeActions({
      result: {
        kind: "denied",
        actionId: "action-cashout",
        replyKey: "Assistant.authDenied",
      },
    })
    const { screen } = show(cashoutOfferFixture, actions)
    await flush()
    const button = () => screen.getByTestId("assistant-card-confirm-button")
    await waitFor(() => expect(button()).not.toBeDisabled())

    fireEvent.press(button())
    expect(await screen.findByText(en.Assistant.authDenied())).toBeTruthy()
    fireEvent.press(button())

    expect(button()).toBeDisabled()
    expect(actions.executePreparedAction).toHaveBeenCalledTimes(1)
    expect(actions.executePreparedAction).toHaveBeenCalledWith("action-cashout")
    await flush()
  })

  it("offers a new offer after a settlement that failed, and points to the history after one that may have gone", async () => {
    const failed = fakeActions({
      result: {
        kind: "executed",
        actionId: "action-cashout",
        outcome: {
          status: "failed",
          replyKey: "Assistant.cashoutFailed",
          next: "reprepare",
        },
      },
    })
    const first = show(cashoutOfferFixture, failed)
    await waitFor(() =>
      expect(
        first.screen.getByTestId("assistant-card-confirm-button"),
      ).not.toBeDisabled(),
    )
    fireEvent.press(first.screen.getByTestId("assistant-card-confirm-button"))
    expect(await first.screen.findByText(en.Assistant.cashoutFailed())).toBeTruthy()
    fireEvent.press(first.screen.getByTestId("assistant-card-reprepare"))
    expect(failed.reprepare).toHaveBeenCalledWith("action-cashout")
    first.screen.unmount()

    const lost = fakeActions({
      result: {
        kind: "executed",
        actionId: "action-cashout",
        outcome: {
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "checkHistory",
        },
      },
    })
    const second = show(cashoutOfferFixture, lost)
    await waitFor(() =>
      expect(
        second.screen.getByTestId("assistant-card-confirm-button"),
      ).not.toBeDisabled(),
    )
    fireEvent.press(second.screen.getByTestId("assistant-card-confirm-button"))
    expect(await second.screen.findByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(second.screen.queryByTestId("assistant-card-reprepare")).toBeNull()
    await flush()
  })

  it("past the offer's expiry becomes the expired card", async () => {
    const { screen } = show({ ...cashoutOfferFixture, expiresAt: Date.now() - 1 })
    await flush()

    expect(screen.getByText(en.AssistantCards.expiredTitle())).toBeTruthy()
    await flush()
  })

  it("after a remount past the offer's expiry, offers no Refresh for a settlement that may have gone", async () => {
    const { screen, actions } = show(
      { ...cashoutOfferFixture, expiresAt: Date.now() - 1 },
      fakeActions({
        can: { enabled: false, state: "disarmed", replyKey: "Assistant.checkHistory" },
      }),
    )

    expect(await screen.findByText(en.Assistant.checkHistory())).toBeTruthy()
    expect(screen.queryByText(en.AssistantCards.expiredTitle())).toBeNull()
    expect(screen.queryByTestId("assistant-card-refresh")).toBeNull()
    fireEvent.press(screen.getByTestId("assistant-card-confirm-button"))
    expect(actions.executePreparedAction).not.toHaveBeenCalled()
    expect(actions.reprepare).not.toHaveBeenCalled()
    await flush()
  })

  it("refuses a payload without its bank label", async () => {
    const { bankLabel: _bank, ...missing } = cashoutOfferFixture
    const { screen } = show(missing)
    await flush()

    expect(screen.getByTestId("assistant-card-error")).toBeTruthy()
    await flush()
  })
})
