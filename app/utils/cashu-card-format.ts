/**
 * A Cashu card's figures as the app says them (ENG-616): the card screen's
 * balance lines, and the scan sheet's while a read verifies the card
 * (ENG-707). Never converted through a price.
 */
import { mintDisplayName } from "@app/config/appinfo"
import type { CashuCardState } from "@app/contexts/Flashcard"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { ROLL_BUDGET_DEFAULT } from "@app/utils/cashu-card"
import type { CardLimits } from "@app/utils/cashu-card-owner"
import type { ReadBackField } from "@app/utils/cashu-card-owner-store"

type LLType = TranslationFunctions

// en-US grouping, as the app's own money formatting uses (use-display-currency).
const grouped = new Intl.NumberFormat("en-US")
const cents = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * An amount in its keyset unit's own terms, never converted through a price.
 * Slot amounts are in the keyset's base unit, "sats or cents"
 * (cashucard/cashucard spec/NUT-XX.md:86), so `sat` reads as sats and `usd` as
 * dollars and cents. The spec is silent on any other unit, so those show the
 * mint's number with the mint's unit code.
 */
export const formatUnitAmount = (amount: number, unit: string, LL: LLType): string => {
  switch (unit) {
    case "sat":
      return LL.FlashcardV2.amountInUnit({ amount: grouped.format(amount), unit: "sats" })
    case "usd":
      return LL.FlashcardV2.amountInUnit({
        amount: cents.format(amount / 100),
        unit: "USD",
      })
    default:
      return LL.FlashcardV2.amountInUnit({ amount: grouped.format(amount), unit })
  }
}

/**
 * The card's figures, one per unit the mint named. While a keyset on the card
 * has never been named (on this read or an earlier one:
 * `flashcardV2.keysetUnitsByMint`) and the mint has not answered, or when the tap
 * lost the keyset split so there was nothing to ask it, the card's own total
 * is shown labelled "unit unknown", never bare: GET_BALANCE adds every keyset
 * together and the card stores no unit. Value in a keyset the mint does not
 * list is shown the same way.
 */
export const balanceLines = (
  card: Pick<CashuCardState, "balance" | "keysets" | "unitTotals">,
  LL: LLType,
): { testID: string; text: string }[] => {
  const unknown = (amount: number) => ({
    testID: "flashcard-v2-balance-unknown",
    text: LL.FlashcardV2.unitUnknown({ amount: grouped.format(amount) }),
  })
  // An empty card has nothing to name a unit for; no need to wait on the mint.
  // A split that was not read (`keysets` undefined) is not an empty one.
  const totals =
    card.unitTotals ??
    (card.balance === 0 && card.keysets?.length === 0
      ? { byUnit: [], unknown: 0 }
      : undefined)
  if (!totals) return [unknown(card.balance)]
  const lines = totals.byUnit.map(({ unit, amount }) => ({
    testID: `flashcard-v2-balance-${unit}`,
    text: formatUnitAmount(amount, unit, LL),
  }))
  if (totals.unknown > 0) lines.push(unknown(totals.unknown))
  if (lines.length === 0) {
    lines.push({ testID: "flashcard-v2-balance-empty", text: LL.FlashcardV2.empty() })
  }
  return lines
}

/**
 * A mint's name as a sentence carries it (ENG-787): `mintDisplayName` in a
 * left-to-right isolate (U+2066 … U+2069), so a host such as
 * `mint.minibits.cash` reads whole, dots and all, inside a right-to-left
 * sentence, and cannot reorder the words around it.
 */
export const isolatedMintName = (url: string): string =>
  `\u2066${mintDisplayName(url)}\u2069`

/**
 * Setup's limits row (ENG-827): none, the daily limit when it is the only
 * one, or the holder's own. A no-PIN allowance or a per-payment limit is never
 * left out of a summary that names only the day's.
 */
export const limitsSummary = (limits: CardLimits, LL: LLType): string => {
  const othersOff =
    limits.payment === 0 &&
    limits.allowance === 0 &&
    limits.rollBudget === ROLL_BUDGET_DEFAULT
  if (!othersOff) return LL.FlashcardV2.setUpLimitsCustom()
  return limits.day > 0
    ? LL.FlashcardV2.setUpLimitsDaily({ day: grouped.format(limits.day) })
    : LL.FlashcardV2.setUpLimitsNone()
}

/**
 * What a setup not verified (ENG-827) has not confirmed, as "its owner, its
 * limits": every part when the record names none.
 */
export const unconfirmedWhat = (fields: readonly ReadBackField[], LL: LLType): string => {
  const all = fields.length === 0
  const isLimit = (field: ReadBackField) =>
    field === "dailyLimit" ||
    field === "paymentLimit" ||
    field === "allowance" ||
    field === "rollBudget"
  const parts: string[] = []
  if (all || fields.includes("owner")) parts.push(LL.FlashcardV2.setUpFieldOwner())
  if (all || fields.some(isLimit)) parts.push(LL.FlashcardV2.setUpFieldLimits())
  if (all || fields.includes("mint")) parts.push(LL.FlashcardV2.setUpFieldMint())
  if (
    all ||
    fields.some((field) => field !== "owner" && field !== "mint" && !isLimit(field))
  ) {
    parts.push(LL.FlashcardV2.setUpFieldRecord())
  }
  return parts.join(", ")
}
