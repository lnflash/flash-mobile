/**
 * Why there is no SDK instance to call:
 *
 * - `off`: the BTC wallet was never started, since Breez starts only in
 *   advance mode, or it was disconnected, or advance mode was turned off
 *   after a start that failed.
 * - `starting`: `initializeBreezSDK()` is connecting.
 * - `failed`: the last `initializeBreezSDK()` gave up (it retries, then
 *   throws), offline at launch for instance. Advance mode is on: the wallet
 *   is meant to run and could not start, which is not the same as off.
 */
export type BreezSdkNotRunningReason = "off" | "starting" | "failed"

/**
 * Thrown by `getSDKInstance()` (./spark.ts) when there is no SDK instance to
 * call, with the reason.
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
