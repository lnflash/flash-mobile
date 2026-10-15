import {
  getInfo,
  listPaymentsBreezSDK,
  payLightningBreez,
  payLnurlBreez,
  payOnchainBreez,
} from "@app/utils/breez-sdk"
import {
  BreezSdkNotInitializedError,
  BreezSdkNotRunningReason,
} from "@app/utils/breez-sdk/sdk-errors"

// The self-custodial BTC wallet as one seam (ENG-686, Phase 1a of ENG-684).
//
// `sendPayment` (./send-payment.ts) reaches Breez only through this type, so
// the caller decides which rail it gets: the confirmation screen's hook passes
// `breezBtcRail`, and a test passes a mock. Every signature is the existing
// `@app/utils/breez-sdk` wrapper's own, taken with `typeof`, so this file does
// not import `@breeztech/breez-sdk-spark-react-native` itself.
//
// `app/utils/breez-sdk/spark.ts` is the only module that calls the SDK.
// Other modules import SDK enums and types, and ENG-693 moves those behind
// this rail.
type SameAs<F extends (...args: never[]) => unknown> = (
  ...args: Parameters<F>
) => ReturnType<F>

/**
 * The BTC wallet's balance, in one of four states. Only `ok` carries a
 * number, on purpose: a screen or a reply that shows one must not be able to
 * show a stale figure or a zero for a wallet it could not read.
 *
 * - `ok`: a synced read, in sats.
 * - `syncing`: the SDK is starting, or its synced read did not answer within
 *   BTC_BALANCE_SYNC_TIMEOUT_MS.
 * - `disabled`: the SDK is not running. Breez starts only in advance mode
 *   (BreezContext.tsx), so with advance mode off this is the normal answer.
 * - `failed`: the SDK is not running because its start gave up (offline at
 *   launch, say). Advance mode is on, so this is not `disabled`, whose reply
 *   sends the user to a setting that is already on.
 */
export type BtcBalance =
  | { state: "ok"; sats: number }
  | { state: "syncing" }
  | { state: "disabled" }
  | { state: "failed" }

/** The states of a BTC wallet that has no figure to give. */
export type BtcUnavailableState = Exclude<BtcBalance["state"], "ok">

/**
 * How long `getBalanceSats` waits on Breez's synced read (`getInfo()` asks the
 * SDK for `ensureSynced: true`) before it answers `syncing`. The read is not
 * cancelled: a late answer is dropped, never written over a newer one.
 */
export const BTC_BALANCE_SYNC_TIMEOUT_MS = 10_000

// The rail grows by ticket (docs/ai-assistant-tool-registry.md §2.1): ENG-686
// shipped the three sends, ENG-687 adds the two reads its assistant tools
// call (getBalanceSats and listPayments), and ENG-688 adds createInvoice,
// getOnchainAddress and probeFee. Each takes the shape the spec gives it,
// which is not always a wrapper's own: getBalanceSats answers a BtcBalance
// state where getInfo() throws while the SDK is not running.
export type BtcRail = {
  getBalanceSats: () => Promise<BtcBalance>
  listPayments: SameAs<typeof listPaymentsBreezSDK>
  payInvoice: SameAs<typeof payLightningBreez>
  payLnurl: SameAs<typeof payLnurlBreez>
  payOnchain: SameAs<typeof payOnchainBreez>
}

const UNAVAILABLE_STATE: Record<BreezSdkNotRunningReason, BtcUnavailableState> = {
  off: "disabled",
  starting: "syncing",
  failed: "failed",
}

/**
 * Which not-running state an error from the wallet stands for: `disabled`
 * when the wallet is off, `syncing` while initializeBreezSDK() is still
 * connecting, `failed` once it has given up. Any other error is a real
 * failure and gets `undefined`, so the caller can let it reject.
 */
export const btcRailUnavailableState = (
  err: unknown,
): BtcUnavailableState | undefined => {
  if (!(err instanceof BreezSdkNotInitializedError)) return undefined
  return UNAVAILABLE_STATE[err.reason]
}

type BreezWalletInfo = Awaited<ReturnType<typeof getInfo>>

/**
 * One read of the Breez wallet: the balance state, plus, on a good read, the
 * whole `getInfo()` answer for the caller that needs more of it than the sats.
 */
export type BreezWalletRead =
  | { state: "ok"; sats: number; info: BreezWalletInfo }
  | { state: BtcUnavailableState }

const SYNC_TIMED_OUT = Symbol("Breez synced read timed out")

const withSyncTimeout = <T>(
  read: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T | typeof SYNC_TIMED_OUT> => {
  if (timeoutMs === undefined) return read
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<typeof SYNC_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(SYNC_TIMED_OUT), timeoutMs)
  })
  // The read keeps going after a timeout. Its late answer is dropped, and a
  // late rejection lands on the handler race() attached, so it is never an
  // unhandled one.
  return Promise.race([read, timedOut]).finally(() => clearTimeout(timer))
}

/**
 * The single place the BTC balance is read and converted. `breezBtcRail`'s
 * getBalanceSats and BreezContext's balance both come from here, so the home
 * screen and the assistant cannot report different sats for the same answer
 * from the SDK (spec v0.2.5, "one BTC balance source").
 *
 * The SDK answers `balanceSats` as a bigint; it becomes a number as
 * BreezContext always made it, with `Number()`. A wallet that is not running
 * is reported as such and never as zero. Without `syncTimeoutMs` the read
 * waits for the synced answer however long it takes, which is what
 * BreezContext has always done.
 */
export const readBreezWallet = async ({
  syncTimeoutMs,
}: { syncTimeoutMs?: number } = {}): Promise<BreezWalletRead> => {
  let info: BreezWalletInfo | typeof SYNC_TIMED_OUT
  try {
    info = await withSyncTimeout(getInfo(), syncTimeoutMs)
  } catch (err) {
    const state = btcRailUnavailableState(err)
    if (state) return { state }
    throw err
  }
  if (info === SYNC_TIMED_OUT) return { state: "syncing" }
  return { state: "ok", sats: Number(info.balanceSats), info }
}

export const breezBtcRail: BtcRail = {
  // Not a one-line delegate: getInfo() throws while the SDK is not running,
  // and the rail owes a BtcBalance. Any other failure still rejects.
  getBalanceSats: async () => {
    const read = await readBreezWallet({ syncTimeoutMs: BTC_BALANCE_SYNC_TIMEOUT_MS })
    return read.state === "ok" ? { state: "ok", sats: read.sats } : { state: read.state }
  },
  // One-line delegates, resolved at call time.
  listPayments: (...args) => listPaymentsBreezSDK(...args),
  payInvoice: (...args) => payLightningBreez(...args),
  payLnurl: (...args) => payLnurlBreez(...args),
  payOnchain: (...args) => payOnchainBreez(...args),
}
