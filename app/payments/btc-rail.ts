import {
  fetchBreezFee,
  getInfo,
  listPaymentsBreezSDK,
  payLightningBreez,
  payLnurlBreez,
  payOnchainBreez,
  receiveOnchainBreez,
  receivePaymentBreez,
} from "@app/utils/breez-sdk"

// The self-custodial BTC wallet as one seam (ENG-686, Phase 1a of ENG-684).
//
// `sendPayment` (./send-payment.ts) reaches Breez only through this type, so
// the caller decides which rail it gets: the confirmation screen's hook passes
// `breezBtcRail`, and a test passes a mock. Every signature is the existing
// `@app/utils/breez-sdk` wrapper's own, taken with `typeof`, so this file has
// no SDK import of its own and `app/utils/breez-sdk/spark.ts` stays the only
// module that imports `@breeztech/breez-sdk-spark-react-native` at runtime.
type SameAs<F extends (...args: never[]) => unknown> = (
  ...args: Parameters<F>
) => ReturnType<F>

export type BtcRail = {
  payInvoice: SameAs<typeof payLightningBreez>
  payLnurl: SameAs<typeof payLnurlBreez>
  payOnchain: SameAs<typeof payOnchainBreez>
  probeFee: SameAs<typeof fetchBreezFee>
  createInvoice: SameAs<typeof receivePaymentBreez>
  getOnchainAddress: SameAs<typeof receiveOnchainBreez>
  getBalanceSats: () => Promise<number>
  listPayments: SameAs<typeof listPaymentsBreezSDK>
}

// One-line delegates, resolved at call time. The send path uses only the three
// `pay*` methods today; the other five are here so the assistant (ENG-687)
// does not need a second interface change.
export const breezBtcRail: BtcRail = {
  payInvoice: (...args) => payLightningBreez(...args),
  payLnurl: (...args) => payLnurlBreez(...args),
  payOnchain: (...args) => payOnchainBreez(...args),
  probeFee: (...args) => fetchBreezFee(...args),
  createInvoice: (...args) => receivePaymentBreez(...args),
  getOnchainAddress: (...args) => receiveOnchainBreez(...args),
  // The same call and conversion BreezContext's updateBalance uses for
  // `btcWallet.balance`. It cannot read that context: it has to work outside
  // React.
  getBalanceSats: async () => Number((await getInfo()).balanceSats),
  listPayments: (...args) => listPaymentsBreezSDK(...args),
}
