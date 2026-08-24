import {
  decodeInvoiceString,
  Network as NetworkLibGaloy,
  PaymentType,
} from "@galoymoney/client"

import { WalletCurrency } from "@app/graphql/generated"
import { networkForPaymentRequest } from "@app/screens/send-bitcoin-screen/invoice-expiry"

/**
 * The payment types a send-flow detail can carry — the same union
 * BasePaymentDetail uses. Typed against the @galoymoney/client constants so
 * the intraledger exclusion below is compiler-checked: a typo'd literal or a
 * renamed PaymentType member fails the build instead of silently re-enabling
 * the caveat on intraledger sends.
 */
type SendPaymentType =
  | typeof PaymentType.Intraledger
  | typeof PaymentType.Onchain
  | typeof PaymentType.Lightning
  | typeof PaymentType.Lnurl

/**
 * The payee node pubkey of a held bolt11, or undefined when there is no
 * invoice or it cannot be decoded.
 *
 * Fails closed for the disclosure's purposes: an undecodable invoice yields
 * undefined, which never matches a Flash node id, so the caveat still shows.
 * A decode quirk must not suppress the warning the #694 repro exists for.
 */
export const payeeNodePubkey = (
  paymentRequest: string | undefined,
): string | undefined => {
  if (!paymentRequest) return undefined
  const network = networkForPaymentRequest(paymentRequest)
  if (!network) return undefined
  try {
    return (
      decodeInvoiceString(paymentRequest, network as NetworkLibGaloy).payeeNodeKey ??
      undefined
    )
  } catch {
    return undefined
  }
}

const isFlashNodePayee = (
  destinationPayeePubkey: string | undefined,
  flashNodePubkeys: readonly string[] | undefined,
): boolean =>
  Boolean(
    destinationPayeePubkey &&
      flashNodePubkeys?.some(
        (pubkey) => pubkey.toLowerCase() === destinationPayeePubkey.toLowerCase(),
      ),
  )

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
 * - not a Flash-node invoice: a bolt11 minted by this instance's own
 *   lightning node settles inside the custodian — delivery is full-amount
 *   and the probed 0 is TRUE, so the caveat must stay silent (see below).
 *
 * Flash-to-Flash invoices — VERIFIED, not assumed (2026-08-24):
 * A Flash user paying another Flash user's (or a flash-pos merchant's)
 * pasted/scanned invoice is paymentType "lightning", not "intraledger", and
 * the backend probe is a blind pass-through to IBEX's estimate-fee (flash
 * `ln-usd-invoice-fee-probe.ts` → `Ibex.getLnFeeEstimation`, no
 * internal-invoice special-casing). Probing a freshly minted Flash-internal
 * invoice on the Test instance returned `{ amount: 0 }` with no errors — a
 * probed "set" zero. Without the payee check, the caveat would therefore
 * fire on every Flash-to-Flash invoice payment, teaching users to ignore it
 * exactly where the disclosure matters.
 *
 * The payee check compares the invoice's payee node pubkey against the
 * instance's `lnNodePubkeys` (galoy-instances.ts). `globals.nodesIds` was
 * the natural source, but it is empty on prod and test (verified live), so
 * the ids ship as per-instance config. Both the Test and Main entries are
 * pinned from freshly minted invoices decoded live (Main: five prod invoices
 * across two accounts, 2026-08-24, all paying IBEX_Ops1) — the re-verify
 * recipe is in galoy-instances.ts next to the field.
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
  destinationPayeePubkey,
  flashNodePubkeys,
}: {
  paymentType: SendPaymentType
  sendingWalletCurrency: WalletCurrency
  feeStatus: "loading" | "error" | "unset" | "set"
  feeAmount: number | undefined
  /** Payee node pubkey decoded from the held bolt11, when there is one. */
  destinationPayeePubkey?: string
  /** This instance's own lightning node ids (`lnNodePubkeys` in galoy-instances.ts). */
  flashNodePubkeys?: readonly string[]
}): boolean =>
  feeStatus === "set" &&
  feeAmount === 0 &&
  paymentType !== PaymentType.Intraledger &&
  (sendingWalletCurrency === WalletCurrency.Usd ||
    sendingWalletCurrency === WalletCurrency.Usdt) &&
  !isFlashNodePayee(destinationPayeePubkey, flashNodePubkeys)
