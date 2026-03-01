import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import Transactions from "./Transactions"

const mockTxEdge = (id: string, amount: number, currency: string, dir: string) => ({
  cursor: id,
  node: {
    __typename: currency === "BTC" ? "Transaction" : "Transaction",
    id,
    status: "SUCCESS",
    direction: dir,
    memo: null,
    createdAt: Math.floor(Date.now() / 1000) - 3600,
    settlementAmount: amount,
    settlementFee: 0,
    settlementCurrency: currency,
    settlementDisplayAmount: `${amount}`,
    settlementDisplayCurrency: "USD",
    settlementDisplayFee: "0",
    settlementPrice: {
      base: 3000000000000,
      offset: 12,
      currencyUnit: "BTCSAT",
      formattedAmount: "30000",
    },
    initiationVia: { __typename: "InitiationViaLn", paymentHash: `hash-${id}` },
    settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
  },
})

const sampleEdges = [
  mockTxEdge("tx1", 5000, "BTC", "RECEIVE"),
  mockTxEdge("tx2", 100, "USD", "SEND"),
  mockTxEdge("tx3", 21000, "BTC", "RECEIVE"),
]

export default {
  title: "Home Screen/Transactions",
  component: Transactions,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <PersistentStateProvider>
          <MockedProvider mocks={mocks} cache={createCache()}>
            <StoryScreen>{Story()}</StoryScreen>
          </MockedProvider>
        </PersistentStateProvider>
      </Provider>
    ),
  ],
} as Meta<typeof Transactions>

export const WithTransactions = () => (
  <Transactions
    loadingAuthed={false}
    transactionsEdges={sampleEdges as any}
    refreshTriggered={false}
  />
)

export const Loading = () => (
  <Transactions loadingAuthed={true} transactionsEdges={[]} refreshTriggered={false} />
)

export const Empty = () => (
  <Transactions loadingAuthed={false} transactionsEdges={[]} refreshTriggered={false} />
)
