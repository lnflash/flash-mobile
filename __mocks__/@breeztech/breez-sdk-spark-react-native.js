// Manual jest mock for the Breez Spark SDK native module.
// The real package calls TurboModuleRegistry.getEnforcing(...) at import time,
// which throws under jest because the native binary is not present. Unit tests
// that only exercise app logic (e.g. the receive flow) just need the value
// exports referenced at module-evaluation time to exist.

export const Network = { Mainnet: "Mainnet", Regtest: "Regtest" }
export const ReceivePaymentMethod = {
  Bolt11Invoice: "Bolt11Invoice",
  BitcoinAddress: "BitcoinAddress",
  LightningAddress: "LightningAddress",
}
export const SendPaymentMethod_Tags = {
  Bolt11Invoice: "Bolt11Invoice",
  BitcoinAddress: "BitcoinAddress",
}
export const InputType_Tags = {
  Bolt11Invoice: "Bolt11Invoice",
  BitcoinAddress: "BitcoinAddress",
  LnurlPay: "LnurlPay",
}
export const OnchainConfirmationSpeed = {
  Fast: "Fast",
  Medium: "Medium",
  Slow: "Slow",
}

export const defaultConfig = jest.fn(() => ({ network: Network.Mainnet }))
export const initLogging = jest.fn()

export class Seed {}
export class SendPaymentOptions {}
export class MaxFee {}
export class Fee {}

export class SdkBuilder {
  static fromConfig() {
    return new SdkBuilder()
  }
  build() {
    return Promise.resolve({})
  }
}

export default {
  Network,
  ReceivePaymentMethod,
  SendPaymentMethod_Tags,
  InputType_Tags,
  OnchainConfirmationSpeed,
  defaultConfig,
  initLogging,
  Seed,
  SendPaymentOptions,
  MaxFee,
  Fee,
  SdkBuilder,
}
