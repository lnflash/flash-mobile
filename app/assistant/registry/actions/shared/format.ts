import type { WalletCurrency } from "@app/graphql/generated"
import {
  DisplayCurrency,
  MoneyAmount,
  WalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import type { ConvertMoneyAmountFn } from "@app/utils/price-conversion"
import type { DisplayFormatter } from "../../types"

// The card texts, formatted once by the tool through the app's own display
// formatter (useDisplayCurrency): a card never formats (spec §6). Each text
// shows its unit.

export type CardFormat = { convert: ConvertMoneyAmountFn; display: DisplayFormatter }

/**
 * A wallet amount in the display currency, with the wallet amount beside it
 * when the two currencies differ: "J$500.00 ($3.18)". `primary`, when the
 * user named the amount in a unit of their own, leads instead.
 */
export const amountText = (
  amount: WalletAmount<WalletCurrency>,
  { convert, display }: CardFormat,
  primary?: MoneyAmount<WalletOrDisplayCurrency>,
): string =>
  display.formatDisplayAndWalletAmount({
    primaryAmount: primary,
    displayAmount: convert(amount, DisplayCurrency),
    walletAmount: amount,
  })
