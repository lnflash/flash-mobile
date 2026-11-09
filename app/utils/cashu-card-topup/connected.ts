import { CASHU_MINT_URL } from "@app/config/appinfo"

import type { CardRecord } from "../cashu-card"
import { cardMintUrl, getCardBridge } from "../cashu-card-bridge"
import { TopUpError } from "./engine"
import { TopUpMint, createTopUpMint } from "./mint"
import { CardMintCheck, mintKey, normalizeCardMint, sameMint } from "./mint-url"
import { createTopUpStore } from "./store"

/**
 * One store for the whole app: its write queue is what keeps two screens (and
 * the card context's tidy offer, ENG-702) from saving over each other. One
 * client per mint (ENG-787), so each mint's keysets are fetched once: a card
 * is read, priced, topped up, tidied and reclaimed at the mint its record
 * names (`mintOfCard`). A saved top-up or tidy stays bound to the mint that
 * issued it (`mintUrl`): the engine neither asks about, pays, mints nor drops
 * one through another mint.
 */
export const topUpStore = createTopUpStore()

const clients = new Map<string, TopUpMint>()

/** The app's one client for the mint at `url` (`mintKey`), made on first use. */
export const topUpMint = (url: string): TopUpMint => {
  const key = mintKey(url)
  let client = clients.get(key)
  if (!client) {
    client = createTopUpMint(url)
    clients.set(key, client)
  }
  return client
}

/**
 * `normalizeCardMint` as this build allows it: http only while a development
 * build's card bridge is set (its mint is local).
 */
export const checkCardMint = (input: string): CardMintCheck =>
  normalizeCardMint(input, { allowHttp: getCardBridge() !== undefined })

/**
 * The mint a card is read, priced, topped up, tidied and reclaimed at: the
 * one its record names (GET_CARD), as `checkCardMint` normalizes it. A card
 * whose record is not set yet (never set up) has none of its own and goes by
 * `cardMintUrl()`. A record mint this app cannot use (not https, too long,
 * not ASCII) is refused (`state`): it is never swapped for another mint.
 */
export const mintOfCard = (record: Pick<CardRecord, "recordSet" | "mint">): string => {
  if (!record.recordSet) return cardMintUrl()
  const checked = checkCardMint(record.mint)
  if (!checked.ok) {
    throw new TopUpError("state", `the card's mint cannot be used (${checked.reason})`)
  }
  return checked.url
}

/** `mintOfCard`, or undefined where it refuses. */
export const mintOfCardOrUndefined = (
  record: Pick<CardRecord, "recordSet" | "mint"> | undefined,
): string | undefined => {
  if (!record) return undefined
  try {
    return mintOfCard(record)
  } catch {
    return undefined
  }
}

/**
 * Whether a card at `url` is a forge card: the one mint Flash tills take
 * today. A card at any other mint is still read, topped up, tidied and
 * reclaimed at its own (ENG-831: no fund list); this only decides the till
 * note. Remove when ENG-788 ships (tills load and settle at any mint).
 */
export const isForgeMint = (url: string): boolean => sameMint(url, CASHU_MINT_URL)
