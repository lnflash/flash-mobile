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

export type SparkUsdtWallet = {
  /** Spark's token identifier — the stable key, unlike the ticker. */
  identifier: string
  /** Hex issuer public key. The only field that actually attests provenance. */
  issuerPublicKey: string
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
 * label, not an identity. So this refuses to guess: exactly one ticker match
 * gets returned, and two or more resolve to `undefined` rather than picking a
 * winner and possibly surfacing a spoofed token's balance as the user's money.
 *
 * Before any UI presents this as USDT, or any spend path consumes it, the
 * selection has to be pinned to the canonical `issuerPublicKey` — that pubkey
 * is not yet recorded anywhere in this repo, which is why it is not enforced
 * here. `issuerPublicKey` is carried on the result so the caller can gate on it
 * the moment the value is known (ENG-473, parent ENG-471 open-decision #1).
 */
export const selectUsdtBalance = (
  tokenBalances: Map<string, SparkTokenBalanceLike> | undefined | null,
): SparkUsdtWallet | undefined => {
  if (!tokenBalances || typeof tokenBalances.values !== "function") return undefined

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

  return {
    identifier: tokenMetadata.identifier,
    issuerPublicKey: tokenMetadata.issuerPublicKey,
    balanceMinor: balance,
    decimals: tokenMetadata.decimals,
  }
}
