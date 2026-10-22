import { similarUsernames } from "./similar-usernames"

/** The server's Username pattern; a spoken name with spaces is a search hint. */
export const FLASH_USERNAME = /^(?!^(1|3|bc1|lnbc1))[\p{L}0-9_]{3,50}$/iu

type VerifiedUsername<T> = { username: string; value: T }
type UsernameLookup<T> =
  | { kind: "exact"; match: VerifiedUsername<T> }
  | { kind: "suggestions"; matches: VerifiedUsername<T>[] }

/** All username actions share exact lookup and verified, tap-to-select suggestions. */
export const lookupFlashUsername = async <T>(
  hint: string,
  known: readonly string[],
  verify: (username: string) => Promise<T | null>,
): Promise<UsernameLookup<T>> => {
  const username = hint.trim()
  if (FLASH_USERNAME.test(username)) {
    const value = await verify(username)
    if (value !== null) return { kind: "exact", match: { username, value } }
  }
  const candidates = similarUsernames(username, known).filter(
    (name) => FLASH_USERNAME.test(name) && name.toLowerCase() !== username.toLowerCase(),
  )
  const verified = await Promise.all(
    candidates.map(async (name): Promise<VerifiedUsername<T> | null> => {
      const value = await verify(name)
      return value === null ? null : { username: name, value }
    }),
  )
  return {
    kind: "suggestions",
    matches: verified.filter((match): match is VerifiedUsername<T> => match !== null),
  }
}
