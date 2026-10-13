import type { CashuCardState } from "../../app/contexts/Flashcard"
import type { CardInfo, CardRecord } from "../../app/utils/cashu-card"

/** A 2.0 card's GET_INFO (P1 = 1) as `parseInfo` reads it: owned, PIN set, limits off. */
export const cardInfo = (overrides: Partial<CardInfo> = {}): CardInfo => ({
  version: "2.0",
  major: 2,
  minor: 0,
  maxSlots: 128,
  unspent: 3,
  spent: 5,
  empty: 120,
  secp256k1Native: true,
  schnorr: true,
  sealed: true,
  pinState: "set",
  format: 4,
  tries: 3,
  locked: false,
  recordSet: true,
  dailyLimit: 0,
  hasOwner: true,
  now: 1791814824,
  windowStart: 0,
  spentToday: 0,
  changeGrant: false,
  paymentLimit: 0,
  allowance: 0,
  nopinSpent: 0,
  ...overrides,
})

/** A 2.0 card's GET_CARD: forge's mint, no rolls yet, the budget at its default. */
export const cardRecord = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  format: 4,
  recordSet: true,
  unit: 0,
  dailyLimit: 0,
  lastHeader: "00".repeat(32),
  rolls: 0,
  rollBudget: 7,
  allowanceArmed: false,
  mint: "https://forge.flashapp.me",
  ...overrides,
})

/**
 * The card a screen shows (`FlashcardContext.cashuCard`): a 2.0 card holding
 * 1,500 sats, owned, its PIN set; owned by this phone unless `ownerKeySource`
 * is overridden to undefined.
 */
export const cashuCardState = (
  overrides: Partial<CashuCardState> = {},
): CashuCardState => ({
  ...cardInfo(),
  pubkey: "02" + "ab".repeat(32),
  balance: 1500,
  record: cardRecord(),
  keysets: [{ keysetId: "0059534ce0bfa19a", amount: 1500 }],
  unitTotals: { byUnit: [{ unit: "sat", amount: 1500 }], unknown: 0 },
  ownerKeySource: "seed",
  ...overrides,
})
