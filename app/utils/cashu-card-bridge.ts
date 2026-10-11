/**
 * A simulated Cashu card for development builds (ENG-634).
 *
 * The cashu-javacard repo serves the real applet in jCardSim over loopback
 * HTTP (`tools/cardsim`, "cardsim"): `POST /apdu {hex}` answers `{hex}`, the
 * applet's data ‖ SW. A simulator has no NFC, so with a bridge set the card
 * flows in `app/contexts/Flashcard.tsx` send their APDUs there instead of to
 * the IsoDep tag. Everything above the transport (the applet SELECT, the PIN
 * checks, the top-up engine) runs unchanged.
 *
 * Development builds only: every entry point is a no-op, or answers
 * `undefined`, when `__DEV__` is false, so a release build never talks to a
 * bridge, never mints anywhere but `CASHU_MINT_URL` and never skips a payment.
 * Nothing here is persisted: the e2e flows set the bridge by deep link on
 * every launch, so a developer's phone build cannot silently keep talking to
 * one.
 */
import { CASHU_MINT_URL } from "@app/config/appinfo"

import type { PayOutcome } from "./cashu-card-topup/engine"
import { Transceiver, toHex } from "./cashu-card"
import { CARD_TRANSCEIVE_TIMEOUT_MS } from "./cashu-card-nfc"

export type CardBridgeConfig = {
  /** The cardsim bridge, e.g. http://localhost:9876. */
  url: string
  /**
   * The mint a card read asks for keyset units and a top-up mints at, in
   * place of `CASHU_MINT_URL`: a local Nutshell in the e2e runs. Never the
   * production mint.
   */
  mintUrl?: string
  /**
   * The top-up's payment of the mint's invoice is skipped and reads as paid.
   * Only with `mintUrl`: a local FakeWallet mint marks its own quotes paid,
   * so nothing is owed to anyone. Refused without one.
   */
  stubPay?: boolean
}

/** What a dev deep link asks for (`parseCardBridgeLink`). */
export type CardBridgeLink =
  | { kind: "bridge"; config: CardBridgeConfig | undefined }
  | { kind: "tap" }

const isDev = (): boolean => typeof __DEV__ !== "undefined" && __DEV__ === true

let bridge: CardBridgeConfig | undefined

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

const isHttpUrl = (url: string): boolean =>
  /^https?:\/\/[^/?#\s]+/i.test(url) && hostOf(url) !== undefined

/** The production mint (`CASHU_MINT_URL`), whatever scheme, port or case it is written in. */
export const isProductionMint = (url: string): boolean => {
  const host = hostOf(url)
  return host !== undefined && host === hostOf(CASHU_MINT_URL)
}

/**
 * Sets the bridge, or clears it with `undefined`. Throws on a bridge or mint
 * URL that is not http(s), on the production mint as `mintUrl`, and on
 * `stubPay` without a `mintUrl`: the pay stub must never pair with a mint
 * that would take real money. A no-op in a release build.
 */
export const setCardBridge = (config: CardBridgeConfig | undefined): void => {
  if (!isDev()) return
  if (config === undefined) {
    bridge = undefined
    return
  }
  const { url, mintUrl, stubPay } = config
  if (!isHttpUrl(url)) throw new Error("card bridge: the bridge URL must be http(s)")
  if (mintUrl !== undefined) {
    if (!isHttpUrl(mintUrl)) throw new Error("card bridge: the mint URL must be http(s)")
    if (isProductionMint(mintUrl)) {
      throw new Error("card bridge: the production mint cannot be a dev mint override")
    }
  }
  if (stubPay && mintUrl === undefined) {
    throw new Error("card bridge: the pay stub needs a dev mint URL")
  }
  bridge = {
    url: url.replace(/\/+$/, ""),
    mintUrl: mintUrl?.replace(/\/+$/, ""),
    stubPay: Boolean(stubPay),
  }
}

/** The bridge in use; always undefined in a release build. */
export const getCardBridge = (): CardBridgeConfig | undefined =>
  isDev() ? bridge : undefined

/** The mint a card is read against and topped up at: the dev override, else `CASHU_MINT_URL`. */
export const cardMintUrl = (): string => getCardBridge()?.mintUrl ?? CASHU_MINT_URL

/**
 * `{kind: "paid"}` when the dev pay stub is on: a bridge with `stubPay` and
 * a dev mint that is not the production one. Undefined otherwise, and always
 * in a release build: the top-up then pays the mint's invoice for real.
 */
export const stubbedPayOutcome = (): PayOutcome | undefined => {
  const config = getCardBridge()
  if (!config?.stubPay || !config.mintUrl || isProductionMint(config.mintUrl)) {
    return undefined
  }
  return { kind: "paid" }
}

const fromHex = (hex: unknown): number[] => {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("card bridge: the answer is not hex")
  }
  return (hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16))
}

/**
 * A `Transceiver` over the bridge: one `POST /apdu` per APDU, bounded by the
 * same 5 s an NFC transceive gets. A non-2xx answer, a network error, a
 * timeout or a body that is not hex throws a plain `Error`, never a
 * `CardError`, so the card flows treat it as the tag leaving the field (no
 * re-read). An APDU is never retried: a lost answer to LOAD_PROOF,
 * CLEAR_SPENT or SET_PIN may have landed, and a replay would burn a second
 * slot or answer 6985.
 */
export const bridgeTransceiver =
  (url: string, timeoutMs: number = CARD_TRANSCEIVE_TIMEOUT_MS): Transceiver =>
  async (apdu) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let body: unknown
    try {
      const response = await fetch(`${url.replace(/\/+$/, "")}/apdu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hex: toHex(apdu) }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`card bridge: /apdu answered ${response.status}`)
      }
      body = await response.json()
    } catch (err) {
      // Only the class name: the request carried a PIN when it was VERIFY_PIN.
      if (err instanceof Error && err.message.startsWith("card bridge:")) throw err
      throw new Error(
        `card bridge: /apdu failed (${err instanceof Error ? err.name : typeof err})`,
      )
    } finally {
      clearTimeout(timer)
    }
    const bytes = fromHex((body as { hex?: unknown } | null)?.hex)
    if (bytes.length < 2) throw new Error("card bridge: the answer has no status word")
    return bytes
  }

/**
 * A dev link, `flash://dev/...`. The navigation container ignores these
 * (`navigation-container-wrapper.tsx`) so the `:payment` route never sees
 * one; `useDevCardLinks` acts on them, in development builds only.
 */
export const isDevLink = (url: string | null | undefined): boolean =>
  typeof url === "string" && /^flash:\/\/dev\//i.test(url)

/**
 * Reads a dev card link:
 * - `flash://dev/card-bridge?url=<bridge>&mint=<mint>&stubPay=1` sets the bridge,
 * - `flash://dev/card-bridge?off=1` clears it,
 * - `flash://dev/card-tap` asks for a tap, as the card controls do.
 *
 * Anything else, a bridge link without `url`, and every link in a release
 * build: undefined. The config is checked when it is set (`setCardBridge`),
 * not here.
 */
export const parseCardBridgeLink = (url: string): CardBridgeLink | undefined => {
  if (!isDev() || !isDevLink(url)) return undefined
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  const path = parsed.pathname.replace(/\/+$/, "")
  if (path === "/card-tap") return { kind: "tap" }
  if (path !== "/card-bridge") return undefined
  const params = parsed.searchParams
  if (params.get("off") === "1") return { kind: "bridge", config: undefined }
  const bridgeUrl = params.get("url")
  if (!bridgeUrl) return undefined
  const mintUrl = params.get("mint") || undefined
  return {
    kind: "bridge",
    config: { url: bridgeUrl, mintUrl, stubPay: params.get("stubPay") === "1" },
  }
}
