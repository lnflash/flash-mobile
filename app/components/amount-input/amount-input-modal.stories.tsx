import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { WalletCurrency } from "../../graphql/generated"
import { DisplayCurrency, toBtcMoneyAmount, toUsdMoneyAmount } from "../../types/amounts"
import { AmountInputModal } from "./amount-input-modal"

const mockConvertMoneyAmount = (amount: any, currency: any) => ({
  amount: amount.amount,
  currency,
  currencyCode: currency === DisplayCurrency ? "USD" : String(currency),
})

export default {
  title: "Components/AmountInputModal",
  component: AmountInputModal,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof AmountInputModal>

export const BtcModal = () => {
  const [open, setOpen] = useState(true)
  return (
    <AmountInputModal
      title="Enter Amount"
      isOpen={open}
      close={() => setOpen(false)}
      walletCurrency={WalletCurrency.Btc}
      convertMoneyAmount={mockConvertMoneyAmount as any}
      moneyAmount={toBtcMoneyAmount(5000)}
      onSetAmount={(amt) => console.log("setAmount", amt)}
    />
  )
}

export const UsdModal = () => {
  const [open, setOpen] = useState(true)
  return (
    <AmountInputModal
      title="Enter Amount"
      isOpen={open}
      close={() => setOpen(false)}
      walletCurrency={WalletCurrency.Usd}
      convertMoneyAmount={mockConvertMoneyAmount as any}
      moneyAmount={toUsdMoneyAmount(100)}
      onSetAmount={(amt) => console.log("setAmount", amt)}
    />
  )
}

export const WithMinMax = () => {
  const [open, setOpen] = useState(true)
  return (
    <AmountInputModal
      title="Enter Amount (min $1, max $100)"
      isOpen={open}
      close={() => setOpen(false)}
      walletCurrency={WalletCurrency.Usd}
      convertMoneyAmount={mockConvertMoneyAmount as any}
      moneyAmount={toUsdMoneyAmount(50)}
      minAmount={toUsdMoneyAmount(100)}
      maxAmount={toUsdMoneyAmount(10000)}
      onSetAmount={(amt) => console.log("setAmount", amt)}
    />
  )
}
