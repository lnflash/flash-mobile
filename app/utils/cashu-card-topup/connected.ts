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

/** Never open: forge alone, until Remote Config names others (`setCardFundMints`). */
const FORGE_ONLY: readonly string[] = [CASHU_MINT_URL]

let fundMints: readonly string[] = FORGE_ONLY

/**
 * The mints the Cash wallet may pay for a card top-up (ENG-787 decision 1):
 * Remote Config's `cardFundMints`, forge alone by default. Reads, fees,
 * units, tidies and reclaims never check it, and a top-up already paid is
 * finished whatever it says now.
 */
export const cardFundMints = (): readonly string[] => fundMints

/** Set by the feature-flag provider; an empty list means forge alone, never none. */
export const setCardFundMints = (mints: readonly string[]): void => {
  fundMints = mints.length > 0 ? [...mints] : FORGE_ONLY
}

/**
 * Whether a card at `url` may be funded from the Cash wallet: the dev
 * bridge's own mint (`cardMintUrl()`, forge in a release build), or one on
 * the fund list (`mints`, `cardFundMints()` unless given).
 */
export const isFundMint = (
  url: string,
  mints: readonly string[] | undefined = cardFundMints(),
): boolean =>
  sameMint(url, cardMintUrl()) ||
  (mints.length > 0 ? mints : FORGE_ONLY).some((mint) => sameMint(mint, url))
