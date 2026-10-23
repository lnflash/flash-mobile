import type { ApolloClient } from "@apollo/client"

import {
  SearchUsernamesDocument,
  SearchUsernamesQuery,
  SearchUsernamesQueryVariables,
} from "@app/graphql/generated"
import { FLASH_USERNAME } from "../registry/read/lookup-flash-username"

/** Older servers retain exact lookup and local suggestions during the staged rollout. */
const unsupported = (error: unknown): boolean => {
  const failure = error as {
    graphQLErrors?: { message: string }[]
    networkError?: { statusCode?: number; result?: { errors?: { message: string }[] } }
  }
  const errors = failure?.graphQLErrors?.length
    ? failure.graphQLErrors
    : failure?.networkError?.statusCode === 400
    ? failure.networkError.result?.errors
    : undefined
  return Boolean(
    errors?.length &&
      errors.every((e) => /Cannot query field "searchUsernames"/.test(e.message)),
  )
}

/** Search only after a submitted name misses; never on each keystroke. */
export const searchFlashUsernames = async (
  client: ApolloClient<unknown>,
  hint: string,
): Promise<readonly string[]> => {
  if (hint.length > 80) return []
  const query = hint.trim().replace(/^@/, "").normalize("NFKC").replace(/\s+/g, "")
  if (!FLASH_USERNAME.test(query)) return []
  try {
    const result = await client.query<
      SearchUsernamesQuery,
      SearchUsernamesQueryVariables
    >({
      query: SearchUsernamesDocument,
      variables: { query },
      fetchPolicy: "network-only",
      errorPolicy: "none",
    })
    if (!Array.isArray(result.data?.searchUsernames))
      throw new Error("Username search returned no answer")
    return [...new Set(result.data.searchUsernames.map((name) => name.toLowerCase()))]
      .filter((name) => FLASH_USERNAME.test(name))
      .slice(0, 5)
  } catch (error) {
    if (unsupported(error)) return []
    throw error
  }
}
