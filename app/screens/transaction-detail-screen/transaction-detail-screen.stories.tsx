import * as React from "react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { TransactionDetailScreen } from "./transaction-detail-screen"
import { Meta } from "@storybook/react"
import { PersistentStateProvider } from "../../store/persistent-state"

export default {
  title: "Transaction Detail",
  component: TransactionDetailScreen,
} as Meta<typeof TransactionDetailScreen>

const route = {
  key: "transactionDetail",
  name: "transactionDetail",
  params: {
    txid: "6405acd835ff0f9111e86267",
  },
} as const

// FIXME: this doesn't work with useFragment_experimental

export const Default = () => (
  <PersistentStateProvider>
    <MockedProvider mocks={mocks} cache={createCache()}>
      <TransactionDetailScreen route={route} />
    </MockedProvider>
  </PersistentStateProvider>
)

const swapRoute = {
  key: "transactionDetail",
  name: "transactionDetail",
  params: {
    txid: "6405acd835ff0f9111e86267",
    tx: {
      __typename: "Transaction",
      id: "6405acd835ff0f9111e86267",
      status: "SUCCESS",
      direction: "SEND",
      memo: "Swap BTC to on-chain",
      createdAt: Date.now(),
      settlementAmount: -100000,
      settlementFee: 1000,
      settlementDisplayFee: "0.50",
      settlementCurrency: "BTC",
      settlementDisplayAmount: "50.00",
      settlementDisplayCurrency: "USD",
      settlementPrice: {
        __typename: "PriceOfOneSettlementMinorUnitInDisplayMinorUnit",
        base: 5000000000,
        offset: 8,
        currencyUnit: "SAT",
        formattedAmount: "SAT",
      },
      settlementVia: {
        __typename: "SettlementViaOnChain",
        transactionHash: "abc123def456",
      },
      initiationVia: {
        __typename: "InitiationViaOnChain",
        address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      },
      swapId: "swap_123456",
      lockupTxId: "lockup_abc123",
      claimTxId: "claim_def456",
      swapperFeesSat: 500,
      bitcoinExpirationBlockheight: 800000,
    }
  },
} as const

export const WithSwapDetails = () => (
  <PersistentStateProvider>
    <MockedProvider mocks={mocks} cache={createCache()}>
      <TransactionDetailScreen route={swapRoute} />
    </MockedProvider>
  </PersistentStateProvider>
)
