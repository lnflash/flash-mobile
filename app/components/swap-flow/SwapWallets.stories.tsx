import React, { useState } from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { WalletCurrency } from "../../graphql/generated"
import SwapWallets from "./SwapWallets"

export default {
  title: "Swap Flow/SwapWallets",
  component: SwapWallets,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof SwapWallets>

export const BtcToUsd = () => {
  const [fromWallet, setFromWallet] = useState<WalletCurrency>(WalletCurrency.Btc)
  return (
    <SwapWallets
      fromWalletCurrency={fromWallet}
      formattedBtcBalance="0.00088413 BTC"
      formattedUsdBalance="$158.00"
      canToggleWallet={true}
      setFromWalletCurrency={setFromWallet}
    />
  )
}

export const UsdToBtc = () => {
  const [fromWallet, setFromWallet] = useState<WalletCurrency>(WalletCurrency.Usd)
  return (
    <SwapWallets
      fromWalletCurrency={fromWallet}
      formattedBtcBalance="0.00088413 BTC"
      formattedUsdBalance="$158.00"
      canToggleWallet={true}
      setFromWalletCurrency={setFromWallet}
    />
  )
}

export const CannotToggle = () => (
  <SwapWallets
    fromWalletCurrency={WalletCurrency.Btc}
    formattedBtcBalance="0.00000000 BTC"
    formattedUsdBalance="$0.00"
    canToggleWallet={false}
    setFromWalletCurrency={() => {}}
  />
)
