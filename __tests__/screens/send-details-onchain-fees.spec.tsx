// The Bitcoin Account onchain speed picker on the send details screen: each
// speed shows its fee, a speed the balance cannot cover cannot be picked, a
// speed that fits is pre-selected, and when none fits the screen names the fee
// and the way forward instead of failing on Next.
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
import { createNoAmountOnchainPaymentDetails } from "@app/screens/send-bitcoin-screen/payment-details/onchain"
import { fetchBreezFee, fetchBreezOnchainFees } from "@app/utils/breez-sdk"
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
    // The wallet side alone is enough to tell the amounts apart here.
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

// The amount field is driven from the test through the props the screen
// hands it; the wallet and destination rows play no part here.
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

const ADDRESS = "bc1q-recipient"
const FEES = { fast: 1_230, medium: 810, slow: 420 }

const mockedOnchainFees = fetchBreezOnchainFees as jest.Mock
const mockedFee = fetchBreezFee as jest.Mock

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
      convertMoneyAmount,
      sendingWalletDescriptor,
      unitOfAccountAmount: toBtcMoneyAmount(0),
    }),
}

type ScreenProps = React.ComponentProps<typeof SendBitcoinDetailsScreen>

const renderScreen = () => {
  const navigate = jest.fn()
  const route = {
    key: "k",
    name: "sendBitcoinDetails",
    params: { paymentDestination },
  } as unknown as ScreenProps["route"]
  const screen = render(
    <ThemeProvider theme={createTheme({})}>
      <SendBitcoinDetailsScreen
        route={route}
        navigation={{ navigate } as unknown as ScreenProps["navigation"]}
      />
    </ThemeProvider>,
  )
  return { ...screen, navigate }
}

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

describe("send details: Bitcoin Account onchain speeds", () => {
  beforeAll(() => loadLocale("en"))

  beforeEach(() => {
    jest.useFakeTimers()
    mockBtcBalance = 7_000
    mockUsdBalance = 100_000
    mockedOnchainFees.mockReset()
    mockedOnchainFees.mockResolvedValue({ fees: FEES, err: null })
    mockedFee.mockReset()
    mockedFee.mockResolvedValue({ fee: 0, err: null })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("shows each speed's fee, dims the one the balance cannot cover and pre-selects Medium", async () => {
    const { getByText, getByTestId, navigate } = renderScreen()
    await typeAmount(6_000)

    // Debounced: nothing is asked until the amount has been still a while.
    expect(mockedOnchainFees).not.toHaveBeenCalled()
    await settleQuote()
    expect(mockedOnchainFees).toHaveBeenCalledTimes(1)
    expect(mockedOnchainFees).toHaveBeenCalledWith({
      paymentRequest: ADDRESS,
      amountSats: 6_000,
    })

    expect(getByText("1230 BTC")).toBeTruthy()
    expect(getByText("810 BTC")).toBeTruthy()
    expect(getByText("420 BTC")).toBeTruthy()
    expect(getByText("next-enabled")).toBeTruthy()

    // 6,000 + 1,230 is over 7,000: Fast cannot be picked.
    expect(getByText("Fast")).toBeDisabled()
    expect(getByText("Medium")).not.toBeDisabled()
    expect(getByText("Slow")).not.toBeDisabled()
    fireEvent.press(getByText("Fast"))
    await act(async () => {
      fireEvent.press(getByTestId("next"))
    })
    expect(navigate).toHaveBeenCalledWith(
      "sendBitcoinConfirmation",
      expect.objectContaining({ selectedFeeType: "medium" }),
    )
  })

  it("asks once for the amount the user settled on and drops a late answer for an older one", async () => {
    let answerOld: (value: unknown) => void = () => {}
    mockedOnchainFees
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerOld = resolve
          }),
      )
      .mockResolvedValue({ fees: FEES, err: null })

    const { getByText, queryByTestId } = renderScreen()
    await typeAmount(5_600)
    await settleQuote()
    await typeAmount(6_000)
    await settleQuote()
    expect(mockedOnchainFees).toHaveBeenCalledTimes(2)
    expect(getByText("next-enabled")).toBeTruthy()

    // The 5,600-sat answer lands last and says nothing fits; it is ignored.
    await act(async () => {
      answerOld({ fees: { fast: 9_000, medium: 9_000, slow: 9_000 }, err: null })
    })
    expect(queryByTestId("onchain-fee-shortfall")).toBeNull()
    expect(getByText("810 BTC")).toBeTruthy()
  })

  it("when no speed fits, names the cheapest fee and the most that can be sent, and Send max fixes it", async () => {
    const { getByText, getByTestId, navigate } = renderScreen()
    await typeAmount(6_800)
    await settleQuote()

    expect(getByTestId("onchain-fee-shortfall").props.children).toBe(
      "The network fee is 420 BTC. You can send up to 6580 BTC from this account.",
    )
    expect(getByText("next-disabled")).toBeTruthy()
    expect(getByText("Pay from Cash Account")).toBeTruthy()

    fireEvent.press(getByText("Send 6580 BTC"))
    expect(mockAmountNote.paymentDetail.settlementAmount.amount).toBe(6_580)
    await settleQuote()

    // 6,580 + 420 is exactly the balance: Slow fits and is selected.
    expect(getByText("next-enabled")).toBeTruthy()
    await act(async () => {
      fireEvent.press(getByTestId("next"))
    })
    expect(navigate).toHaveBeenCalledWith(
      "sendBitcoinConfirmation",
      expect.objectContaining({ selectedFeeType: "slow" }),
    )
  })

  it("Pay from Cash Account switches the sending wallet and keeps the amount", async () => {
    const { getByText, queryByTestId } = renderScreen()
    await typeAmount(6_800)
    await settleQuote()

    fireEvent.press(getByText("Pay from Cash Account"))
    expect(mockAmountNote.paymentDetail.sendingWalletDescriptor).toEqual({
      id: "cash-wallet",
      currency: "USD",
    })
    expect(mockAmountNote.paymentDetail.settlementAmount.amount).toBe(680)
    expect(queryByTestId("onchain-fee-shortfall")).toBeNull()
  })

  it("does not offer the Cash Account when its balance cannot cover the amount", async () => {
    mockUsdBalance = 679
    const { queryByText, getByText } = renderScreen()
    await typeAmount(6_800)
    await settleQuote()

    expect(getByText("Send 6580 BTC")).toBeTruthy()
    expect(queryByText("Pay from Cash Account")).toBeNull()
  })

  it("moves a selection that stops fitting to the fastest speed that fits", async () => {
    mockBtcBalance = 10_000
    const { getByText, getByTestId, navigate } = renderScreen()
    await typeAmount(6_000)
    await settleQuote()

    fireEvent.press(getByText("Fast"))
    await typeAmount(8_900)
    await settleQuote()

    // 8,900 + 1,230 is over 10,000; 8,900 + 810 is not.
    await act(async () => {
      fireEvent.press(getByTestId("next"))
    })
    expect(navigate).toHaveBeenCalledWith(
      "sendBitcoinConfirmation",
      expect.objectContaining({ selectedFeeType: "medium" }),
    )
  })

  it("without a quote the picker looks as before, and Next names the fee when it does not fit", async () => {
    mockedOnchainFees.mockResolvedValue({
      fees: null,
      err: { kind: "network", message: "x" },
    })
    mockedFee.mockImplementation(async ({ selectedFeeType }) => ({
      fee: FEES[selectedFeeType as keyof typeof FEES],
      err: null,
    }))
    const { getByText, getByTestId, queryByText, queryByTestId, navigate } =
      renderScreen()
    await typeAmount(6_000)
    await settleQuote()

    expect(queryByText("810 BTC")).toBeNull()
    expect(queryByTestId("onchain-fee-shortfall")).toBeNull()
    // Nothing is pre-selected without a quote.
    expect(getByText("next-disabled")).toBeTruthy()

    fireEvent.press(getByText("Fast"))
    await act(async () => {
      fireEvent.press(getByTestId("next"))
    })
    expect(navigate).not.toHaveBeenCalled()
    expect(getByTestId("error").props.children).toBe(
      "This amount plus the 1230 BTC network fee is more than your balance of 7000 BTC.",
    )

    // Picking another speed clears the error so Next can try again.
    fireEvent.press(getByText("Slow"))
    expect(queryByTestId("error")).toBeNull()
    await act(async () => {
      fireEvent.press(getByTestId("next"))
    })
    expect(navigate).toHaveBeenCalledWith(
      "sendBitcoinConfirmation",
      expect.objectContaining({ selectedFeeType: "slow" }),
    )
  })
})
