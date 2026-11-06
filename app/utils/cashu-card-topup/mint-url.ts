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

/**
 * The mint a card's assisted-settlement packet may be relayed to (ENG-820),
 * or undefined: then no request object is ever built. `known` is the mints
 * this app already speaks to (`CASHU_MINT_URL` and the card mint,
 * `cardMintUrl()`); the answer is the one of them the packet's mint is
 * (`sameMint`), as configured, which is the URL the relay calls. The card's
 * record mint (`recordMint`, when this tap read it) counts only when it is
 * one of `known` too, and must name the same mint as the packet: a packet
 * whose mint is not the card's own record is not relayed.
 */
export const knownRelayMint = (
  packetMint: string,
  recordMint: string | undefined,
  known: readonly string[],
): string | undefined => {
  if (recordMint !== undefined) {
    const recordKnown = known.some((url) => sameMint(url, recordMint))
    if (!recordKnown || !sameMint(recordMint, packetMint)) return undefined
  }
  return known.find((url) => sameMint(url, packetMint))
}
