import { WalletCurrency } from "@app/graphql/generated"

/**
 * Whether the confirmation screen owes the customer the fee-from-amount
 * disclosure (#694).
 *
 * On external sends from cash wallets, the IBEX pre-send estimate for some
 * routes is 0 while settlement deducts the real routing fee FROM THE AMOUNT:
 * the repro was a $1.10 send that displayed "$0.00" fee, debited $1.10, and
 * delivered $1.07. The app cannot conjure the true fee pre-send — IBEX does
 * not provide it on those routes — so the honest move is to stop presenting
 * the 0 as a promise. Showing "$0.00" unqualified is a claim; this predicate
 * decides when that claim must carry the "deducted from the amount" caveat.
 *
 * The conditions, and why each is there:
 * - `status === "set"` with amount 0: a PROBED zero, the untrustworthy case.
 *   Errors and unset already render their own caveats.
 * - cash wallets only (USD/USDT): BTC-wallet fee probes price the actual
 *   route and a zero there is real (e.g. direct channel).
 * - external only: intraledger transfers genuinely cost nothing, and the
 *   caveat on them would teach users to ignore it exactly where it matters.
 *
 * A rare genuinely-free external route reads the soft copy ("may receive
 * slightly less") — a mild false positive, priced against the current false
 * NEGATIVE, which is a customer discovering the fee on the recipient side.
 */
export const shouldDiscloseFeeFromAmount = ({
  paymentType,
  sendingWalletCurrency,
  feeStatus,
  feeAmount,
}: {
  paymentType: string
  sendingWalletCurrency: WalletCurrency
  feeStatus: "loading" | "error" | "unset" | "set"
  feeAmount: number | undefined
}): boolean =>
  feeStatus === "set" &&
  feeAmount === 0 &&
  paymentType !== "intraledger" &&
  (sendingWalletCurrency === WalletCurrency.Usd ||
    sendingWalletCurrency === WalletCurrency.Usdt)
