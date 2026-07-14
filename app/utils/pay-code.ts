import { bech32 } from "bech32"

/**
 * Builds the QR content for a user's static Paycode: the uppercase pay-page
 * URL with the bech32-encoded LNURL-pay endpoint appended, so both web
 * browsers and lightning wallets can consume the same QR.
 *
 * Single source of truth for the paycode format — used by the Receive screen
 * and the Apple Watch receive QR, which must never drift apart.
 */
export const getPaycodeQRContent = (posUrl: string, username: string): string => {
  const lnurl = bech32.encode(
    "lnurl",
    bech32.toWords(Buffer.from(`${posUrl}/.well-known/lnurlp/${username}`, "utf8")),
    1500,
  )

  const webUrl = `${posUrl}/${username}`

  return `${webUrl.toUpperCase()}?lightning=${lnurl.toUpperCase()}`
}
