import * as React from "react"
import { fireEvent } from "@testing-library/react-native"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { ClarificationCard } from "@app/assistant/cards/ClarificationCard"
import { clarificationFixture } from "@app/assistant/cards/fixtures"
import { en, renderCard } from "./render-card"

describe("ClarificationCard", () => {
  it("asks the templated question and shows each option with its full username", () => {
    const screen = renderCard(
      <ClarificationCard payload={clarificationFixture} onPick={jest.fn()} />,
    )

    expect(screen.getByText(en.Assistant.pickContact())).toBeTruthy()
    expect(screen.getByTestId("assistant-card-option-1").props.accessibilityLabel).toBe(
      "Alina, alina_k",
    )
    expect(screen.getByText("alina_k")).toBeTruthy()
  })

  it("hands the picked option's id to the thread", () => {
    const onPick = jest.fn()
    const screen = renderCard(
      <ClarificationCard payload={clarificationFixture} onPick={onPick} />,
    )

    fireEvent.press(screen.getByTestId("assistant-card-option-0"))

    expect(onPick).toHaveBeenCalledWith("contact:alice")
  })

  it("asks to say it another way when there is nothing to pick", () => {
    const screen = renderCard(
      <ClarificationCard
        payload={{
          type: "clarification",
          prompt: "Assistant.noContactMatch",
          options: [],
        }}
      />,
    )

    expect(screen.getByText(en.Assistant.noContactMatch())).toBeTruthy()
  })

  it("refuses a prompt the dictionary does not have", () => {
    const screen = renderCard(
      <ClarificationCard
        payload={{ ...clarificationFixture, prompt: "Assistant.payMallory" }}
      />,
    )

    expect(screen.getByTestId("assistant-card-error")).toBeTruthy()
  })
})
