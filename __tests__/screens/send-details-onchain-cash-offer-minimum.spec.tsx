// Contract test for work order 07 (flash-onchain-send). Written by Claude; the
// worker makes it pass without changing it.
//
// "Pay from Cash Account" is offered only where the Cash screen it leads to
// accepts the amount. For an amount the user typed, that screen holds the Cash
// Account to what 5,500 sats are worth in cents, rounded up
// (cashOnchainMinimumCents); a request that fixes its sats is held to the sats.
// The price here, 0.0625 cents a sat, makes 5,500 sats 343.75 cents: the floor
// is 344 cents, so 5,500 typed sats are refused and 5,504 (344 cents) are not.
import React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { WalletCurrency } from "@app/graphql/generated"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import {
  AmountInvalidReason,
  ConvertMoneyAmount,
  isValidAmount,
  PaymentDetail,
} from "@app/screens/send-bitcoin-screen/payment-details"
import { createNoAmountOnchainPaymentDetails } from "@app/screens/send-bitcoin-screen/payment-details/onchain"
import {
  cashAccountCanPay,
  ONCHAIN_MIN_SEND_SATS,
} from "@app/screens/send-bitcoin-screen/onchain-speed-options"
import { fetchBreezOnchainFees } from "@app/utils/breez-sdk"
import SendBitcoinDetailsScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-details-screen"

type MoneyLike = { amount: number; currency: string; currencyCode: string }

// 0.0625 cents a sat (US$62,500 a bitcoin); the display currency is in cents,
// like USD.
const mockConvert = (money: MoneyLike, currency: string): MoneyLike => {
  if (money.currency === currency) return money
  if (currency === WalletCurrency.Btc) {
    return { amount: Math.round(money.amount / 0.0625), currency, currencyCode: "BTC" }
  }
  const cents =
    money.currency === WalletCurrency.Btc ? money.amount * 0.0625 : money.amount
  return { amount: cents, currency, currencyCode: "USD" }
}

let mockBtcBalance = 5_600
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

const ADDRESS = "bc1q-typed-amount"
const FEES = { fast: 1_230, medium: 810, slow: 420 }

const mockedOnchainFees = fetchBreezOnchainFees as jest.Mock

const paymentDestination = {
  valid: true,
  createPaymentDetail: ({
    convertMoneyAmount,
    sendingWalletDescriptor,
  }: {
    convertMoneyAmount: ConvertMoneyAmount
    sendingWalletDescriptor: { id: string; currency: WalletCurrency }
  }) =>
    createNoAmountOnchainPaymentDetails({
      address: ADDRESS,
      unitOfAccountAmount: toBtcMoneyAmount(0),
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

// The user types an amount in sats on the Bitcoin Account.
const typeAmount = (sats: number) =>
  act(() => {
    const { paymentDetail, setPaymentDetail } = mockAmountNote
    if (paymentDetail.setAmount) {
      setPaymentDetail(paymentDetail.setAmount(toBtcMoneyAmount(sats)))
    }
  })

// Let the debounce elapse, then let the quote's promise settle.
const settleQuote = async () => {
  await act(async () => {
    jest.advanceTimersByTime(400)
  })
  await act(async () => {})
}

describe("cashAccountCanPay at the on-chain floor", () => {
  const typed = { balanceCents: 10_000, hasFixedSats: false, minimumCents: 344 }

  it("holds an amount the user typed to the Cash Account's floor in cents", () => {
    // 5,500 sats are 343.75 cents: under the 344-cent floor, though not under 5,500 sats.
    expect(cashAccountCanPay({ ...typed, amountSats: 5_500, amountCents: 343.75 })).toBe(
      false,
    )
    expect(cashAccountCanPay({ ...typed, amountSats: 5_504, amountCents: 344 })).toBe(
      true,
    )
  })

  it("does not offer it when the floor cannot be priced", () => {
    expect(
      cashAccountCanPay({
        ...typed,
        amountSats: 6_000,
        amountCents: 375,
        minimumCents: NaN,
      }),
    ).toBe(false)
  })

  it("holds a request that fixes its sats to the sats, whatever its cents", () => {
    const fixed = { balanceCents: 10_000, hasFixedSats: true, minimumCents: 344 }
    expect(
      cashAccountCanPay({
        ...fixed,
        amountSats: ONCHAIN_MIN_SEND_SATS,
        amountCents: 343.75,
      }),
    ).toBe(true)
    expect(
      cashAccountCanPay({
        ...fixed,
        amountSats: ONCHAIN_MIN_SEND_SATS - 1,
        amountCents: 400,
      }),
    ).toBe(false)
  })

  it("agrees with the Cash screen it leads to on both sides of the floor", () => {
    const cash = (sats: number) =>
      createNoAmountOnchainPaymentDetails<WalletCurrency>({
        address: ADDRESS,
        unitOfAccountAmount: toBtcMoneyAmount(sats),
        convertMoneyAmount: mockConvert as ConvertMoneyAmount,
        sendingWalletDescriptor: { id: "cash-wallet", currency: WalletCurrency.Usd },
      })
    const balances = {
      usdWalletAmount: toUsdMoneyAmount(10_000),
      btcWalletAmount: toBtcMoneyAmount(0),
    }
    expect(isValidAmount({ ...balances, paymentDetail: cash(5_500) })).toMatchObject({
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainLimit,
    })
    expect(isValidAmount({ ...balances, paymentDetail: cash(5_504) })).toEqual({
      validAmount: true,
    })
  })
})

describe("send details: Pay from Cash Account for an amount the user typed", () => {
  beforeAll(() => loadLocale("en"))

  beforeEach(() => {
    jest.useFakeTimers()
    mockBtcBalance = 5_600
    mockUsdBalance = 100_000
    mockedOnchainFees.mockReset()
    mockedOnchainFees.mockResolvedValue({ fees: FEES, err: null })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("does not offer it for 5,500 sats, which the Cash Account would refuse as 343.75 cents", async () => {
    const { getByTestId, queryByText } = renderScreen()
    typeAmount(5_500)
    await settleQuote()

    // 5,500 + 420 is over 5,600: no speed fits.
    expect(getByTestId("onchain-fee-shortfall")).toBeTruthy()
    expect(queryByText("Pay from Cash Account")).toBeNull()
  })

  it("offers it for 5,504 sats, 344 cents, and the Cash Account takes them", async () => {
    const { getByText, queryByTestId } = renderScreen()
    typeAmount(5_504)
    await settleQuote()

    fireEvent.press(getByText("Pay from Cash Account"))

    const detail = mockAmountNote.paymentDetail
    expect(detail.sendingWalletDescriptor).toEqual({ id: "cash-wallet", currency: "USD" })
    expect(detail.settlementAmount.amount).toBe(344)
    expect(queryByTestId("onchain-fee-shortfall")).toBeNull()
  })
})
