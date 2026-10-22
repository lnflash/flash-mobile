import { similarUsernames } from "./similar-usernames"

/** The server's Username pattern; a spoken name with spaces is a search hint. */
export const FLASH_USERNAME = /^(?!^(1|3|bc1|lnbc1))[\p{L}0-9_]{3,50}$/iu

type VerifiedUsername<T> = { username: string; value: T }
type UsernameLookup<T> =
  | { kind: "exact"; match: VerifiedUsername<T> }
  | { kind: "suggestions"; matches: VerifiedUsername<T>[]; source?: "known" }

/** All username actions share exact lookup and verified, tap-to-select suggestions. */
export const lookupFlashUsername = async <T>(
  hint: string,
  known: readonly string[] | { names: readonly string[]; offerKnownChoices: boolean },
  verify: (username: string) => Promise<T | null>,
): Promise<UsernameLookup<T>> => {
  const username = hint.trim()
  const names = "names" in known ? known.names : known
  const offerKnownChoices = "names" in known && known.offerKnownChoices
  if (FLASH_USERNAME.test(username)) {
    const value = await verify(username)
    if (value !== null) return { kind: "exact", match: { username, value } }
  }
  let candidates = similarUsernames(username, names).filter(
    (name) => FLASH_USERNAME.test(name) && name.toLowerCase() !== username.toLowerCase(),
  )
  // A severe transcription error may resemble no name. Offer a bounded list
  // of known identities as explicit choices, never as inferred matches.
  const knownFallback = offerKnownChoices && candidates.length === 0
  if (knownFallback)
    candidates = [...new Set(names)]
      .filter(
        (name) =>
          FLASH_USERNAME.test(name) && name.toLowerCase() !== username.toLowerCase(),
      )
      .slice(-5)
      .reverse()
  const verified = await Promise.all(
    candidates.map(async (name): Promise<VerifiedUsername<T> | null> => {
      const value = await verify(name)
      return value === null ? null : { username: name, value }
    }),
  )
  return {
    kind: "suggestions",
    matches: verified.filter((match): match is VerifiedUsername<T> => match !== null),
    ...(knownFallback && verified.some(Boolean) ? { source: "known" as const } : {}),
  }
}
