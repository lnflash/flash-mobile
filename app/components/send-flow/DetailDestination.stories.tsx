import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import * as IntraledgerDetails from "../../screens/send-bitcoin-screen/payment-details/intraledger"
import { WalletCurrency } from "../../graphql/generated"
import { DisplayCurrency, toUsdMoneyAmount } from "../../types/amounts"
import { DetailDestination } from "./DetailDestination"

const mockConvertMoneyAmount = (amount: any, currency: any) => ({
  amount: amount.amount, currency,
  currencyCode: currency === DisplayCurrency ? "USD" : currency,
})

const mockPaymentDetail = IntraledgerDetails.createIntraledgerPaymentDetails({
  handle: "test",
  recipientWalletId: "recipient-wallet-id",
  convertMoneyAmount: mockConvertMoneyAmount,
  sendingWalletDescriptor: { currency: WalletCurrency.Btc, id: "f79792e3" },
  unitOfAccountAmount: toUsdMoneyAmount(100),
})

export default {
  title: "Send Flow/DetailDestination",
  component: DetailDestination,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof DetailDestination>

export const UsernameDestination = () => (
  <DetailDestination paymentDetail={mockPaymentDetail} />
)

export const WithFlashAddress = () => (
  <DetailDestination paymentDetail={mockPaymentDetail} flashUserAddress="test@flashapp.me" />
)
