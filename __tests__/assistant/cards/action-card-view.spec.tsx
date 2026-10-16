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
  txListFixture,
} from "@app/assistant/cards/fixtures"
import { fakeActions, flush, renderCard } from "./render-card"

const CASES: [unknown, string][] = [
  [confirmPaymentFixture, "assistant-card-confirm"],
  [invoiceFixture, "assistant-card-invoice"],
  [groupSendFixture, "assistant-card-group"],
  [txListFixture, "assistant-card-txlist"],
  [clarificationFixture, "assistant-card-clarification"],
  [cashoutOfferFixture, "assistant-card-cashout"],
  [expiredFixture, "assistant-card-expired"],
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
