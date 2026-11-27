// Contract test for work order 08 (flash-onchain-send). Written by Claude; the
// worker makes it pass without changing it.
//
// A Cash Account paying an on-chain request that fixes its sats is debited the
// sats at the mid rate plus the server's 0.5% margin, rounded up (order 06,
// the payment detail's settlementAmount). The details and confirm screens show
// that debit, still marked approximate, in place of the sats' mid-rate value.
// Every other payment shows its amount as before.
import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { WalletCurrency } from "@app/graphql/generated"
import {
  createAmountLightningPaymentDetails,
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
import ConfirmationDestinationAmountNote from "@app/components/send-flow/ConfirmationDestinationAmountNote"
import DetailAmountNote from "@app/components/send-flow/DetailAmountNote"

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
  useBreez: () => ({ btcWallet: { balance: 0 } }),
  usePriceConversion: () => ({ convertMoneyAmount: mockConvert }),
  useFormatSats: () => (sats: number) => `${sats} sats`,
}))
jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => false }))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useCurrencyListQuery: () => ({ data: undefined }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("@app/components/note-input", () => ({ NoteInput: () => null }))

const ADDRESS = "bc1q-debit-recipient"

const fixedRequest = (currency: WalletCurrency, sats = 50_000) =>
  createAmountOnchainPaymentDetails({
    address: ADDRESS,
    destinationSpecifiedAmount: toBtcMoneyAmount(sats),
    convertMoneyAmount: mockConvert,
    sendingWalletDescriptor: { id: `${currency}-wallet`, currency },
  })

const texts = (paymentDetail: PaymentDetail<WalletCurrency>) => {
  const theme = createTheme({})
  const confirm = render(
    <ThemeProvider theme={theme}>
      <ConfirmationDestinationAmountNote paymentDetail={paymentDetail} />
    </ThemeProvider>,
  )
  const detail = render(
    <ThemeProvider theme={theme}>
      <DetailAmountNote
        usdWallet={undefined}
        paymentDetail={paymentDetail}
        setPaymentDetail={jest.fn()}
        setAsyncErrorMessage={jest.fn()}
      />
    </ThemeProvider>,
  )
  const read = (r: ReturnType<typeof render>) =>
    r.queryAllByText(/./).map((node) => node.props.children)
  return { confirm: read(confirm), detail: read(detail) }
}

beforeAll(() => loadLocale("en"))

describe("the amount a Cash Account pays for an on-chain request that fixes its sats", () => {
  it("shows the USD debit, the margin included, still approximate", () => {
    // 50,000 sats are 3,150 cents at the mid rate; the server debits 3,166.
    expect(texts(fixedRequest(WalletCurrency.Usd))).toEqual({
      confirm: ["Amount", "~ $31.66"],
      detail: ["Amount", "~ $31.66", "Note or label"],
    })
  })

  it("shows the USDT debit beside its display value", () => {
    expect(texts(fixedRequest(WalletCurrency.Usdt))).toEqual({
      confirm: ["Amount", "$31.66", "~ $31.66 USD"],
      detail: ["Amount", "$31.66", "~ $31.66 USD", "Note or label"],
    })
  })

  it("rounds the debit up to a whole cent", () => {
    // 6,800 sats are 428.4 cents; with the margin 430.542, debited as 431.
    expect(texts(fixedRequest(WalletCurrency.Usd, 6_800)).confirm).toEqual([
      "Amount",
      "~ $4.31",
    ])
  })
})

describe("every other payment shows its amount as before", () => {
  it("the Bitcoin Account paying the same request: the sats and their value", () => {
    expect(texts(fixedRequest(WalletCurrency.Btc))).toEqual({
      confirm: ["Amount", "$31.50", "₿50,000"],
      detail: ["Amount", "$31.50", "₿50,000", "Note or label"],
    })
  })

  it("an on-chain amount typed in dollars from the Cash Account", () => {
    const typed = createNoAmountOnchainPaymentDetails<WalletCurrency>({
      address: ADDRESS,
      unitOfAccountAmount: { amount: 3_150, currency: "USD", currencyCode: "USD" },
      convertMoneyAmount: mockConvert,
      sendingWalletDescriptor: { id: "USD-wallet", currency: WalletCurrency.Usd },
    })
    expect(texts(typed).confirm).toEqual(["Amount", "$31.50"])
  })

  it("a Lightning invoice for a fixed number of sats from the Cash Account", () => {
    const invoice = createAmountLightningPaymentDetails<WalletCurrency>({
      paymentRequest: "lnbc500u1-debit-fixture",
      paymentRequestAmount: toBtcMoneyAmount(50_000),
      convertMoneyAmount: mockConvert,
      sendingWalletDescriptor: { id: "USD-wallet", currency: WalletCurrency.Usd },
    })
    expect(texts(invoice)).toEqual({
      confirm: ["Amount", "~ $31.50"],
      detail: ["Amount", "~ $31.50", "Note or label"],
    })
  })
})
