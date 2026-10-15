import { cardMintUrl } from "../cashu-card-bridge"
import { TopUpMint, createTopUpMint } from "./mint"
import { createTopUpStore } from "./store"

/**
 * One store for the whole app: its write queue is what keeps two screens (and
 * the card context's tidy offer, ENG-702) from saving over each other. One
 * client for the connected mint, so its keysets are fetched once; a new one
 * only when a development build points the card at another mint
 * (`cardMintUrl`). A saved top-up or tidy stays bound to the mint that
 * issued it (`mintUrl`): the engine neither asks about, pays, mints nor drops
 * one through another mint, so one started against a dev mint is left alone
 * by the production one, and the other way round.
 */
export const topUpStore = createTopUpStore()

let connectedMint: TopUpMint | undefined
export const topUpMint = (): TopUpMint => {
  const url = cardMintUrl()
  if (connectedMint?.url !== url) connectedMint = createTopUpMint(url)
  return connectedMint
}
