import { ApolloClient, gql } from "@apollo/client"
import { AssistantUsernameDocument, AssistantUsernameQuery } from "@app/graphql/generated"

// The same normalized me.username displayed on Home, read without its unrelated
// wallet/history fields. Apollo can satisfy this from Home's existing cache.
gql`
  query assistantUsername {
    me {
      id
      username
    }
  }
`

export const createOwnUsernameReader =
  (client: ApolloClient<unknown>, signedIn: boolean) =>
  async (isOffline: boolean): Promise<string | null | undefined> => {
    if (!signedIn) return undefined
    const cached = client.readQuery<AssistantUsernameQuery>({
      query: AssistantUsernameDocument,
    })
    if (cached?.me && cached.me.username !== undefined) return cached.me.username
    if (isOffline) return undefined
    const { data } = await client.query<AssistantUsernameQuery>({
      query: AssistantUsernameDocument,
      fetchPolicy: "network-only",
    })
    return data.me?.username
  }

/** A username on the active Flash instance, never a fresh invoice or BTC address. */
export const ownFlashAddress = (
  username: string,
  hostname: string,
): string | undefined => {
  if (!username || /[\s@/\\?#]/.test(username) || username.length > 100) return undefined
  if (
    hostname.length > 253 ||
    !hostname
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  )
    return undefined
  return `${username}@${hostname}`
}
