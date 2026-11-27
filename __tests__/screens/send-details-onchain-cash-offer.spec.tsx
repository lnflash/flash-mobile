// "Pay from Cash Account" on the Bitcoin Account onchain shortfall, for a
// request that fixes its bitcoin amount (a merchant invoice): offered when the
// Cash Account can pay it, and it pays the request's own sats. The mocks are
// those of send-details-onchain-fees.spec.tsx.
import React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { WalletCurrency } from "@app/graphql/generated"
import { toBtcMoneyAmount } from "@app/types/amounts"
import type {
  ConvertMoneyAmount,
  PaymentDetail,
} from "@app/screens/send-bitcoin-screen/payment-details"
import { createAmountOnchainPaymentDetails } from "@app/screens/send-bitcoin-screen/payment-details/onchain"
import { fetchBreezOnchainFees } from "@app/utils/breez-sdk"
import SendBitcoinDetailsScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-details-screen"

type MoneyLike = { amount: number; currency: string; currencyCode: string }

// Ten sats per cent; the display currency is in cents, like USD.
const mockConvert = (money: MoneyLike, currency: string): MoneyLike => {
  if (money.currency === currency) return money
  if (currency === WalletCurrency.Btc) {
    return { amount: Math.round(money.amount * 10), currency, currencyCode: "BTC" }
  }
  const cents = money.currency === WalletCurrency.Btc ? money.amount / 10 : money.amount
  return { amount: cents, currency, currencyCode: "USD" }
}

let mockBtcBalance = 7_000
let mockUsdBalance = 100_000

jest.mock("@app/hooks", () => ({
  useActivityIndicator: () => ({ toggleActivityIndicator: jest.fn() }),
  useBreez: () => ({ btcWallet: { balance: mockBtcBalance } }),
  useFormatSats: () => (sats: number) => `${sats} sats`,
  useIbexFee: () => async () => undefined,
  usePriceConversion: () => ({ convertMoneyAmount: mockConvert }),
}))
jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    zeroDisplayAmount: { amount: 0, currency: "DisplayCurrency", currencyCode: "USD" },
    formatDisplayAndWalletAmount: ({ walletAmount }: { walletAmount: MoneyLike }) =>
      `${walletAmount.amount} ${walletAmount.currency}`,
    moneyAmountToDisplayCurrencyString: () => "",
  }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("@app/graphql/level-context", () => ({
  useLevel: () => ({ currentLevel: "ONE" }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => true }))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useSendBitcoinDetailsScreenQuery: () => ({
    data: {
      me: {
        defaultAccount: {
          wallets: [
            { id: "cash-wallet", walletCurrency: "USD", balance: mockUsdBalance },
          ],
        },
      },
    },
  }),
  useSendBitcoinWithdrawalLimitsQuery: () => ({ data: undefined }),
  useSendBitcoinInternalLimitsQuery: () => ({ data: undefined }),
}))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    persistentState: { defaultWallet: { id: "btc-wallet", walletCurrency: "BTC" } },
  }),
}))

let mockAmountNote: {
  paymentDetail: PaymentDetail<WalletCurrency>
  setPaymentDetail: (pd: PaymentDetail<WalletCurrency>) => void
}
jest.mock("@app/components/send-flow", () => ({
  ...jest.requireActual("@app/components/send-flow"),
  ChooseWallet: () => null,
  DetailDestination: () => null,
  DetailAmountNote: (props: typeof mockAmountNote) => {
    mockAmountNote = props
    return null
  },
}))
jest.mock("@app/screens/send-bitcoin-screen/send-bitcoin-details-extra-info", () => ({
  SendBitcoinDetailsExtraInfo: ({ errorMessage }: { errorMessage?: string }) => {
    const { Text } = jest.requireActual("react-native")
    return errorMessage ? <Text testID="error">{errorMessage}</Text> : null
  },
}))
jest.mock("@app/components/screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = jest.requireActual("react-native")
    return <View>{children}</View>
  },
}))
jest.mock("@app/components/buttons", () => ({
  PrimaryBtn: ({ onPress, disabled }: { onPress?: () => void; disabled?: boolean }) => {
    const { Text, TouchableOpacity } = jest.requireActual("react-native")
    return (
      <TouchableOpacity testID="next" disabled={disabled} onPress={onPress}>
        <Text>{disabled ? "next-disabled" : "next-enabled"}</Text>
      </TouchableOpacity>
    )
  },
}))

const ADDRESS = "bc1q-merchant"
const FEES = { fast: 1_230, medium: 810, slow: 420 }

const mockedOnchainFees = fetchBreezOnchainFees as jest.Mock

// The sats the merchant's request fixes.
let requestSats = 6_800

const paymentDestination = {
  valid: true,
  createPaymentDetail: ({
    convertMoneyAmount,
    sendingWalletDescriptor,
  }: {
    convertMoneyAmount: ConvertMoneyAmount
    sendingWalletDescriptor: { id: string; currency: WalletCurrency }
  }) =>
    createAmountOnchainPaymentDetails({
      address: ADDRESS,
      destinationSpecifiedAmount: toBtcMoneyAmount(requestSats),
      convertMoneyAmount,
      sendingWalletDescriptor,
    }),
}

type ScreenProps = React.ComponentProps<typeof SendBitcoinDetailsScreen>

const renderScreen = () => {
  const route = {
    key: "k",
    name: "sendBitcoinDetails",
    params: { paymentDestination },
  } as unknown as ScreenProps["route"]
  return render(
    <ThemeProvider theme={createTheme({})}>
      <SendBitcoinDetailsScreen
        route={route}
        navigation={{ navigate: jest.fn() } as unknown as ScreenProps["navigation"]}
      />
    </ThemeProvider>,
  )
}

// Let the debounce elapse, then let the quote's promise settle.
const settleQuote = async () => {
  await act(async () => {
    jest.advanceTimersByTime(400)
  })
  await act(async () => {})
}

describe("send details: Pay from Cash Account for a request that fixes its sats", () => {
  beforeAll(() => loadLocale("en"))

  beforeEach(() => {
    jest.useFakeTimers()
    mockBtcBalance = 7_000
    mockUsdBalance = 100_000
    requestSats = 6_800
    mockedOnchainFees.mockReset()
    mockedOnchainFees.mockResolvedValue({ fees: FEES, err: null })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("offers Pay from Cash Account when no speed fits, and no Send max for an amount it cannot change", async () => {
    const { getByTestId, getByText, queryByTestId } = renderScreen()
    await settleQuote()

    expect(mockedOnchainFees).toHaveBeenCalledWith({
      paymentRequest: ADDRESS,
      amountSats: 6_800,
    })
    // 6,800 + 420 is over 7,000: no speed fits.
    expect(getByTestId("onchain-fee-shortfall").props.children).toBe(
      "The network fee is 420 BTC. Your balance is too low for an on-chain send from this account.",
    )
    expect(queryByTestId("onchain-send-max")).toBeNull()
    expect(getByText("Pay from Cash Account")).toBeTruthy()
    expect(getByText("next-disabled")).toBeTruthy()
  })

  it("Pay from Cash Account pays the request's own sats from the Cash Account", async () => {
    const { getByText, queryByTestId } = renderScreen()
    await settleQuote()

    fireEvent.press(getByText("Pay from Cash Account"))

    const detail = mockAmountNote.paymentDetail
    expect(detail.sendingWalletDescriptor).toEqual({ id: "cash-wallet", currency: "USD" })
    expect(detail.destinationSpecifiedAmount).toEqual(toBtcMoneyAmount(6_800))
    expect(detail.settlementAmount.amount).toBe(680)
    expect(detail.canSendPayment).toBe(true)
    expect(queryByTestId("onchain-fee-shortfall")).toBeNull()
  })

  it("does not offer the Cash Account when its balance cannot cover the request", async () => {
    mockUsdBalance = 679
    const { getByTestId, queryByText } = renderScreen()
    await settleQuote()

    expect(getByTestId("onchain-fee-shortfall")).toBeTruthy()
    expect(queryByText("Pay from Cash Account")).toBeNull()
  })

  it("says nothing of the Cash Account for a request under 5,500 sats: the minimum comes first", async () => {
    requestSats = 5_499
    const { queryByTestId, queryByText } = renderScreen()
    await settleQuote()

    expect(mockedOnchainFees).not.toHaveBeenCalled()
    expect(queryByTestId("onchain-fee-shortfall")).toBeNull()
    expect(queryByText("Pay from Cash Account")).toBeNull()
  })
})
