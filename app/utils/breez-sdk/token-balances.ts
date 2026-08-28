/**
 * Selecting the USDT balance out of Spark's `getInfo().tokenBalances`.
 *
 * Kept out of BreezContext so the selection rules — which are the whole risk
 * surface here — are testable without mounting a provider or the SDK.
 */

export type SparkTokenBalanceLike = {
  balance: bigint
  tokenMetadata: {
    identifier: string
    issuerPublicKey: string
    ticker: string
    decimals: number
  }
}

/**
 * A USDT-ticker token balance whose ISSUER HAS NOT BEEN VERIFIED.
 *
 * The name and the `issuerVerified: false` field are both load-bearing. Ticker
 * matching alone cannot tell the real Tether-on-Spark token from one an
 * attacker minted five minutes ago and airdropped, so nothing here is safe to
 * present as "your USDT" or to spend against. Once
 * `CANONICAL_USDT_ISSUER_PUBKEY` is known and pinned, this type gets replaced
 * by (or widened to) a verified variant — which is a type change every consumer
 * has to acknowledge, rather than a docblock they can skim past.
 */
export type UnverifiedSparkUsdtWallet = {
  /** Spark's token identifier — the stable key, unlike the ticker. */
  identifier: string
  /** Hex issuer public key. The only field that actually attests provenance. */
  issuerPublicKey: string
  /**
   * Always `false`, and required, so the unverified state cannot be dropped by
   * a spread or an object literal that "looks like" a wallet. A consumer that
   * wants a verified balance has to change this type, not just read past it.
   */
  issuerVerified: false
  /**
   * Balance in the token's MINOR units, exactly as Spark reported it.
   *
   * Deliberately NOT pre-divided by `decimals`: dividing here would force a
   * float and hand every consumer a rounded balance. A balance field that was
   * rounded before it reached the spend path is precisely what caused the MAX
   * overdraw in flash#480 — the display layer can format, the source must not.
   */
  balanceMinor: bigint
  /**
   * From TokenMetadata. Never assume 6.
   *
   * Guaranteed a non-negative integer: the selector drops the balance entirely
   * rather than hand back a `decimals` that makes `10n ** BigInt(decimals)`
   * throw.
   */
  decimals: number
}

export const USDT_TICKER = "USDT"

/**
 * Anyone can issue a Spark token and call its ticker "USDT" — the ticker is a
 * label, not an identity. So this refuses to guess between rival claims:
 * exactly one ticker match gets returned, and two or more resolve to
 * `undefined` rather than picking a winner.
 *
 * Note what that does NOT buy. The ambiguity check only fires for a user who
 * already holds the real token; airdrop a spoofed "USDT" to someone holding
 * none and it is the sole match, so it is exactly what comes back. The single
 * match is therefore no more trusted than the ambiguous one — which is why the
 * result type is `UnverifiedSparkUsdtWallet` and carries `issuerVerified:
 * false`. Before any UI presents this as USDT, or any spend path consumes it,
 * the selection has to be pinned to the canonical `issuerPublicKey`; that
 * pubkey is not yet recorded anywhere in this repo, which is why it is a type
 * obligation here rather than a runtime check (ENG-473, parent ENG-471
 * open-decision #1).
 */
export const selectUsdtBalance = (
  tokenBalances: Map<string, SparkTokenBalanceLike> | undefined | null,
): UnverifiedSparkUsdtWallet | undefined => {
  if (!tokenBalances) return undefined

  if (typeof tokenBalances.values !== "function") {
    // Absent is normal; present-but-wrong-shape means the SDK bridge changed
    // under us. Without this the symptom in production is a balance that is
    // permanently missing and a log that says nothing.
    console.warn("[breez] tokenBalances is not a Map; the SDK shape has changed")
    return undefined
  }

  const matches = Array.from(tokenBalances.values()).filter(
    // typeof, not optional chaining: `?.` short-circuits on null/undefined
    // only, so a bridge that lowers the ticker as a number or a wrapper object
    // makes `.toUpperCase` undefined and this throws inside `filter` — before
    // either guard below can turn it into a clean `undefined`. Same reasoning
    // as the balance/decimals checks; the ticker is read off the same
    // FFI-lowered struct and deserves the same distrust.
    (entry) =>
      typeof entry?.tokenMetadata?.ticker === "string" &&
      entry.tokenMetadata.ticker.toUpperCase() === USDT_TICKER,
  )

  if (matches.length === 0) return undefined

  if (matches.length > 1) {
    console.warn(
      `[breez] ${matches.length} tokens claim the ${USDT_TICKER} ticker; refusing to guess which is real`,
    )
    return undefined
  }

  const { balance, tokenMetadata } = matches[0]

  // Both halves of the documented consumer expression
  // `balanceMinor / 10n ** BigInt(decimals)` are checked here, because both are
  // typed from a .d.ts the FFI bridge is free to disagree with, and the Spark
  // dep moves fast. A bump that lowers the u128 balance as a string or a number
  // leaves `balanceMinor` typed `bigint` without being one and that division
  // throws "Cannot mix BigInt and other types"; an absent or non-integer
  // `decimals` (nothing above vouches for it — the ticker filter only reads
  // `tokenMetadata.ticker`) throws "Cannot convert undefined to a BigInt" one
  // field over. Missing beats lying, in both cases.
  const { decimals } = tokenMetadata
  if (typeof balance !== "bigint" || !Number.isInteger(decimals) || decimals < 0) {
    const problem =
      typeof balance === "bigint"
        ? `decimals is ${String(decimals)}, not a non-negative integer`
        : `balance is ${typeof balance}, not bigint`
    console.warn(`[breez] ${USDT_TICKER} ${problem}; refusing to surface it`)
    return undefined
  }

  return {
    identifier: tokenMetadata.identifier,
    issuerPublicKey: tokenMetadata.issuerPublicKey,
    issuerVerified: false,
    balanceMinor: balance,
    decimals,
  }
}
