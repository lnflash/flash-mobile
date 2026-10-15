/**
 * A Cashu card's figures as the app says them (ENG-616): the card screen's
 * balance lines, and the scan sheet's while a read verifies the card
 * (ENG-707). Never converted through a price.
 */
import type { CashuCardState } from "@app/contexts/Flashcard"
import type { TranslationFunctions } from "@app/i18n/i18n-types"

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
 * (cashu-javacard spec/NUT-XX.md:86), so `sat` reads as sats and `usd` as
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
 * `flashcardV2.keysetUnits`) and the mint has not answered, or when the tap
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
