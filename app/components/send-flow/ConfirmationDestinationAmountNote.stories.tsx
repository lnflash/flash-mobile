import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import * as IntraledgerDetails from "../../screens/send-bitcoin-screen/payment-details/intraledger"
import { WalletCurrency } from "../../graphql/generated"
import { DisplayCurrency, toBtcMoneyAmount, toUsdMoneyAmount } from "../../types/amounts"
import { ConfirmationDestinationAmountNote } from "./ConfirmationDestinationAmountNote"

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
  title: "Send Flow/ConfirmationDestinationAmountNote",
  component: ConfirmationDestinationAmountNote,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof ConfirmationDestinationAmountNote>

export const Intraledger = () => <ConfirmationDestinationAmountNote paymentDetail={mockPaymentDetail} />

export const WithInvoiceAmount = () => (
  <ConfirmationDestinationAmountNote
    paymentDetail={mockPaymentDetail}
    invoiceAmount={toBtcMoneyAmount(5000)}
  />
)
