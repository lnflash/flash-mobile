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
  /** From TokenMetadata. Never assume 6. */
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
    (entry) => entry?.tokenMetadata?.ticker?.toUpperCase() === USDT_TICKER,
  )

  if (matches.length === 0) return undefined

  if (matches.length > 1) {
    console.warn(
      `[breez] ${matches.length} tokens claim the ${USDT_TICKER} ticker; refusing to guess which is real`,
    )
    return undefined
  }

  const { balance, tokenMetadata } = matches[0]

  // The SDK lifts u128 through `BigInt(...)` today, but this module exists to
  // hold the bigint invariant and the Spark dep moves fast. If a bump ever
  // lowers the balance as a string or a number, `balanceMinor` would be typed
  // `bigint` without being one, and the first consumer dividing by
  // `10n ** BigInt(decimals)` throws "Cannot mix BigInt and other types".
  // Missing beats lying.
  if (typeof balance !== "bigint") {
    console.warn(
      `[breez] ${USDT_TICKER} balance is ${typeof balance}, not bigint; refusing to surface it`,
    )
    return undefined
  }

  return {
    identifier: tokenMetadata.identifier,
    issuerPublicKey: tokenMetadata.issuerPublicKey,
    issuerVerified: false,
    balanceMinor: balance,
    decimals: tokenMetadata.decimals,
  }
}
