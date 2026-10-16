import * as React from "react"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { ActionCardView } from "@app/assistant/cards/ActionCardView"
import {
  cashoutOfferFixture,
  clarificationFixture,
  confirmPaymentFixture,
  expiredFixture,
  groupSendFixture,
  invoiceFixture,
  prepareRefusedFixture,
  txListFixture,
} from "@app/assistant/cards/fixtures"
import { prepareRefusalResult } from "@app/assistant/registry/refusals"
import type { PrepareRefusalReason } from "@app/assistant/registry/types"
import { en, fakeActions, flush, renderCard } from "./render-card"

const CASES: [unknown, string][] = [
  [confirmPaymentFixture, "assistant-card-confirm"],
  [invoiceFixture, "assistant-card-invoice"],
  [groupSendFixture, "assistant-card-group"],
  [txListFixture, "assistant-card-txlist"],
  [clarificationFixture, "assistant-card-clarification"],
  [cashoutOfferFixture, "assistant-card-cashout"],
  [expiredFixture, "assistant-card-expired"],
  [prepareRefusedFixture, "assistant-card-refused"],
]

/** Each reason a prepare refuses with, and the reply its card says (spec §5.1). */
const REFUSALS: [PrepareRefusalReason, string][] = [
  ["insufficientBalance", en.Assistant.insufficientBalance()],
  ["limitExceeded", en.Assistant.limitExceeded()],
  ["notAvailableYet", en.Assistant.notYetAvailable()],
]

describe("ActionCardView: the card renderer", () => {
  CASES.forEach(([payload, testID]) =>
    it(`draws a ${
      (payload as { type: string }).type
    } card with its own component`, async () => {
      const screen = renderCard(
        <ActionCardView payload={payload} actions={fakeActions()} />,
      )
      await flush()

      expect(screen.getByTestId(testID)).toBeTruthy()
    }),
  )

  REFUSALS.forEach(([reason, reply]) =>
    it(`draws a refused prepare's card with its reply, for ${reason}`, async () => {
      // The card runTool answers a refusal with, as it answers it.
      const result = prepareRefusalResult(reason)
      if (result.kind !== "error" || !result.card) throw new Error("no refusal card")
      const actions = fakeActions()
      const screen = renderCard(
        <ActionCardView payload={result.card} actions={actions} />,
      )
      await flush()

      expect(screen.getByTestId("assistant-card-refused")).toBeTruthy()
      expect(screen.getByText(reply)).toBeTruthy()
      expect(screen.queryByTestId("assistant-card-error")).toBeNull()
      expect(screen.getByTestId("assistant-card-refused").props.accessibilityRole).toBe(
        "alert",
      )
      // It offers nothing: there is no action behind it.
      expect(screen.queryByRole("button")).toBeNull()
      expect(actions.canConfirm).not.toHaveBeenCalled()
    }),
  )

  it("draws the templated error card for a refusal with a reason it does not know", async () => {
    const screen = renderCard(
      <ActionCardView
        payload={{ type: "prepareRefused", reason: "tooRich" }}
        actions={fakeActions()}
      />,
    )
    await flush()

    expect(screen.getByTestId("assistant-card-error")).toBeTruthy()
    expect(screen.queryByTestId("assistant-card-refused")).toBeNull()
  })

  it("draws the templated error card for a payload of no known type", async () => {
    const screen = renderCard(
      <ActionCardView
        payload={{ type: "wireMoney", to: "mallory" }}
        actions={fakeActions()}
      />,
    )
    await flush()

    expect(screen.getByTestId("assistant-card-error")).toBeTruthy()
  })
})
