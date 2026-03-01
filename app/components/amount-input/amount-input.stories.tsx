import React from "react"
import { StoryScreen } from "../../../.storybook/views"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import { AmountInput, AmountInputProps } from "./amount-input"
import { WalletCurrency } from "../../graphql/generated"
import mocks from "../../graphql/mocks"
import {
  DisplayCurrency,
  MoneyAmount,
  WalletOrDisplayCurrency,
  ZeroDisplayAmount,
} from "../../types/amounts"

export default {
  title: "Amount Input",
  component: AmountInput,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
  parameters: {
    backgrounds: {
      values: [
        { name: "black", value: "#000" },
        { name: "white", value: "#fff" },
      ],
    },
  },
} as Meta<typeof AmountInput>

// currencyCode must be included — MoneyAmount requires { amount, currency, currencyCode }
const mockConvertMoneyAmount: AmountInputProps["convertMoneyAmount"] = (moneyAmount, toCurrency) => ({
  amount: moneyAmount.amount,
  currency: toCurrency,
  currencyCode: toCurrency === DisplayCurrency ? "USD" : toCurrency,
})

const baseProps: AmountInputProps = {
  unitOfAccountAmount: ZeroDisplayAmount,
  walletCurrency: WalletCurrency.Btc,
  setAmount: (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) =>
    console.log("set amount:", moneyAmount),
  convertMoneyAmount: mockConvertMoneyAmount,
}

export const Default = () => {
  const [moneyAmount, setMoneyAmount] =
    React.useState<MoneyAmount<WalletOrDisplayCurrency>>(ZeroDisplayAmount)
  return (
    <AmountInput {...baseProps} unitOfAccountAmount={moneyAmount} setAmount={setMoneyAmount} />
  )
}

export const WalletCurrencyIsUsd = () => {
  const [moneyAmount, setMoneyAmount] =
    React.useState<MoneyAmount<WalletOrDisplayCurrency>>(ZeroDisplayAmount)
  return (
    <AmountInput
      {...baseProps}
      walletCurrency={WalletCurrency.Usd}
      unitOfAccountAmount={moneyAmount}
      setAmount={setMoneyAmount}
    />
  )
}

export const FixedSatoshiAmount = () => {
  const [moneyAmount, setMoneyAmount] = React.useState<MoneyAmount<WalletOrDisplayCurrency>>({
    amount: 1234,
    currency: WalletCurrency.Btc,
    currencyCode: WalletCurrency.Btc,
  })
  return (
    <AmountInput
      {...baseProps}
      walletCurrency={WalletCurrency.Btc}
      unitOfAccountAmount={moneyAmount}
      setAmount={setMoneyAmount}
      canSetAmount={false}
    />
  )
}

export const FixedUsdAmount = () => {
  const [moneyAmount, setMoneyAmount] = React.useState<MoneyAmount<WalletOrDisplayCurrency>>({
    amount: 100,
    currency: WalletCurrency.Usd,
    currencyCode: "USD",
  })
  return (
    <AmountInput
      {...baseProps}
      walletCurrency={WalletCurrency.Usd}
      unitOfAccountAmount={moneyAmount}
      setAmount={setMoneyAmount}
      canSetAmount={false}
    />
  )
}
