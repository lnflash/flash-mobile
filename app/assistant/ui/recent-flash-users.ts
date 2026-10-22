import { ApolloClient, gql, type NormalizedCacheObject } from "@apollo/client"
import { FLASH_USERNAME } from "../registry/read/lookup-flash-username"
import { isPlainObject } from "../engine/schema-validator"

const QUERY = gql`
  query AssistantRecentUsers {
    assistantRecentUsers @client
  }
`

export type RecentFlashUsers = ReturnType<typeof createRecentFlashUsers>

/** Successful lookups omitted by older recent-name indexes. */
const cachedLookupNames = (client: ApolloClient<unknown>): string[] => {
  const cache = client.cache.extract() as NormalizedCacheObject
  return Object.entries(cache.ROOT_QUERY ?? {}).flatMap(([field, value]) => {
    const match = /^accountDefaultWallet\((\{.*\})\)$/.exec(field)
    if (!match || !value || typeof value !== "object") return []
    const wallet = "__ref" in value ? cache[String(value.__ref)] : value
    if (
      !isPlainObject(wallet) ||
      typeof wallet.id !== "string" ||
      !["USD", "BTC", "USDT"].includes(String(wallet.walletCurrency))
    )
      return []
    try {
      const { username } = JSON.parse(match[1])
      return typeof username === "string" && FLASH_USERNAME.test(username)
        ? [username]
        : []
    } catch {
      return []
    }
  })
}

/** Bounded search hints in the session's existing persisted cache, never contacts or proof of identity. */
export const createRecentFlashUsers = (client: ApolloClient<unknown>, scope?: string) => {
  let names: readonly string[] = []
  let importLookups = Boolean(scope)
  const listeners = new Set<() => void>()
  const validNames = (values: readonly unknown[]): string[] =>
    [
      ...new Set(
        values
          .filter((value): value is string => typeof value === "string")
          .map((name) => name.toLowerCase())
          .filter((name) => FLASH_USERNAME.test(name)),
      ),
    ].slice(-100)
  try {
    const raw = client.readQuery<{ assistantRecentUsers: string }>({
      query: QUERY,
    })?.assistantRecentUsers
    if (raw && scope) {
      const saved = JSON.parse(raw)
      if (saved.scope === scope && Array.isArray(saved.names)) {
        names = validNames(saved.names)
        importLookups = saved.lookupImportVersion !== 1
      } else {
        importLookups = false
        client.cache.evict({ id: "ROOT_QUERY", fieldName: "assistantRecentUsers" })
      }
    }
    if (importLookups) names = validNames([...names, ...cachedLookupNames(client)])
  } catch {
    /* Missing or malformed cache starts empty. */
  }
  // Record even an empty index so an account switch never repeats the legacy import.
  if (scope) {
    try {
      client.writeQuery({
        query: QUERY,
        data: {
          assistantRecentUsers: JSON.stringify({ scope, names, lookupImportVersion: 1 }),
        },
      })
    } catch {
      /* Search hints remain usable in memory. */
    }
  }
  return {
    get: () => names,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    remember: (values: readonly string[]) => {
      const next = validNames([...names, ...values])
      if (next.length === names.length && next.every((name, i) => name === names[i]))
        return
      names = next
      if (scope) {
        try {
          client.writeQuery({
            query: QUERY,
            data: {
              assistantRecentUsers: JSON.stringify({
                scope,
                names,
                lookupImportVersion: 1,
              }),
            },
          })
        } catch {
          /* Hints are optional; no network fallback. */
        }
      }
      listeners.forEach((listener) => listener())
    },
  }
}
