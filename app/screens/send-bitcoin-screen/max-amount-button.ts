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
  MaxSendNote,
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
  /** maxNoteFeeUnknown — shown when the destination cannot be priced. */
  feeUnknown: () => string
  /** minReceiveAmountError — the receiver's own lower bound, in sats. */
  recipientMin: (minSats: number) => string
  /** maxNoteFeeTooLarge — shown when the fee swallows the whole balance. */
  feeTooLarge: () => string
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
  /**
   * Receiver's LNURL minSendable in sats, or null when unknown.
   *
   * The Breez probe reports this itself (as an `amount-below-min` error), but
   * the LNURL mint does not: lnurl-pay throws a bare Error("Invalid amount")
   * client-side for a sat count outside [min, max], which collapses into the
   * same null as a network blip and produces "couldn't estimate the fee — tap
   * MAX again" — a retry loop that cannot succeed. Checking here is what turns
   * that into the receiver's actual minimum.
   *
   * It bounds two things, on every wallet: the amount probed (above) and the
   * amount proposed (in `compute`). The fee is subtracted between them, so
   * clearing the first says nothing about clearing the second.
   */
  receiverMinSats: number | null
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
  /**
   * Price an LNURL send of `probeAmount` (wallet minor units).
   *
   * An LNURL detail only gains a `getFee` once an invoice is attached
   * (payment-details/lightning.ts sets canGetFee false until then), so the
   * plain IBEX probe cannot price this destination at all — that gap is what
   * made MAX offer an unsendable amount. Implementations mint a throwaway
   * invoice at the probe amount purely to price it; it is never paid, and the
   * send flow mints its own on Next. Resolve null when the destination cannot
   * be priced.
   *
   * Required, like fetchBreezFee and getIbexFee: a caller that forgets to wire
   * it must fail to compile, not silently degrade every USD LNURL send to
   * "couldn't estimate".
   */
  probeLnurlFee: (probeAmount: number) => Promise<number | null>
  /** moneyAmountToDisplayCurrencyString — undefined when no rate is known. */
  formatDisplayAmount: (moneyAmount: M) => string | undefined
  strings: MaxAmountButtonStrings
}

/** Structurally matches the amount screen's MaxAmountButton prop. */
export type BuiltMaxAmountButton<M extends MoneyAmountShape> = {
  disabled: boolean
  compute: () => Promise<{ amount?: M; note?: string } | null>
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
  receiverMinSats,
  convertSatsToWallet,
  fetchBreezFee,
  setAmount,
  getIbexFee,
  probeLnurlFee,
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

  // The receiver's LUD-06 floor, carried in both units: sats for the message
  // (the receiver advertises it in sats, and that is what their error will say)
  // and wallet minor units for every comparison against an amount. Resolved
  // once so the probe guard and the result guard can never drift apart —
  // they are the two halves of one bound.
  const recipientMin =
    receiverMinSats !== null && Number.isFinite(receiverMinSats)
      ? { sats: receiverMinSats, wallet: convertSatsToWallet(receiverMinSats) }
      : null

  // The Breez probe returns a TYPED reason (below the receiver's minimum,
  // above their maximum, offline...). Collapsing it into the same null as a
  // network blip costs the user the only actionable half of the message: on
  // main a null fee still filled the balance, so committing it surfaced
  // "The minimum this recipient can receive is N sats". Now that no amount is
  // proposed, this is the only place that reason can still reach them.
  let lastFeeError: { kind: string; minSats?: number } | null = null

  // Note kind → localized string. Undefined only where there is genuinely
  // nothing worth saying: an unremarkable result, or a money note with no
  // display rate to format it against.
  const noteFor = (decision: MaxSendNote): string | undefined => {
    switch (decision.kind) {
      case "intraledger":
        return strings.intraledger()
      case "fee-reserved": {
        const feeString = formatDisplayAmount(withAmount(decision.feeReserved))
        return feeString ? strings.feeReserved(feeString) : undefined
      }
      case "fee-too-large":
        return strings.feeTooLarge()
      case "fee-unknown": {
        // Prefer the receiver's own lower bound over a generic "couldn't
        // estimate": it is the half of the message the user can act on.
        const minSats =
          lastFeeError?.kind === "amount-below-min" ? lastFeeError.minSats : undefined
        return minSats ? strings.recipientMin(minSats) : strings.feeUnknown()
      }
      case "recipient-cap": {
        const capString = formatDisplayAmount(withAmount(decision.cap))
        return capString ? strings.recipientCap(capString) : undefined
      }
      default:
        return undefined
    }
  }

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
      lastFeeError = (err as { kind: string; minSats?: number } | null) ?? null
      return err ? null : fee
    }
    // USD wallet. An LNURL destination has no invoice yet, so there is
    // nothing for the plain IBEX probe to price — mint one at the probe
    // amount and price that instead.
    if (paymentType === "lnurl") {
      // The receiver's floor, checked before we ask them for an invoice.
      // Below it the mint throws a bare Error("Invalid amount") that reads as
      // "couldn't estimate the fee — tap MAX again", and no number of taps
      // ever will: a $4.42 balance is 221 sats against a 1_000-sat
      // minSendable. Report the bound instead — the only half of this the
      // user can act on. (The recipient cap handles the other end: it clamps
      // the probe, so a probe amount can only ever be too small here.)
      if (recipientMin !== null && recipientMin.wallet > probeAmount) {
        lastFeeError = { kind: "amount-below-min", minSats: recipientMin.sats }
        return null
      }
      // Clear a minimum recorded by an earlier tap: a later generic failure
      // must not borrow its message.
      lastFeeError = null
      return probeLnurlFee(probeAmount)
    }
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

      // The receiver's floor guards the probe INPUT; this guards the number
      // the chip actually puts in the pad — the other half of the same bound,
      // and the half the user sees. They are not the same check: the fee is
      // subtracted between them, so any balance in [min, min + fee + slack)
      // clears the probe and still lands below the floor. On the BTC wallet
      // that shows as a chip filling 499 sats under "~2,500 sats reserved for
      // the network fee" with "the minimum this recipient can receive is
      // 1,000 sats" painted directly beneath it; on the USD wallet, where no
      // local check compares like units, it shows as the LNURL mint throwing
      // Error("Invalid amount") on Next and the screen blaming the fetch —
      // ENG-554's own symptom, reproduced by the chip meant to end it.
      //
      // The cap is applied to the result (max-send-amount.ts), so the floor
      // must be too. Propose nothing and name the bound: no amount over this
      // balance is sendable to this receiver, so the tap has no number to
      // offer — only the reason.
      if (
        recipientMin !== null &&
        result.amount > 0 &&
        result.amount < recipientMin.wallet
      ) {
        return { note: strings.recipientMin(recipientMin.sats) }
      }

      const note = noteFor(noteForResult(result))

      // Nothing spendable: leave the pad untouched rather than filling an
      // empty amount under a solid MAX chip. A zero max arrives on several
      // routes, not just "zero-balance" — a fee that swallows the balance
      // yields { amount: 0, reason: "fee-exceeds-balance" }, an unpriceable
      // destination yields "fee-unavailable", and a receiver advertising
      // maxSendable 0 yields a zero cap — so gate on the amount itself.
      //
      // Each of those the user can act on (top up, retry, enter an amount by
      // hand) explains itself: a tap that proposes nothing and says nothing
      // is indistinguishable from a broken chip. Only a wordless zero — the
      // zero-balance route, which cannot be tapped because the chip is
      // disabled for it — falls through to null.
      if (result.amount <= 0) {
        return note ? { note } : null
      }

      return {
        amount: withAmount(result.amount),
        note,
      }
    },
  }
}
