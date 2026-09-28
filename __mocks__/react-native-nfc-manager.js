const NfcManager = {
  cancelTechnologyRequest: jest.fn(),
  getTag: jest.fn(),
  isEnabled: jest.fn(async () => true),
  isSupported: jest.fn(async () => true),
  // Tech handlers live on the manager, not on the tag returned by getTag().
  isoDepHandler: { transceive: jest.fn() },
  requestTechnology: jest.fn(),
  // Android's IsoDep transceive timeout (a card operation raises it).
  setTimeout: jest.fn(),
  start: jest.fn(),
}

// The library's own classes are plain Error subclasses (src/NfcError.js); a
// cancelled sheet rejects with UserCancel on both platforms.
class NfcErrorBase extends Error {}
class UserCancel extends NfcErrorBase {}

module.exports = {
  __esModule: true,
  default: NfcManager,
  NfcError: {
    NfcErrorBase,
    UserCancel,
  },
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
