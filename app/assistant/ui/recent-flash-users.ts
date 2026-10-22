import { ApolloClient, gql } from "@apollo/client"
import { FLASH_USERNAME } from "../registry/read/lookup-flash-username"

const QUERY = gql`
  query AssistantRecentUsers {
    assistantRecentUsers @client
  }
`

export type RecentFlashUsers = ReturnType<typeof createRecentFlashUsers>

/** Bounded search hints in the session's existing persisted cache, never contacts or proof of identity. */
export const createRecentFlashUsers = (client: ApolloClient<unknown>, scope?: string) => {
  let names: readonly string[] = []
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
      if (saved.scope === scope && Array.isArray(saved.names))
        names = validNames(saved.names)
      else client.cache.evict({ id: "ROOT_QUERY", fieldName: "assistantRecentUsers" })
    }
  } catch {
    /* Missing or malformed cache starts empty. */
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
            data: { assistantRecentUsers: JSON.stringify({ scope, names }) },
          })
        } catch {
          /* Hints are optional; no network fallback. */
        }
      }
      listeners.forEach((listener) => listener())
    },
  }
}
