// Localized note strings for the MAX chip.
//
// Split out of send-bitcoin-details-screen so the wording is unit-testable
// without mounting the send flow (mirrors app/utils/breez-sdk/fee-error-message.ts,
// which renders some of the same sentences for the validation banner). That
// overlap is the point: `recipientMin` and breezFeeErrorMessage's
// "amount-below-min" arm are one sentence about one limit, and on the BTC
// LNURL path both can be on screen at once. Rendering the sat amount two
// different ways there reads as two different limits, so both go through the
// caller's `formatSats`.

import type { TranslationFunctions } from "@app/i18n/i18n-types"

import type { MaxAmountButtonStrings } from "./max-amount-button"

/**
 * Bind the chip's note builders to the current locale.
 *
 * `formatSats` converts a sat amount into the user's display format
 * (e.g. "$0.65 (1,000 sats)") — the same function the fee-error banner uses.
 */
export const maxAmountButtonStrings = (
  LL: TranslationFunctions,
  formatSats: (sats: number) => string,
): MaxAmountButtonStrings => ({
  intraledger: () => LL.AmountInputScreen.maxNoteIntraledger(),
  feeReserved: (fee) => LL.AmountInputScreen.maxNoteFeeReserved({ fee }),
  recipientCap: (max) => LL.AmountInputScreen.maxNoteRecipientCap({ max }),
  feeUnknown: () => LL.AmountInputScreen.maxNoteFeeUnknown(),
  recipientMin: (minSats) =>
    LL.SendBitcoinScreen.minReceiveAmountError({ amount: formatSats(minSats) }),
  feeTooLarge: () => LL.AmountInputScreen.maxNoteFeeTooLarge(),
})
