"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@apollo/client");
exports.default = (0, client_1.gql) `
  fragment Transaction on Transaction {
    __typename
    id
    status
    direction
    memo
    createdAt

    settlementAmount
    settlementFee
    settlementDisplayFee
    settlementCurrency
    settlementDisplayAmount
    settlementDisplayCurrency
    settlementPrice {
      base
      offset
      currencyUnit
      formattedAmount
    }

    initiationVia {
      ... on InitiationViaIntraLedger {
        counterPartyWalletId
        counterPartyUsername
      }
      ... on InitiationViaLn {
        paymentHash
      }
      ... on InitiationViaOnChain {
        address
      }
    }
    settlementVia {
      ... on SettlementViaIntraLedger {
        counterPartyWalletId
        counterPartyUsername
      }
      ... on SettlementViaLn {
        paymentSecret
      }
      ... on SettlementViaOnChain {
        transactionHash
      }
    }
  }

  fragment TransactionList on TransactionConnection {
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    edges {
      cursor
      node {
        ...Transaction
      }
    }
  }
`;
//# sourceMappingURL=fragments.js.map