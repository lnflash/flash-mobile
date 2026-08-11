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
 * The arithmetic is done in integer cents, rounding EACH fee component to the
 * nearest cent before subtracting, exactly as the backend does (flash#473):
 *   processor_cents = round(gross_cents * pct / 100) + round(fixed * 100)
 *   flash_cents     = round(gross_cents * pct / 100) + round(fixed * 100)
 *   net_cents       = gross_cents - processor_cents - flash_cents
 * Doing it in floating-point dollars and rounding only the displayed total
 * diverges from the credited amount by a cent for a large fraction of
 * non-round amounts (e.g. $10.25 → the float model shows $9.25, the backend
 * credits $9.24), so the preview must reproduce the backend's rounding.
 *
 * The authoritative credited amount is still computed backend-side from the
 * settled Fygaro payment; this only previews it for the amount entry screen.
 */
export const estimateTopupNet = (
  grossDollars: number,
  params: FygaroTopupFeeParams,
): number => {
  const gross = Math.round(grossDollars * 100)
  if (gross <= 0) return 0
  const processor =
    Math.round((gross * params.processorFeePercent) / 100) +
    Math.round(params.processorFeeFixed * 100)
  const flash =
    Math.round((gross * params.flashFeePercent) / 100) +
    Math.round(params.flashFeeFixed * 100)
  return Math.max(0, gross - processor - flash) / 100
}
