import * as React from "react"
import { Modal } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { AmountInputModal } from "../../app/components/amount-input/amount-input-modal"
import { WalletCurrency } from "../../app/graphql/generated"

// The keypad screen is its own component: here it shows only that it is up.
jest.mock("../../app/components/amount-input-screen", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { View } = jest.requireActual<typeof import("react-native")>("react-native")
  return {
    AmountInputScreen: () => mockReact.createElement(View, { testID: "keypad" }),
  }
})
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)

describe("AmountInputModal", () => {
  it("closes on Android's back key, which reaches a core Modal only as onRequestClose", () => {
    const close = jest.fn()
    render(
      <ThemeProvider theme={createTheme({})}>
        <AmountInputModal
          isOpen
          close={close}
          walletCurrency={WalletCurrency.Usd}
          convertMoneyAmount={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(screen.getByTestId("keypad")).toBeTruthy()

    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose")
    expect(close).toHaveBeenCalledTimes(1)
  })
})
