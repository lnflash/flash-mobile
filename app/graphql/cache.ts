import { InMemoryCache, gql } from "@apollo/client"
import { Account, MyWalletsFragmentDoc, Wallet, WalletCurrency } from "./generated"
import { relayStylePagination } from "@apollo/client/utilities"
import { ReadFieldFunction } from "@apollo/client/cache/core/types/common"

gql`
  fragment MyWallets on ConsumerAccount {
    wallets {
      id
      balance
      walletCurrency
      isExternal
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
`

type getWalletsInputs = {
  readField: ReadFieldFunction
  cache: InMemoryCache
}

const getWallets = ({
  readField,
  cache,
}: getWalletsInputs): readonly Wallet[] | undefined => {
  const id = readField("id")
  const key = `ConsumerAccount:${id}`
  const account: Account | null = cache.readFragment({
    id: key,
    fragment: MyWalletsFragmentDoc,
  })
  if (account === null) {
    return undefined
  }
  return account.wallets
}

export const createCache = () =>
  new InMemoryCache({
    possibleTypes: {
      // TODO: add other possible types
      Wallet: ["BTCWallet", "UsdWallet", "UsdtWallet"],
      Account: ["ConsumerAccount"],
    },
    typePolicies: {
      Globals: {
        // singleton: only cache latest version:
        // https://www.apollographql.com/docs/react/caching/cache-configuration/#customizing-cache-ids
        keyFields: [],
        fields: {
          // FygaroTopupInfo has no id, so it is embedded in the Globals
          // record rather than normalized. Two simultaneously-watched
          // queries select DISJOINT subsets of it (transferFlags: fees +
          // minimum; cardTopupLimits: per-level daily limits — split on
          // purpose, see use-transfer-flags.ts / use-card-topup-limit.ts).
          // Without a merge policy each response wholesale-replaces the
          // object, destroying the other query's cached fields: the
          // clobbered watcher's diff turns incomplete, Apollo refetches,
          // that response clobbers the first query's fields, and the two
          // cache-and-network watchers ping-pong forever — with dailyLimit
          // (and the enforced minimum) reading undefined in every window
          // between clobber and refetch. merge: true shallow-merges
          // existing + incoming so both selections coexist.
          fygaroTopup: { merge: true },
        },
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
              return readField("id") || readField("name")
            },
          },
        },
      },
      UserContact: {
        fields: {
          transactions: relayStylePagination(),
        },
      },
      Earn: {
        fields: {
          completed: {
            read: (value) => value ?? false,
          },
        },
      },
      Query: {
        fields: {
          // local only fields
          hideBalance: {
            read: (value) => value ?? false,
          },
          hiddenBalanceToolTip: {
            read: (value) => value ?? false,
          },
          beta: {
            read: (value) => value ?? false,
          },
          colorScheme: {
            read: (value) => value ?? "light",
          },
          feedbackModalShown: {
            read: (value) => value ?? false,
          },
          hasPromptedSetDefaultAccount: {
            read: (value) => value ?? false,
          },
          btcWallet: {
            read: (_, { readField, cache }) => {
              const wallets = getWallets({ readField, cache })
              if (wallets === undefined || wallets.length === 0) {
                return undefined
              }

              // TODO: return toReference instead
              // https://www.apollographql.com/docs/react/caching/advanced-topics#cache-redirects
              return wallets.find(
                (wallet) => wallet.walletCurrency === WalletCurrency.Btc,
              )
            },
          },
          defaultWallet: {
            read: (_, { readField, cache }): Wallet | undefined => {
              const wallets = getWallets({ readField, cache })
              if (wallets === undefined || wallets.length === 0) {
                return undefined
              }

              const defaultWalletId = readField("defaultWalletId")

              // TODO: return toReference instead
              // https://www.apollographql.com/docs/react/caching/advanced-topics#cache-redirects
              return wallets.find((wallet) => wallet.id === defaultWalletId)
            },
          },
          transactions: relayStylePagination(),
        },
      },
      Wallet: {
        fields: {
          transactions: relayStylePagination(),
        },
      },
    },
  })
