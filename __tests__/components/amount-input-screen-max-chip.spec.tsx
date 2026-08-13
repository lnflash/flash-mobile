import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import {
  AmountInputScreen,
  MaxAmountButton,
} from "../../app/components/amount-input-screen"
import { WalletCurrency } from "../../app/graphql/generated"
import { ConvertMoneyAmount } from "../../app/screens/send-bitcoin-screen/payment-details"
import { MoneyAmount, WalletOrDisplayCurrency } from "../../app/types/amounts"

// Test rate: 1 sat = 2 display minor units (cents).
const SAT_TO_CENTS = 2

const currencyInfo = {
  DisplayCurrency: {
    symbol: "$",
    minorUnitToMajorUnitOffset: 2,
    showFractionDigits: true,
    currencyCode: "USD",
  },
  BTC: {
    symbol: "",
    minorUnitToMajorUnitOffset: 0,
    showFractionDigits: false,
    currencyCode: "SAT",
  },
  USD: {
    symbol: "$",
    minorUnitToMajorUnitOffset: 2,
    showFractionDigits: true,
    currencyCode: "USD",
  },
}

const zeroDisplayAmount = {
  amount: 0,
  currency: "DisplayCurrency",
  currencyCode: "USD",
}

const mockUseDisplayCurrency = () => ({
  currencyInfo,
  zeroDisplayAmount,
  formatMoneyAmount: ({
    moneyAmount,
  }: {
    moneyAmount: MoneyAmount<WalletOrDisplayCurrency>
  }) => `${moneyAmount.amount} ${moneyAmount.currencyCode}`,
  getSecondaryAmountIfCurrencyIsDifferent: ({
    primaryAmount,
    walletAmount,
    displayAmount,
  }: {
    primaryAmount: MoneyAmount<WalletOrDisplayCurrency>
    walletAmount: MoneyAmount<WalletOrDisplayCurrency>
    displayAmount: MoneyAmount<WalletOrDisplayCurrency>
  }) => (primaryAmount.currency === walletAmount.currency ? displayAmount : walletAmount),
  moneyAmountToDisplayCurrencyString: () => "$100.00",
})

// AmountInputScreen imports from the concrete module…
jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => mockUseDisplayCurrency(),
}))
// …while AmountInputScreenUI imports from the hooks barrel.
jest.mock("@app/hooks", () => ({
  useBreez: () => ({ btcWallet: { balance: 5_000 } }),
  useDisplayCurrency: () => mockUseDisplayCurrency(),
}))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useWalletOverviewScreenQuery: () => ({ data: undefined }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
// A single stand-in key so tests can simulate the user editing the amount.
jest.mock("@app/components/currency-keyboard", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { Pressable } = jest.requireActual("react-native")
  return {
    CurrencyKeyboard: ({ onPress }: { onPress: (key: string) => void }) =>
      mockReact.createElement(Pressable, {
        testID: "key-1",
        onPress: () => onPress("1"),
      }),
  }
})

const convertMoneyAmount = (<W extends WalletOrDisplayCurrency>(
  moneyAmount: MoneyAmount<WalletOrDisplayCurrency>,
  toCurrency: W,
): MoneyAmount<W> => {
  const inSats =
    moneyAmount.currency === "BTC"
      ? moneyAmount.amount
      : moneyAmount.amount / SAT_TO_CENTS
  const amount = toCurrency === "BTC" ? inSats : inSats * SAT_TO_CENTS
  return {
    amount,
    currency: toCurrency,
    currencyCode: toCurrency === "BTC" ? "SAT" : "USD",
  }
}) as ConvertMoneyAmount

const maxSats: MoneyAmount<WalletOrDisplayCurrency> = {
  amount: 1_000,
  currency: WalletCurrency.Btc,
  currencyCode: "SAT",
}

const renderScreen = (maxAmountButton?: MaxAmountButton) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <AmountInputScreen
        goBack={jest.fn()}
        setAmount={jest.fn()}
        walletCurrency={WalletCurrency.Btc}
        convertMoneyAmount={convertMoneyAmount}
        maxAmountButton={maxAmountButton}
      />
    </ThemeProvider>,
  )

beforeAll(() => {
  loadLocale("en")
})

describe("AmountInputScreen MAX chip", () => {
  it("renders no chip when the maxAmountButton prop is absent", () => {
    const { queryByTestId } = renderScreen()

    expect(queryByTestId("Max Amount Chip")).toBeNull()
  })

  it("renders an outlined (available) chip when the prop is provided", () => {
    const { getByTestId } = renderScreen({
      compute: jest.fn(async () => ({ amount: maxSats })),
    })

    const chip = getByTestId("Max Amount Chip")
    expect(chip.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: false }),
    )
  })

  it("fills the max in the display currency, goes solid, and shows the note", async () => {
    const compute = jest.fn(async () => ({
      amount: maxSats,
      note: "Test fee note",
    }))
    const { getByTestId, getByText } = renderScreen({ compute })

    fireEvent.press(getByTestId("Max Amount Chip"))

    await waitFor(() => {
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      )
    })
    expect(compute).toHaveBeenCalledTimes(1)
    // 1,000 sats at 2 cents/sat = $20.00 in the primary display currency
    expect(getByText("$20.00")).toBeTruthy()
    expect(getByTestId("Max Amount Note").props.children).toBe("Test fee note")
  })

  it("returns to outlined and hides the note the moment the user edits the amount", async () => {
    const { getByTestId, queryByTestId } = renderScreen({
      compute: jest.fn(async () => ({ amount: maxSats, note: "Test fee note" })),
    })

    fireEvent.press(getByTestId("Max Amount Chip"))
    await waitFor(() => {
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      )
    })

    fireEvent.press(getByTestId("key-1"))

    await waitFor(() => {
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false }),
      )
    })
    expect(queryByTestId("Max Amount Note")).toBeNull()
  })

  it("keeps the chip solid across a currency toggle (same underlying amount)", async () => {
    const { getByTestId, getByText } = renderScreen({
      compute: jest.fn(async () => ({ amount: maxSats, note: "Test fee note" })),
    })

    fireEvent.press(getByTestId("Max Amount Chip"))
    await waitFor(() => {
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      )
    })

    // The secondary row shows the wallet amount — pressing it toggles currency.
    fireEvent.press(getByText(/1000 SAT/))

    await waitFor(() => {
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      )
    })
  })

  it("is greyed out and inert when the balance is zero", () => {
    const compute = jest.fn(async () => ({ amount: maxSats }))
    const { getByTestId } = renderScreen({ disabled: true, compute })

    const chip = getByTestId("Max Amount Chip")
    expect(chip.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    )

    fireEvent.press(chip)
    expect(compute).not.toHaveBeenCalled()
  })
})
