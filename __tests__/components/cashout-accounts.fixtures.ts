import { MockedResponse } from "@apollo/client/testing"

import {
  BankAccountsDocument,
  BridgeExternalAccountsDocument,
} from "@app/graphql/generated"

export const bank = (id: string, last4: string, currency: "JMD" | "USD") => ({
  __typename: "BankAccount",
  accountName: null,
  accountNumber: `0000${last4}`,
  accountType: "Savings",
  bankBranch: "Half Way Tree",
  bankName: `Bank ${id}`,
  currency,
  id,
  isDefault: false,
  pendingUpdate: null,
})

export const bankAccountsMock: MockedResponse = {
  request: { query: BankAccountsDocument },
  result: {
    data: {
      me: {
        __typename: "User",
        id: "user-1",
        bankAccounts: [
          bank("jm-1", "1111", "JMD"),
          { ...bank("jm-2", "2222", "JMD"), isDefault: true },
          bank("us-1", "3333", "USD"),
        ],
      },
    },
  },
}

export const externalAccountsMock: MockedResponse = {
  request: { query: BridgeExternalAccountsDocument },
  result: {
    data: {
      bridgeExternalAccounts: [
        {
          __typename: "BridgeExternalAccount",
          accountNumberLast4: "4444",
          bankName: "Chase",
          id: "ext-1",
          isDefault: false,
          status: "active",
        },
        {
          __typename: "BridgeExternalAccount",
          accountNumberLast4: "5555",
          bankName: "Wells Fargo",
          id: "ext-2",
          isDefault: true,
          status: "active",
        },
      ],
    },
  },
}
