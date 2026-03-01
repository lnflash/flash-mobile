import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import * as IntraledgerDetails from "../../screens/send-bitcoin-screen/payment-details/intraledger"
import { FeeType } from "../../screens/send-bitcoin-screen/use-fee"
import { WalletCurrency } from "../../graphql/generated"
import { DisplayCurrency, toBtcMoneyAmount, toUsdMoneyAmount } from "../../types/amounts"
import { ConfirmationWalletFee } from "./ConfirmationWalletFee"

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

const feeUnset: FeeType = { status: "unset" }
const feeLoading: FeeType = { status: "loading" }
const feeSet: FeeType = { status: "set", amount: toBtcMoneyAmount(21) }
const feeError: FeeType = { status: "error" }

export default {
  title: "Send Flow/ConfirmationWalletFee",
  component: ConfirmationWalletFee,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof ConfirmationWalletFee>

const baseProps = {
  paymentDetail: mockPaymentDetail,
  btcWalletText: "BTC Wallet",
  usdWalletText: "USD Wallet",
  setFee: (fee: FeeType) => console.log("setFee", fee),
  setPaymentError: (err: string) => console.log("paymentError", err),
}

export const FeeUnset = () => <ConfirmationWalletFee {...baseProps} fee={feeUnset} />
export const FeeLoading = () => <ConfirmationWalletFee {...baseProps} fee={feeLoading} />
export const FeeSet = () => <ConfirmationWalletFee {...baseProps} fee={feeSet} />
export const FeeError = () => <ConfirmationWalletFee {...baseProps} fee={feeError} />
