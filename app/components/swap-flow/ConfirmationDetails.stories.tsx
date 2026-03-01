import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { WalletCurrency } from "../../graphql/generated"
import ConfirmationDetails from "./ConfirmationDetails"

const btcWallet = { id: "f79792e3", walletCurrency: WalletCurrency.Btc, balance: 88413 }
const usdWallet = { id: "f091c102", walletCurrency: WalletCurrency.Usd, balance: 158 }

export default {
  title: "Swap Flow/ConfirmationDetails",
  component: ConfirmationDetails,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof ConfirmationDetails>

export const BtcToUsd = () => (
  <ConfirmationDetails
    fromWallet={btcWallet}
    toWallet={usdWallet}
    moneyAmount={{ amount: 5000, currency: WalletCurrency.Btc, currencyCode: WalletCurrency.Btc }}
    totalFee={0}
  />
)

export const UsdToBtc = () => (
  <ConfirmationDetails
    fromWallet={usdWallet}
    toWallet={btcWallet}
    moneyAmount={{ amount: 100, currency: WalletCurrency.Usd, currencyCode: "USD" }}
    totalFee={2}
  />
)
