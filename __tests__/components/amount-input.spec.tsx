import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { AmountInput } from "../../app/components/amount-input/amount-input"
import { WalletCurrency } from "../../app/graphql/generated"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: () => "",
    getSecondaryAmountIfCurrencyIsDifferent: () => undefined,
  }),
}))

// The field and the keypad modal are their own components: here the field is
// a button, and the modal shows whether it is open and the way out it is given.
jest.mock("../../app/components/amount-input/amount-input-button", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { TouchableOpacity } =
    jest.requireActual<typeof import("react-native")>("react-native")
  return {
    AmountInputButton: ({ onPress }: { onPress: () => void }) =>
      mockReact.createElement(TouchableOpacity, { testID: "amount-field", onPress }),
  }
})
jest.mock("../../app/components/amount-input/amount-input-modal", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { TouchableOpacity, View } =
    jest.requireActual<typeof import("react-native")>("react-native")
  return {
    AmountInputModal: ({ isOpen, close }: { isOpen: boolean; close: () => void }) =>
      isOpen
        ? mockReact.createElement(
            View,
            { testID: "keypad" },
            mockReact.createElement(TouchableOpacity, {
              testID: "keypad-close",
              onPress: close,
            }),
          )
        : null,
  }
})

const props = {
  walletCurrency: WalletCurrency.Usd,
  convertMoneyAmount: jest.fn(),
}

beforeAll(() => {
  loadLocale("en")
})

describe("AmountInput", () => {
  it("keeps the keypad shut until the field is tapped", () => {
    render(<AmountInput {...props} />)
    expect(screen.queryByTestId("keypad")).toBeNull()

    fireEvent.press(screen.getByTestId("amount-field"))
    expect(screen.getByTestId("keypad")).toBeTruthy()
  })

  it("opens the keypad as it mounts when asked to", () => {
    render(<AmountInput {...props} initiallyOpen />)
    expect(screen.getByTestId("keypad")).toBeTruthy()
  })

  it("lets a keypad that opened itself be closed, and keeps it closed while the prop still asks", () => {
    render(<AmountInput {...props} initiallyOpen />)
    fireEvent.press(screen.getByTestId("keypad-close"))
    expect(screen.queryByTestId("keypad")).toBeNull()

    // A caller with no amount yet keeps passing true: that must not reopen it.
    screen.rerender(<AmountInput {...props} initiallyOpen />)
    expect(screen.queryByTestId("keypad")).toBeNull()
  })

  it("reads initiallyOpen as it mounts only: turning it on later opens nothing", () => {
    render(<AmountInput {...props} initiallyOpen={false} />)
    screen.rerender(<AmountInput {...props} initiallyOpen />)
    expect(screen.queryByTestId("keypad")).toBeNull()
  })
})
