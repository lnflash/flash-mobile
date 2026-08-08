/**
 * Mirrors the backend cashout quote math (flash CashoutManager.createOffer):
 * the service fee (basis points) comes off the USD amount first, then the
 * remainder converts at the settlement rate (JMD cents per 1 USD, integer
 * division like USDAmount.convertAtRate). The result previews the offer's
 * receiveJmd — the authoritative number still comes from requestCashout.
 */
export const estimateJmdReceiveCents = (
  usdCents: number,
  rateJmdCentsPerUsd: number,
  feeBasisPoints: number,
): number => {
  if (!(usdCents > 0) || !(rateJmdCentsPerUsd > 0) || feeBasisPoints < 0) return 0
  const feeCents = Math.floor((usdCents * feeBasisPoints) / 10_000)
  const payoutUsdCents = usdCents - feeCents
  return Math.floor((payoutUsdCents * rateJmdCentsPerUsd) / 100)
}
