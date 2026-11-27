// The confirm screen's last check before a send: the amount plus its fee
// against the balance of the wallet that pays. Free of react-native imports,
// so it runs under plain jest.
import { WalletCurrency } from "@app/graphql/generated"
import type { WalletAmount } from "@app/types/amounts"

/** Which balance the total is over, that it fits, or that it was not checked. */
export type AmountPlusFeeCheck =
  | "fits"
  | "overBtcBalance"
  | "overCashBalance"
  | "unchecked"

export type CheckAmountPlusFeeArgs = {
  settlementAmount: WalletAmount<WalletCurrency>
  /** The fee in the paying wallet's currency; no fee counts as nothing. */
  feeAmount?: WalletAmount<WalletCurrency> | null
  /** The Bitcoin Account balance in sats, undefined until it is read. */
  btcBalanceSats?: number | null
  /** The Cash Account balance in cents, USD or USDT, undefined until it is read. */
  cashBalanceCents?: number | null
  /** A send of the whole balance: nothing to check. */
  isSendingMax?: boolean
}

/**
 * Amount plus fee against the balance of the wallet that pays: sats for the
 * Bitcoin Account, cents for the Cash Account in USD and in USDT alike. A
 * balance not read yet does not fit. No fee counts as zero; a fee that could
 * not be read (NaN) does not fit.
 */
export const checkAmountPlusFee = ({
  settlementAmount,
  feeAmount,
  btcBalanceSats,
  cashBalanceCents,
  isSendingMax,
}: CheckAmountPlusFeeArgs): AmountPlusFeeCheck => {
  if (isSendingMax) return "unchecked"
  const fromBtc = settlementAmount.currency === WalletCurrency.Btc
  const fromCash =
    settlementAmount.currency === WalletCurrency.Usd ||
    settlementAmount.currency === WalletCurrency.Usdt
  if (!fromBtc && !fromCash) return "unchecked"
  const balance = fromBtc ? btcBalanceSats : cashBalanceCents
  const total = settlementAmount.amount + (feeAmount ? feeAmount.amount : 0)
  if (typeof balance === "number" && total <= balance) return "fits"
  return fromBtc ? "overBtcBalance" : "overCashBalance"
}
