/**
 * Why the BTC wallet is not there to read:
 *
 * - `off`: the user switched the wallet off (advance mode is off), whether
 *   or not an SDK instance still runs or a start is still connecting, since
 *   turning advance mode off stops neither. Also a wallet never started
 *   (Breez starts only in advance mode) or disconnected.
 * - `starting`: `initializeBreezSDK()` is connecting.
 * - `failed`: the last `initializeBreezSDK()` gave up (it retries, then
 *   throws), offline at launch for instance. Advance mode is on: the wallet
 *   is meant to run and could not start, which is not the same as off.
 */
export type BreezSdkNotRunningReason = "off" | "starting" | "failed"

/**
 * Thrown by `getSDKInstance()` (./spark.ts) when there is no SDK instance to
 * call, with the reason, and by `assertBreezSDKSwitchedOn()` (reason `off`)
 * before the BTC rail reads a wallet the user switched off.
 *
 * It has its own class so a caller can tell "the BTC wallet is not running"
 * from a call that failed. `breezBtcRail.getBalanceSats` (app/payments/
 * btc-rail.ts) reports it as a `disabled`, `syncing` or `failed` state,
 * never as a failure of the read and never as a zero balance
 * (docs/ai-assistant-tool-registry.md §2.1). The message is the one the
 * plain `Error` it replaces carried.
 *
 * This module imports nothing from the SDK, so modules that must not load the
 * SDK (app/payments, the assistant registry) can import it by its own path.
 */
export class BreezSdkNotInitializedError extends Error {
  readonly reason: BreezSdkNotRunningReason

  constructor({ reason = "off" }: { reason?: BreezSdkNotRunningReason } = {}) {
    super("Breez SDK not initialized. Call initializeBreezSDK first.")
    this.name = "BreezSdkNotInitializedError"
    this.reason = reason
  }
}
