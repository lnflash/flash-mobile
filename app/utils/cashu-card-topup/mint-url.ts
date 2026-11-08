import { RECORD_MINT_MAX } from "../cashu-card"

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

/** Why `normalizeCardMint` refused an address. */
export type CardMintProblem = "invalid" | "too-long"

export type CardMintCheck =
  | { ok: true; url: string }
  | { ok: false; reason: CardMintProblem }

/**
 * A mint address as a card may name it (ENG-787): what setup writes with
 * SET_CARD, and what a read takes from a card's record before asking that
 * mint anything. https only; http only with `allowHttp` (a development
 * build's card bridge, whose mint is local). The path is kept (a mint such as
 * `https://mint.minibits.cash/Bitcoin` lives under one), less trailing
 * slashes. Credentials, a query, a fragment, whitespace and any character
 * outside printable ASCII are refused: a card's record is ASCII, and a
 * look-alike host must never pass for a known one. An address longer than a
 * card holds once normalized is `too-long`; it is never truncated.
 */
export const normalizeCardMint = (
  input: string,
  { allowHttp = false }: { allowHttp?: boolean } = {},
): CardMintCheck => {
  const invalid: CardMintCheck = { ok: false, reason: "invalid" }
  if (typeof input !== "string" || !/^[\x21-\x7e]+$/.test(input)) return invalid
  if (/[?#@\\]/.test(input)) return invalid
  const scheme = /^([a-z]+):\/\//i.exec(input)?.[1]?.toLowerCase()
  if (scheme !== "https" && !(scheme === "http" && allowHttp)) return invalid
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return invalid
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return invalid
  const host = parsed.host.toLowerCase()
  if (!host || !/^[a-z0-9.:[\]-]+$/.test(host) || host.startsWith(".")) return invalid
  const path = parsed.pathname.replace(/\/+$/, "")
  const url = `${scheme}://${host}${path}`
  if (url.length > RECORD_MINT_MAX) return { ok: false, reason: "too-long" }
  return { ok: true, url }
}
