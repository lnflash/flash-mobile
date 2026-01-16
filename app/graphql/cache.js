"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCache = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("./generated");
const utilities_1 = require("@apollo/client/utilities");
(0, client_1.gql) `
  fragment MyWallets on ConsumerAccount {
    wallets {
      id
      balance
      walletCurrency
    }
  }

  query realtimePrice {
    me {
      id
      defaultAccount {
        id
        realtimePrice {
          btcSatPrice {
            base
            offset
          }
          denominatorCurrency
          id
          timestamp
          usdCentPrice {
            base
            offset
          }
        }
      }
    }
  }
`;
const getWallets = ({ readField, cache, }) => {
    const id = readField("id");
    const key = `ConsumerAccount:${id}`;
    const account = cache.readFragment({
        id: key,
        fragment: generated_1.MyWalletsFragmentDoc,
    });
    if (account === null) {
        return undefined;
    }
    return account.wallets;
};
const createCache = () => new client_1.InMemoryCache({
    possibleTypes: {
        // TODO: add other possible types
        Wallet: ["BTCWallet", "UsdWallet"],
        Account: ["ConsumerAccount"],
    },
    typePolicies: {
        Globals: {
            // singleton: only cache latest version:
            // https://www.apollographql.com/docs/react/caching/cache-configuration/#customizing-cache-ids
            keyFields: [],
        },
        RealtimePrice: {
            keyFields: [],
        },
        MapMarker: {
            keyFields: ["mapInfo", ["title", "coordinates"]],
        },
        Contact: {
            fields: {
                prettyName: {
                    read(_, { readField }) {
                        return readField("id") || readField("name");
                    },
                },
            },
        },
        UserContact: {
            fields: {
                transactions: (0, utilities_1.relayStylePagination)(),
            },
        },
        Earn: {
            fields: {
                completed: {
                    read: (value) => value !== null && value !== void 0 ? value : false,
                },
            },
        },
        Query: {
            fields: {
                // local only fields
                hideBalance: {
                    read: (value) => value !== null && value !== void 0 ? value : false,
                },
                hiddenBalanceToolTip: {
                    read: (value) => value !== null && value !== void 0 ? value : false,
                },
                beta: {
                    read: (value) => value !== null && value !== void 0 ? value : false,
                },
                colorScheme: {
                    read: (value) => value !== null && value !== void 0 ? value : "light",
                },
                feedbackModalShown: {
                    read: (value) => value !== null && value !== void 0 ? value : false,
                },
                hasPromptedSetDefaultAccount: {
                    read: (value) => value !== null && value !== void 0 ? value : false,
                },
                btcWallet: {
                    read: (_, { readField, cache }) => {
                        const wallets = getWallets({ readField, cache });
                        if (wallets === undefined || wallets.length === 0) {
                            return undefined;
                        }
                        // TODO: return toReference instead
                        // https://www.apollographql.com/docs/react/caching/advanced-topics#cache-redirects
                        return wallets.find((wallet) => wallet.walletCurrency === generated_1.WalletCurrency.Btc);
                    },
                },
                defaultWallet: {
                    read: (_, { readField, cache }) => {
                        const wallets = getWallets({ readField, cache });
                        if (wallets === undefined || wallets.length === 0) {
                            return undefined;
                        }
                        const defaultWalletId = readField("defaultWalletId");
                        // TODO: return toReference instead
                        // https://www.apollographql.com/docs/react/caching/advanced-topics#cache-redirects
                        return wallets.find((wallet) => wallet.id === defaultWalletId);
                    },
                },
                transactions: (0, utilities_1.relayStylePagination)(),
            },
        },
        Wallet: {
            fields: {
                transactions: (0, utilities_1.relayStylePagination)(),
            },
        },
    },
});
exports.createCache = createCache;
//# sourceMappingURL=cache.js.map