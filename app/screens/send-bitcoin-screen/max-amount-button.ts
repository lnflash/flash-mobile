// Factory for the MAX chip the send flow hands to the amount input screen
// (issue #512). Payment knowledge stays in the send flow — the amount screen
// just renders the chip and applies the computed amount.
//
// Dependency-injected so the glue between the send flow and the max
// computation — the Breez fetchFee adapter's err-to-null mapping, the
// knownPayRequest reuse, the USD probe-detail construction via setAmount,
// and the note-kind → string mapping — is unit-testable under plain jest
// (mirrors max-send-amount.ts, which this builds on).

import {
  computeMaxSendAmount,
  effectiveMaxPaymentType,
  maxChipSupportsPaymentType,
  MaxSendPaymentType,
  MaxSendWalletCurrency,
  noteForResult,
  resolveRecipientCap,
} from "./max-send-amount"

/** Structural stand-in for MoneyAmount — keeps this module RN-free. */
type MoneyAmountShape = { amount: number }

/** Localized note builders — the caller binds these to LL.AmountInputScreen. */
export type MaxAmountButtonStrings = {
  /** maxNoteIntraledger: "No fee between Flash accounts." */
  intraledger: () => string
  /** maxNoteFeeReserved: "~{fee} reserved for the network fee." */
  feeReserved: (fee: string) => string
  /** maxNoteRecipientCap: "Recipient can receive at most {max}." */
  recipientCap: (max: string) => string
}

export type BuildMaxAmountButtonArgs<M extends MoneyAmountShape, F, P> = {
  /** PaymentDetail.canSetAmount — no chip when the amount is fixed. */
  canSetAmount: boolean
  paymentType: MaxSendPaymentType
  walletCurrency: MaxSendWalletCurrency
  /** Sending wallet balance in minor units — may be FRACTIONAL cents. */
  balanceMoneyAmount: M
  /** Fee-probe destination when no flash address is known. */
  destination: string
  flashUserAddress?: string
  selectedFeeType?: "fast" | "medium" | "slow"
  /**
   * A pay request already resolved by the screen — reusing it lets Breez
   * probes skip a second network round-trip to the receiver's LNURL service.
   */
  knownPayRequest?: P
  /** Receiver's resolved LNURL maxSendable in sats (BTC-wallet path). */
  receiverMaxSats: number | null
  /** The destination's lnurlParams.max in sats (USD-wallet LNURL path). */
  lnurlParamsMaxSats: number | null
  /** Convert sats into the sending wallet's minor units. */
  convertSatsToWallet: (sats: number) => number
  /** Breez fee probe (BTC wallet). */
  fetchBreezFee: (args: {
    paymentType: MaxSendPaymentType
    paymentRequest: string
    amountSats: number
    selectedFeeType?: "fast" | "medium" | "slow"
    knownPayRequest?: P
  }) => Promise<{ fee: number | null; err: unknown }>
  /** PaymentDetail.setAmount — builds the USD probe detail. */
  setAmount?: (amount: M) => { getFee?: F }
  /** IBEX fee probe (USD wallet) over a probe detail's getFee. */
  getIbexFee: (getFee: F | undefined) => Promise<MoneyAmountShape | undefined>
  /** moneyAmountToDisplayCurrencyString — undefined when no rate is known. */
  formatDisplayAmount: (moneyAmount: M) => string | undefined
  strings: MaxAmountButtonStrings
}

/** Structurally matches the amount screen's MaxAmountButton prop. */
export type BuiltMaxAmountButton<M extends MoneyAmountShape> = {
  disabled: boolean
  compute: () => Promise<{ amount: M; note?: string } | null>
}

export const buildMaxAmountButton = <M extends MoneyAmountShape, F, P>({
  canSetAmount,
  paymentType,
  walletCurrency,
  balanceMoneyAmount,
  destination,
  flashUserAddress,
  selectedFeeType,
  knownPayRequest,
  receiverMaxSats,
  lnurlParamsMaxSats,
  convertSatsToWallet,
  fetchBreezFee,
  setAmount,
  getIbexFee,
  formatDisplayAmount,
  strings,
}: BuildMaxAmountButtonArgs<M, F, P>): BuiltMaxAmountButton<M> | undefined => {
  if (!canSetAmount || !setAmount) {
    return undefined
  }
  // Onchain is out of scope for the chip: its fee needs the user's selected
  // speed (not chosen yet at this point) and the onchain flow already has
  // its own send-all "Max" affordance (DetailAmountNote / canSendMax).
  if (!maxChipSupportsPaymentType(paymentType)) {
    return undefined
  }

  const isBtcWallet = walletCurrency === "BTC"

  // BTC-wallet intraledger sends settle via LNURL-pay with a real Breez
  // fee — only USD-wallet intraledger is truly fee-free. The effective
  // type routes BTC-wallet intraledger through the fee path.
  const maxPaymentType = effectiveMaxPaymentType(walletCurrency, paymentType)

  const withAmount = (amount: number): M => ({ ...balanceMoneyAmount, amount })

  // probeAmount is the balance clamped to the recipient cap (computed by
  // computeMaxSendAmount). Probing at the raw balance would trip the LUD-06
  // bounds validation inside fetchBreezFee whenever the cap binds, losing
  // the fee estimate exactly when the fee headroom check matters.
  const fetchFee = async (probeAmount: number): Promise<number | null> => {
    if (isBtcWallet) {
      const { fee, err } = await fetchBreezFee({
        paymentType,
        paymentRequest: flashUserAddress || destination,
        amountSats: probeAmount,
        selectedFeeType,
        knownPayRequest,
      })
      return err ? null : fee
    }
    // USD wallet: probe through the same fee probes the send flow already
    // uses. LNURL destinations have no probe before an invoice exists —
    // getIbexFee resolves undefined and the computation falls back to the
    // full balance.
    const fee = await getIbexFee(setAmount(withAmount(probeAmount)).getFee)
    return fee?.amount ?? null
  }

  // Receiver's LNURL maxSendable bound, in wallet minor units.
  const recipientCap = resolveRecipientCap({
    walletCurrency,
    paymentType,
    receiverMaxSats,
    lnurlParamsMaxSats,
    convertSatsToWallet,
  })

  return {
    // Floor before comparing: a fractional-cent residue (e.g. 0.9346 left
    // after a MAX send drains a USD wallet) is not spendable — the
    // computation floors it to a zero max, so the chip must grey out.
    // `!(x > 0)` rather than `x <= 0`: a NaN balance (wallets still
    // loading — the screen queries with returnPartialData) must disable
    // the chip too, and NaN fails every comparison.
    disabled: !(Math.floor(balanceMoneyAmount.amount) > 0),
    compute: async () => {
      const result = await computeMaxSendAmount({
        paymentType: maxPaymentType,
        balance: balanceMoneyAmount.amount,
        fetchFee,
        recipientCap,
      })

      // Nothing spendable: leave the pad untouched rather than filling an
      // empty amount under a solid MAX chip. A zero max arrives on several
      // routes, not just "zero-balance" — a fee estimate that meets or
      // exceeds the balance yields { amount: 0, reason: "fee-reserved" },
      // and a receiver advertising maxSendable 0 yields a zero cap — so
      // gate on the amount itself.
      if (result.amount <= 0) {
        return null
      }

      const noteDecision = noteForResult(result)
      let note: string | undefined
      if (noteDecision.kind === "intraledger") {
        note = strings.intraledger()
      } else if (noteDecision.kind === "fee-reserved") {
        const feeString = formatDisplayAmount(withAmount(noteDecision.feeReserved))
        note = feeString ? strings.feeReserved(feeString) : undefined
      } else if (noteDecision.kind === "recipient-cap") {
        const capString = formatDisplayAmount(withAmount(noteDecision.cap))
        note = capString ? strings.recipientCap(capString) : undefined
      }

      return {
        amount: withAmount(result.amount),
        note,
      }
    },
  }
}
