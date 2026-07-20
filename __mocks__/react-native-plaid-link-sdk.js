// Manual mock — react-native-plaid-link-sdk is a native module and cannot load under jest.
module.exports = {
  __esModule: true,
  create: jest.fn(),
  open: jest.fn(),
  dismissLink: jest.fn(),
  usePlaidEmitter: jest.fn(),
  LinkLogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
  LinkIOSPresentationStyle: { MODAL: "MODAL", FULL_SCREEN: "FULL_SCREEN" },
}
