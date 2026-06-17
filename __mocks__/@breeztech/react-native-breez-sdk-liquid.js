// Manual jest mock for the Breez Liquid SDK native module.
export const LiquidNetwork = { Mainnet: "Mainnet", Testnet: "Testnet" }
export const PaymentState = {
  Created: "Created",
  Pending: "Pending",
  Complete: "Complete",
  Failed: "Failed",
}
export const connect = jest.fn(async () => ({}))
export const disconnect = jest.fn(async () => undefined)
export const defaultConfig = jest.fn(() => ({ network: LiquidNetwork.Mainnet }))
export const fetchLightningLimits = jest.fn(async () => ({}))
export const getInfo = jest.fn(async () => ({}))
export const listPayments = jest.fn(async () => [])
export const prepareSendPayment = jest.fn(async () => ({}))
export const sendPayment = jest.fn(async () => ({}))
export const sync = jest.fn(async () => undefined)
export default {
  LiquidNetwork,
  PaymentState,
  connect,
  disconnect,
  defaultConfig,
  fetchLightningLimits,
  getInfo,
  listPayments,
  prepareSendPayment,
  sendPayment,
  sync,
}
