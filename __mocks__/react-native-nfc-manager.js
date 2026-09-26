const NfcManager = {
  cancelTechnologyRequest: jest.fn(),
  getTag: jest.fn(),
  isEnabled: jest.fn(async () => true),
  isSupported: jest.fn(async () => true),
  // Tech handlers live on the manager, not on the tag returned by getTag().
  isoDepHandler: { transceive: jest.fn() },
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
    IsoDep: "IsoDep",
    Ndef: "Ndef",
  },
}
