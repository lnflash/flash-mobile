/**
 * CashoutDetails — the account chosen in "Withdraw to" is the account paid.
 *
 * Contract under test:
 *  - With no selection, requestCashout goes to the SERVER default account (no
 *    AsyncStorage default any more).
 *  - A selection made in the picker flows into requestCashout.bankAccountId
 *    and on to the confirmation screen.
 *  - The JMD estimate follows the picked account's currency.
 *  - Bridge: default from `isDefault`, selection wins, label follows.
 */

import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}))
jest.mock("@app/components/screen", () => {
  const { View } = jest.requireActual("react-native")
  return { Screen: View }
})
// Stubs: "amount" sets a valid $10.00, and the Withdraw-to card exposes its
// picker callbacks as buttons (the card itself is covered by its own spec).
jest.mock("@app/components/amount-input", () => {
  const ReactActual = jest.requireActual("react")
  const { Pressable, Text } = jest.requireActual("react-native")
  return {
    AmountInput: ({ setAmount }: { setAmount: (amount: unknown) => void }) =>
      ReactActual.createElement(
        Pressable,
        {
          onPress: () =>
            setAmount({ amount: 1000, currency: "USD", currencyCode: "USD" }),
        },
        ReactActual.createElement(Text, null, "set-amount"),
      ),
  }
})
const mockWithdrawToProps = jest.fn()
jest.mock("@app/components/topup-cashout-flow", () => {
  const ReactActual = jest.requireActual("react")
  const { Pressable, Text } = jest.requireActual("react-native")
  type Props = {
    onSelectAccount: (id: string) => void
    onManageAccounts: () => void
  }
  return {
    CashoutFromWallet: () => null,
    CashoutPercentage: () => null,
    CashoutWithdrawTo: (props: Props) => {
      mockWithdrawToProps(props)
      return ReactActual.createElement(
        ReactActual.Fragment,
        null,
        ...["us-1", "jm-1", "ext-1"].map((id) =>
          ReactActual.createElement(
            Pressable,
            { key: id, onPress: () => props.onSelectAccount(id) },
            ReactActual.createElement(Text, null, `select-${id}`),
          ),
        ),
        ReactActual.createElement(
          Pressable,
          { onPress: props.onManageAccounts },
          ReactActual.createElement(Text, null, "manage"),
        ),
      )
    },
  }
})
jest.mock("@app/components/buttons", () => {
  const ReactActual = jest.requireActual("react")
  const { Pressable, Text } = jest.requireActual("react-native")
  return {
    PrimaryBtn: ({
      label,
      disabled,
      onPress,
    }: {
      label: string
      disabled?: boolean
      onPress: () => void
    }) =>
      ReactActual.createElement(
        Pressable,
        { onPress: disabled ? undefined : onPress },
        ReactActual.createElement(Text, null, label),
      ),
  }
})
jest.mock("@app/hooks", () => ({
  useActivityIndicator: () => ({ toggleActivityIndicator: jest.fn() }),
  useDisplayCurrency: () => ({
    zeroDisplayAmount: { amount: 0, currency: "DisplayCurrency", currencyCode: "USD" },
  }),
  usePriceConversion: () => ({
    convertMoneyAmount: (amount: { amount: number }) => ({
      amount: amount.amount,
      currency: "USD",
      currencyCode: "USD",
    }),
  }),
}))
jest.mock("@app/graphql/wallets-utils", () => ({
  getCashWallet: () => ({ id: "wallet-usd", balance: 50_000 }),
}))

const mockRequestCashout = jest.fn()
const mockBridgeRequestWithdrawal = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  WalletCurrency: { Usd: "USD", Btc: "BTC" },
  useRequestCashoutMutation: () => [mockRequestCashout],
  useBridgeRequestWithdrawalMutation: () => [mockBridgeRequestWithdrawal],
  useBankAccountsQuery: () => ({
    loading: false,
    data: {
      me: {
        bankAccounts: [
          { id: "us-1", currency: "USD", isDefault: false },
          { id: "jm-1", currency: "JMD", isDefault: false },
          { id: "jm-2", currency: "JMD", isDefault: true },
        ],
      },
    },
  }),
  useBridgeExternalAccountsQuery: () => ({
    loading: false,
    data: {
      bridgeExternalAccounts: [
        { id: "ext-1", bankName: "Chase", accountNumberLast4: "1111", isDefault: false },
        { id: "ext-2", bankName: "Wells", accountNumberLast4: "2222", isDefault: true },
      ],
    },
  }),
  useCashoutScreenQuery: () => ({ data: {} }),
  useCashoutRateQuery: () => ({
    data: { cashoutRate: { exchangeRate: 15_000, feeBasisPoints: 0 } },
  }),
}))

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import CashoutDetails from "@app/screens/topup-cashout-flow/CashoutDetails"

loadLocale("en")
const en = i18nObject("en")

const navigation = { navigate: jest.fn() }
const offer = { offerId: "offer-1" }

const renderDetails = (type: "local" | "bridge") => {
  const props = {
    navigation,
    route: { key: "CashoutDetails", name: "CashoutDetails", params: { type } },
  } as unknown as React.ComponentProps<typeof CashoutDetails>
  return render(
    <ThemeProvider theme={createTheme({})}>
      <CashoutDetails {...props} />
    </ThemeProvider>,
  )
}

const pressNext = async (screen: ReturnType<typeof renderDetails>) => {
  fireEvent.press(screen.getByText("set-amount"))
  await act(async () => {
    fireEvent.press(screen.getByText(en.common.next()))
  })
}

const jmdEstimate = en.Cashout.estimatedReceive({ amount: "J$1500.00" })

beforeEach(() => {
  jest.clearAllMocks()
  mockRequestCashout.mockResolvedValue({
    data: { requestCashout: { offer, errors: [] } },
  })
  mockBridgeRequestWithdrawal.mockResolvedValue({
    data: { bridgeRequestWithdrawal: { errors: [], withdrawal: { id: "wd-1" } } },
  })
})

describe("CashoutDetails — local", () => {
  it("pays the server default account when nothing is picked", async () => {
    const screen = renderDetails("local")
    await pressNext(screen)

    expect(mockRequestCashout).toHaveBeenCalledWith({
      variables: {
        input: { bankAccountId: "jm-2", walletId: "wallet-usd", amount: 1000 },
      },
    })
    expect(navigation.navigate).toHaveBeenCalledWith("CashoutConfirmation", {
      offer,
      bankAccountId: "jm-2",
    })
    // Default is JMD → the JMD estimate shows.
    expect(screen.getByText(jmdEstimate)).toBeTruthy()
  })

  it("pays the picked account and carries it to the confirmation", async () => {
    const screen = renderDetails("local")
    fireEvent.press(screen.getByText("select-jm-1"))
    await pressNext(screen)

    expect(mockRequestCashout).toHaveBeenCalledWith({
      variables: {
        input: { bankAccountId: "jm-1", walletId: "wallet-usd", amount: 1000 },
      },
    })
    expect(navigation.navigate).toHaveBeenCalledWith("CashoutConfirmation", {
      offer,
      bankAccountId: "jm-1",
    })
    expect(mockWithdrawToProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: "local", selectedAccountId: "jm-1" }),
    )
  })

  it("drops the JMD estimate when a USD account is picked", async () => {
    const screen = renderDetails("local")
    fireEvent.press(screen.getByText("set-amount"))
    expect(screen.getByText(jmdEstimate)).toBeTruthy()

    fireEvent.press(screen.getByText("select-us-1"))

    expect(screen.queryByText(jmdEstimate)).toBeNull()
    await pressNext(screen)
    expect(mockRequestCashout).toHaveBeenCalledWith({
      variables: {
        input: { bankAccountId: "us-1", walletId: "wallet-usd", amount: 1000 },
      },
    })
  })

  it("links to Manage bank accounts", () => {
    const screen = renderDetails("local")
    fireEvent.press(screen.getByText("manage"))

    expect(navigation.navigate).toHaveBeenCalledWith("BankAccounts")
  })
})

describe("CashoutDetails — bridge", () => {
  it("withdraws to the server default external account", async () => {
    const screen = renderDetails("bridge")
    await pressNext(screen)

    expect(mockBridgeRequestWithdrawal).toHaveBeenCalledWith({
      variables: { input: { externalAccountId: "ext-2", amount: "10.00" } },
    })
    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith("CashoutConfirmation", {
        bridgeWithdrawalId: "wd-1",
        bridgeAccountLabel: "Wells ••2222",
      }),
    )
    expect(mockRequestCashout).not.toHaveBeenCalled()
  })

  it("withdraws to the picked external account", async () => {
    const screen = renderDetails("bridge")
    fireEvent.press(screen.getByText("select-ext-1"))
    await pressNext(screen)

    expect(mockBridgeRequestWithdrawal).toHaveBeenCalledWith({
      variables: { input: { externalAccountId: "ext-1", amount: "10.00" } },
    })
    expect(navigation.navigate).toHaveBeenCalledWith("CashoutConfirmation", {
      bridgeWithdrawalId: "wd-1",
      bridgeAccountLabel: "Chase ••1111",
    })
  })
})
