// app/utils/currency-display.ts

import { WalletCurrency } from "@app/graphql/generated"

/**
 * Stablecoin → fiat display mapping.
 *
 * The backend may add new stablecoin wallets (USDC, USDB, PYUSD, EURC, etc).
 * In the UI, these should always display as their underlying fiat currency,
 * not the stablecoin ticker. This keeps the user experience consistent —
 * they see "USD" whether their cash wallet is USDT, USDC, or any future USD
 * stablecoin.
 *
 * To add a new stablecoin: add its WalletCurrency string value to this map
 * with the fiat code it should display as.
 *
 * NOTE: As of now only USDT exists in the enum. When new currencies are added
 * to WalletCurrency, extend this map. Any currency not in the map displays as-is.
 */

const STABLECOIN_DISPLAY_MAP: Record<string, string> = {
  // USD-pegged stablecoins → display as "USD"
  USDT: "USD",
  // USDC: "USD",    // future
  // USDB: "USD",    // future
  // PYUSD: "USD",   // future

  // EUR-pegged stablecoins → display as "EUR"
  // EURC: "EUR",    // future
}

/**
 * Returns the user-facing currency code for a wallet currency.
 * Stablecoins map to their fiat equivalent; everything else passes through.
 *
 * @example
 * displayCurrencyCode("USDT")  → "USD"
 * displayCurrencyCode("USD")   → "USD"
 * displayCurrencyCode("BTC")   → "BTC"
 * displayCurrencyCode("USDC")  → "USD"  (once added to map)
 */
export const displayCurrencyCode = (
  currency: WalletCurrency | string,
): string => {
  return STABLECOIN_DISPLAY_MAP[currency] ?? currency
}
