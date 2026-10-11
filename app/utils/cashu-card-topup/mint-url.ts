/**
 * A mint's identity for comparing two spellings of its URL: the origin and
 * the path without trailing slashes, lowercased. A saved top-up holds the URL
 * its mint was reached at (`mintUrl`), so a cosmetic edit to `CASHU_MINT_URL`
 * (a trailing slash, a capital letter) must not orphan every top-up already
 * in users' Keychains. A string that is not a URL is compared as written,
 * less trailing slashes and case.
 */
export const mintKey = (url: string): string => {
  try {
    const parsed = new URL(url)
    return (parsed.origin + parsed.pathname.replace(/\/+$/, "")).toLowerCase()
  } catch {
    return url.replace(/\/+$/, "").toLowerCase()
  }
}

/** Whether two URLs name the same mint (`mintKey`). */
export const sameMint = (a: string, b: string): boolean => mintKey(a) === mintKey(b)
