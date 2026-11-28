// Contract test for work order 09 (flash-onchain-send). Written by Claude; the
// worker makes it pass without changing it.
//
// The success screen shows what the Cash Account was debited for an on-chain
// request that fixes its sats, as the confirm screen does since order 08: the
// sats at the mid rate plus the server's 0.5% margin, rounded up, still marked
// approximate. Every other payment's success screen is unchanged.
import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { WalletCurrency } from "@app/graphql/generated"
import {
  cashDebitForFixedSats,
  createAmountOnchainPaymentDetails,
  createNoAmountOnchainPaymentDetails,
  PaymentDetail,
} from "@app/screens/send-bitcoin-screen/payment-details"
import {
  createConvertMoneyAmount,
  PriceOfCurrencyInCurrency,
  priceOfCurrencyInCurrencyFor,
} from "@app/utils/price-conversion"
import { toBtcMoneyAmount } from "@app/types/amounts"
import SendBitcoinSuccessScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-success-screen"

// US$63,000 a bitcoin: 0.063 cents a sat, the display currency in US dollars.
const mockConvert = createConvertMoneyAmount({
  priceOfCurrencyInCurrency: priceOfCurrencyInCurrencyFor({
    btcSatPrice: { base: 63, offset: 3 },
    usdCentPrice: { base: 1, offset: 0 },
  }) as PriceOfCurrencyInCurrency,
  displayCurrency: "USD",
})

jest.mock("@app/hooks/use-price-conversion", () => ({
  usePriceConversion: () => ({
    convertMoneyAmount: mockConvert,
    displayCurrency: "USD",
    toDisplayMoneyAmount: (amount: number) => ({
      amount,
      currency: "DisplayCurrency",
      currencyCode: "USD",
    }),
  }),
}))
jest.mock("@app/hooks", () => ({
  ...jest.requireActual("@app/hooks/use-display-currency"),
  usePriceConversion: () => ({ convertMoneyAmount: mockConvert }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => false }))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useCurrencyListQuery: () => ({ data: undefined }),
  useFeedbackModalShownQuery: () => ({ data: { feedbackModalShown: true } }),
}))
jest.mock("@apollo/client", () => ({
  ...jest.requireActual("@apollo/client"),
  useApolloClient: () => ({}),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
// The reanimated entering animations need worklet setup jest does not have.
jest.mock("@app/components/success-animation", () => {
  const react = jest.requireActual("react")
  return {
    SuccessIconAnimation: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
    SuccessTextAnimation: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
  }
})
// The feedback modal posts through Apollo; it is not under test.
jest.mock("@app/screens/send-bitcoin-screen/suggestion-modal", () => ({
  SuggestionModal: () => null,
}))
jest.mock("@app/components/screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = jest.requireActual("react-native")
    return <View>{children}</View>
  },
}))

type ScreenProps = React.ComponentProps<typeof SendBitcoinSuccessScreen>

const ADDRESS = "bc1q-success-recipient"

const fixedRequest = (currency: WalletCurrency) =>
  createAmountOnchainPaymentDetails({
    address: ADDRESS,
    destinationSpecifiedAmount: toBtcMoneyAmount(50_000),
    convertMoneyAmount: mockConvert,
    sendingWalletDescriptor: { id: `${currency}-wallet`, currency },
  })

/** The success screen's texts after the confirm screen's navigate for this payment. */
const successTexts = (paymentDetail: PaymentDetail<WalletCurrency>) => {
  const route = {
    key: "k",
    name: "sendBitcoinSuccess",
    params: {
      walletCurrency: paymentDetail.sendingWalletDescriptor.currency,
      unitOfAccountAmount: paymentDetail.unitOfAccountAmount,
      cashDebitAmount: cashDebitForFixedSats(paymentDetail),
    },
  } as unknown as ScreenProps["route"]
  const screen = render(
    <ThemeProvider theme={createTheme({})}>
      <SendBitcoinSuccessScreen
        route={route}
        navigation={{ reset: jest.fn() } as unknown as ScreenProps["navigation"]}
      />
    </ThemeProvider>,
  )
  return screen
    .queryAllByText(/\$|₿/)
    .map((node) => node.props.children)
    .filter(Boolean)
}

beforeAll(() => loadLocale("en"))

describe("success screen: a Cash payment of an on-chain request that fixes its sats", () => {
  it("shows the USD debit, the margin included, still approximate", () => {
    // 50,000 sats are 3,150 cents at the mid rate; the server debits 3,166.
    expect(successTexts(fixedRequest(WalletCurrency.Usd))).toEqual(["~ $31.66"])
  })

  it("shows the USDT debit beside its display value", () => {
    expect(successTexts(fixedRequest(WalletCurrency.Usdt))).toEqual([
      "$31.66",
      "~ $31.66 USD",
    ])
  })
})

describe("success screen: every other payment as before", () => {
  it("the Bitcoin Account paying the same request", () => {
    expect(successTexts(fixedRequest(WalletCurrency.Btc))).toEqual(["$31.50", "₿50,000"])
  })

  it("an on-chain amount typed in dollars from the Cash Account", () => {
    const typed = createNoAmountOnchainPaymentDetails<WalletCurrency>({
      address: ADDRESS,
      unitOfAccountAmount: { amount: 3_150, currency: "USD", currencyCode: "USD" },
      convertMoneyAmount: mockConvert,
      sendingWalletDescriptor: { id: "USD-wallet", currency: WalletCurrency.Usd },
    })
    expect(successTexts(typed)).toEqual(["$31.50"])
  })
})
