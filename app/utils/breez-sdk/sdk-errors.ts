/**
 * Thrown by `getSDKInstance()` (./spark.ts) when there is no SDK instance to
 * call: advance mode is off, so the BTC wallet was never started, or it was
 * disconnected, or `initializeBreezSDK()` is still connecting.
 *
 * It has its own class so a caller can tell "the BTC wallet is not running"
 * from a call that failed. `breezBtcRail.getBalanceSats` (app/payments/
 * btc-rail.ts) reports it as a `disabled` or `syncing` state, never as a
 * failure and never as a zero balance (docs/ai-assistant-tool-registry.md
 * §2.1). The message is the one the plain `Error` it replaces carried.
 *
 * This module imports nothing from the SDK, so modules that must not load the
 * SDK (app/payments, the assistant registry) can import it by its own path.
 */
export class BreezSdkNotInitializedError extends Error {
  /**
   * True while `initializeBreezSDK()` is connecting: the wallet is starting
   * and will have a balance shortly, which is not the same as switched off.
   */
  readonly initializing: boolean

  constructor({ initializing = false }: { initializing?: boolean } = {}) {
    super("Breez SDK not initialized. Call initializeBreezSDK first.")
    this.name = "BreezSdkNotInitializedError"
    this.initializing = initializing
  }
}
