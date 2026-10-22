import Fuse from "fuse.js"

/** Suggestions only. A candidate is never selected or paid without a tap. */
export const similarUsernames = (
  hint: string,
  known: readonly string[],
  limit = 5,
): string[] =>
  new Fuse([...new Set(known)], {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.55,
  })
    .search(hint.trim())
    .slice(0, limit)
    .map(({ item }) => item)
