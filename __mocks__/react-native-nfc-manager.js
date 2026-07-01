const NfcManager = {
  cancelTechnologyRequest: jest.fn(),
  getTag: jest.fn(),
  isEnabled: jest.fn(async () => false),
  isSupported: jest.fn(async () => false),
  requestTechnology: jest.fn(),
  start: jest.fn(),
}

module.exports = {
  __esModule: true,
  default: NfcManager,
  Ndef: {
    text: {
      decodePayload: jest.fn(() => ""),
    },
  },
  NfcTech: {
    Ndef: "Ndef",
  },
}
