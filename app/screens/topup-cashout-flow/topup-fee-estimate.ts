export type FygaroTopupFeeParams = {
  processorFeePercent: number
  processorFeeFixed: number
  flashFeePercent: number
  flashFeeFixed: number
}

/**
 * The net USD amount credited to the wallet after a Fygaro card top-up, given
 * the fee parameters the backend exposes (Globals.fygaroTopup). Mirrors the
 * backend fee model: a payment-processor fee (percentage of the gross plus a
 * fixed amount) and a Flash fee (percentage plus fixed) are both taken off the
 * gross. Percentages are whole-number percents (2.99 = 2.99%); fixed fees and
 * the returned value are in USD dollars. Never negative — a gross smaller than
 * the fixed fees yields 0, not a negative "you'll receive".
 *
 * The authoritative credited amount is still computed backend-side from the
 * settled Fygaro payment; this only previews it for the amount entry screen.
 */
export const estimateTopupNet = (
  grossDollars: number,
  params: FygaroTopupFeeParams,
): number => {
  if (!(grossDollars > 0)) return 0
  const processorFee =
    (grossDollars * params.processorFeePercent) / 100 + params.processorFeeFixed
  const flashFee = (grossDollars * params.flashFeePercent) / 100 + params.flashFeeFixed
  return Math.max(0, grossDollars - processorFee - flashFee)
}
