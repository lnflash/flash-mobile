import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { WalletCurrency } from "../../graphql/generated"
import { CurrencyTag } from "./currency-tag"

export default {
  title: "Components/CurrencyTag",
  component: CurrencyTag,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof CurrencyTag>

export const BTC = () => <CurrencyTag walletCurrency={WalletCurrency.Btc} />
export const USD = () => <CurrencyTag walletCurrency={WalletCurrency.Usd} />
