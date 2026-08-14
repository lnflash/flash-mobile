import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

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

  it("steps the fill down when the display round-trip would overdraw the max", async () => {
    // The on-device overdraw class: the pad holds a coarser currency than
    // the wallet and the converter rounds. 1 display cent = 10 sats here:
    // a 109-sat max forward-rounds to 11 cents, which round-trips back to
    // 110 sats — more than the max. The fill must step down to 10 cents
    // (100 sats); offering 11 would overdraw at send time.
    const CENT_TO_SATS = 10
    const roundingConvert = (<W extends WalletOrDisplayCurrency>(
      moneyAmount: MoneyAmount<WalletOrDisplayCurrency>,
      toCurrency: W,
    ): MoneyAmount<W> => {
      const inSats =
        moneyAmount.currency === "BTC"
          ? moneyAmount.amount
          : moneyAmount.amount * CENT_TO_SATS
      const amount = toCurrency === "BTC" ? inSats : Math.round(inSats / CENT_TO_SATS)
      return {
        amount,
        currency: toCurrency,
        currencyCode: toCurrency === "BTC" ? "SAT" : "USD",
      } as MoneyAmount<W>
    }) as ConvertMoneyAmount

    const compute = jest.fn(async () => ({
      amount: {
        amount: 109,
        currency: WalletCurrency.Btc,
        currencyCode: "SAT",
      } as MoneyAmount<WalletOrDisplayCurrency>,
    }))

    const { getByTestId, getByText } = render(
      <ThemeProvider theme={createTheme({})}>
        <AmountInputScreen
          goBack={jest.fn()}
          setAmount={jest.fn()}
          walletCurrency={WalletCurrency.Btc}
          convertMoneyAmount={roundingConvert}
          maxAmountButton={{ compute }}
        />
      </ThemeProvider>,
    )

    fireEvent.press(getByTestId("Max Amount Chip"))

    // 10 display cents = $0.10; the naive round(10.9) = 11-cent fill would
    // render $0.11 and overdraw to 110 sats at send time.
    await waitFor(() => {
      expect(getByText("$0.10")).toBeTruthy()
    })
  })

  it("fills the max in wallet units when it floors to zero display units", async () => {
    // Dust-balance class: a positive wallet max worth under one display
    // minor unit. 1 display cent = 10 sats here, so a 5-sat max converts
    // to 0.5 cents and floors to 0. Filling 0 would empty the pad under a
    // solid MAX chip (Set Amount ready to commit $0) — the fill must fall
    // back to wallet units and show the true 5-sat max instead.
    const CENT_TO_SATS = 10
    const flooringConvert = (<W extends WalletOrDisplayCurrency>(
      moneyAmount: MoneyAmount<WalletOrDisplayCurrency>,
      toCurrency: W,
    ): MoneyAmount<W> => {
      const inSats =
        moneyAmount.currency === "BTC"
          ? moneyAmount.amount
          : moneyAmount.amount * CENT_TO_SATS
      const amount = toCurrency === "BTC" ? Math.round(inSats) : inSats / CENT_TO_SATS
      return {
        amount,
        currency: toCurrency,
        currencyCode: toCurrency === "BTC" ? "SAT" : "USD",
      } as MoneyAmount<W>
    }) as ConvertMoneyAmount

    const compute = jest.fn(async () => ({
      amount: {
        amount: 5,
        currency: WalletCurrency.Btc,
        currencyCode: "SAT",
      } as MoneyAmount<WalletOrDisplayCurrency>,
      note: "Test fee note",
    }))

    const { getByTestId, getByText } = render(
      <ThemeProvider theme={createTheme({})}>
        <AmountInputScreen
          goBack={jest.fn()}
          setAmount={jest.fn()}
          walletCurrency={WalletCurrency.Btc}
          convertMoneyAmount={flooringConvert}
          maxAmountButton={{ compute }}
        />
      </ThemeProvider>,
    )

    fireEvent.press(getByTestId("Max Amount Chip"))

    // The pad switches to wallet units and shows the true max — not an
    // empty $0 amount under a solid chip.
    await waitFor(() => {
      expect(getByText(/5 SAT/)).toBeTruthy()
    })
    expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    )
    expect(getByTestId("Max Amount Note").props.children).toBe("Test fee note")
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

  it("shows a computing state while the fee estimate is in flight", async () => {
    let resolveCompute!: (result: { amount: typeof maxSats; note?: string }) => void
    const compute = jest.fn(
      () =>
        new Promise<{ amount: typeof maxSats; note?: string }>((resolve) => {
          resolveCompute = resolve
        }),
    )
    const { getByTestId } = renderScreen({ compute })

    fireEvent.press(getByTestId("Max Amount Chip"))

    await waitFor(() => {
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ busy: true }),
      )
    })

    await act(async () => {
      resolveCompute({ amount: maxSats, note: "Test fee note" })
    })

    await waitFor(() => {
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ busy: false, selected: true }),
      )
    })
  })

  it("drops the in-flight computation when the user types before it resolves", async () => {
    let resolveCompute!: (result: { amount: typeof maxSats; note?: string }) => void
    const compute = jest.fn(
      () =>
        new Promise<{ amount: typeof maxSats; note?: string }>((resolve) => {
          resolveCompute = resolve
        }),
    )
    const { getByTestId, getByText, queryByTestId, queryByText } = renderScreen({
      compute,
    })

    fireEvent.press(getByTestId("Max Amount Chip"))
    // The user types while the fee fetch is still running…
    fireEvent.press(getByTestId("key-1"))

    // …so the late resolve must not overwrite their amount.
    await act(async () => {
      resolveCompute({ amount: maxSats, note: "Test fee note" })
    })

    expect(getByText("$1")).toBeTruthy()
    expect(queryByText("$20.00")).toBeNull()
    expect(queryByTestId("Max Amount Note")).toBeNull()
    expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    )
  })

  it("drops the in-flight computation when the user toggles currency before it resolves", async () => {
    let resolveCompute!: (result: { amount: typeof maxSats; note?: string }) => void
    const compute = jest.fn(
      () =>
        new Promise<{ amount: typeof maxSats; note?: string }>((resolve) => {
          resolveCompute = resolve
        }),
    )
    const { getByTestId, getByText, queryByTestId, queryByText } = renderScreen({
      compute,
    })

    fireEvent.press(getByTestId("Max Amount Chip"))
    // The user toggles the entry currency mid-flight (secondary row press).
    fireEvent.press(getByText(/0 SAT/))

    await act(async () => {
      resolveCompute({ amount: maxSats, note: "Test fee note" })
    })

    // The stale resolve must neither fill the max nor revert the toggle.
    expect(queryByText(/1,000/)).toBeNull()
    expect(queryByTestId("Max Amount Note")).toBeNull()
    expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    )
  })

  // Set Amount closes the modal but the component stays mounted; reopening
  // feeds the committed amount back down as a fresh initialAmount. Both the
  // applied-MAX chip state and any still-in-flight MAX computation refer to
  // the pre-commit amount and must be discarded.
  describe("initialAmount reset (commit closed and reopened the modal)", () => {
    const screenWithInitialAmount = (
      maxAmountButton: MaxAmountButton,
      initialAmount?: MoneyAmount<WalletOrDisplayCurrency>,
    ) => (
      <ThemeProvider theme={createTheme({})}>
        <AmountInputScreen
          goBack={jest.fn()}
          setAmount={jest.fn()}
          initialAmount={initialAmount}
          walletCurrency={WalletCurrency.Btc}
          convertMoneyAmount={convertMoneyAmount}
          maxAmountButton={maxAmountButton}
        />
      </ThemeProvider>
    )

    const committedAmount: MoneyAmount<WalletOrDisplayCurrency> = {
      amount: 500,
      currency: "DisplayCurrency",
      currencyCode: "USD",
    }

    it("clears the applied MAX chip and note when a new initial amount arrives", async () => {
      const maxAmountButton: MaxAmountButton = {
        compute: jest.fn(async () => ({ amount: maxSats, note: "Test fee note" })),
      }
      const { getByTestId, getByText, queryByTestId, rerender } = render(
        screenWithInitialAmount(maxAmountButton),
      )

      fireEvent.press(getByTestId("Max Amount Chip"))
      await waitFor(() => {
        expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
          expect.objectContaining({ selected: true }),
        )
      })

      // The user commits a different amount; the pad reopens with it.
      rerender(screenWithInitialAmount(maxAmountButton, committedAmount))

      // The pad shows the committed amount — the chip must not stay solid
      // asserting it is the computed max, and the stale fee note must go.
      await waitFor(() => {
        expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
          expect.objectContaining({ selected: false }),
        )
      })
      expect(getByText("$5.00")).toBeTruthy()
      expect(queryByTestId("Max Amount Note")).toBeNull()
    })

    it("drops a MAX resolve that lands after the amount was committed", async () => {
      let resolveCompute!: (result: { amount: typeof maxSats; note?: string }) => void
      const maxAmountButton: MaxAmountButton = {
        compute: jest.fn(
          () =>
            new Promise<{ amount: typeof maxSats; note?: string }>((resolve) => {
              resolveCompute = resolve
            }),
        ),
      }
      const { getByTestId, getByText, queryByTestId, queryByText, rerender } = render(
        screenWithInitialAmount(maxAmountButton),
      )

      fireEvent.press(getByTestId("Max Amount Chip"))
      // The user taps Set Amount while the fee fetch is still in flight —
      // the committed amount comes back down as a new initialAmount…
      rerender(screenWithInitialAmount(maxAmountButton, committedAmount))

      // …so the late resolve must neither fill the pad nor light the chip.
      await act(async () => {
        resolveCompute({ amount: maxSats, note: "Test fee note" })
      })

      expect(getByText("$5.00")).toBeTruthy()
      expect(queryByText("$20.00")).toBeNull()
      expect(queryByTestId("Max Amount Note")).toBeNull()
      expect(getByTestId("Max Amount Chip").props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false }),
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
