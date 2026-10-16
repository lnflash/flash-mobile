import * as React from "react"
import { Text } from "react-native"
import { fireEvent } from "@testing-library/react-native"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { ExpiredCard } from "@app/assistant/cards/ExpiredCard"
import { expiredFixture, txListFixture } from "@app/assistant/cards/fixtures"
import { TxListCard } from "@app/assistant/cards/TxListCard"
import { en, fakeActions, renderCard } from "./render-card"

describe("TxListCard", () => {
  it("draws each transaction with the thread's own row, and says what was searched", () => {
    const renderTransaction = jest.fn((txId: string) => <Text>{`row ${txId}`}</Text>)
    const screen = renderCard(
      <TxListCard payload={txListFixture} renderTransaction={renderTransaction} />,
    )

    expect(renderTransaction.mock.calls.map(([txId]) => txId)).toEqual([
      "tx-1",
      "tx-2",
      "tx-3",
    ])
    expect(screen.getByText("row tx-2")).toBeTruthy()
    expect(screen.getByText("Searched your last 100 payments.")).toBeTruthy()
  })

  it("refuses a payload without its window, so a miss is never silent", () => {
    const { windowText: _window, ...missing } = txListFixture

    expect(
      renderCard(<TxListCard payload={missing} />).getByTestId("assistant-card-error"),
    ).toBeTruthy()
  })
})

describe("ExpiredCard", () => {
  it("offers Refresh, which prepares again and executes nothing", () => {
    const actions = fakeActions()
    const screen = renderCard(<ExpiredCard payload={expiredFixture} actions={actions} />)

    expect(screen.getByText(en.AssistantCards.expiredBody())).toBeTruthy()
    fireEvent.press(screen.getByTestId("assistant-card-refresh"))

    expect(actions.reprepare).toHaveBeenCalledWith("action-expired")
    expect(actions.executePreparedAction).not.toHaveBeenCalled()
  })

  it("disables Refresh when the thread gave no way to prepare again", () => {
    const screen = renderCard(<ExpiredCard payload={expiredFixture} actions={{}} />)

    expect(screen.getByTestId("assistant-card-refresh")).toBeDisabled()
  })
})
