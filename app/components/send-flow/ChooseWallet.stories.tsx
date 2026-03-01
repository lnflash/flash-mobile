import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import * as IntraledgerDetails from "../../screens/send-bitcoin-screen/payment-details/intraledger"
import { WalletCurrency } from "../../graphql/generated"
import { DisplayCurrency, toUsdMoneyAmount } from "../../types/amounts"
import { ChooseWallet } from "./ChooseWallet"

const mockConvertMoneyAmount = (amount: any, currency: any) => ({
  amount: amount.amount, currency,
  currencyCode: currency === DisplayCurrency ? "USD" : currency,
})

const btcSendingWallet = { currency: WalletCurrency.Btc, id: "f79792e3" }
const usdSendingWallet = { currency: WalletCurrency.Usd, id: "f091c102" }

const btcPaymentDetail = IntraledgerDetails.createIntraledgerPaymentDetails({
  handle: "test",
  recipientWalletId: "recipient-wallet-id",
  convertMoneyAmount: mockConvertMoneyAmount,
  sendingWalletDescriptor: btcSendingWallet,
  unitOfAccountAmount: toUsdMoneyAmount(100),
})

const mockWallets = [
  { id: "f79792e3", walletCurrency: WalletCurrency.Btc, balance: 88413 },
  { id: "f091c102", walletCurrency: WalletCurrency.Usd, balance: 158 },
]

export default {
  title: "Send Flow/ChooseWallet",
  component: ChooseWallet,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof ChooseWallet>

export const SendingBTC = () => {
  const [detail, setDetail] = useState(btcPaymentDetail)
  return (
    <ChooseWallet
      usdWallet={mockWallets[1]}
      wallets={mockWallets as any}
      paymentDetail={detail as any}
      setPaymentDetail={setDetail as any}
    />
  )
}
