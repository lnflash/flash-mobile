import { Platform } from "react-native"
import NfcManager from "react-native-nfc-manager"

import {
  CARD_TRANSCEIVE_TIMEOUT_MS,
  extendCardTimeout,
} from "../../app/utils/cashu-card-nfc"

// Swap the shared mock's setTimeout for one this spec resets per test.
const setTimeoutMock = jest.fn()
;(NfcManager as unknown as { setTimeout: jest.Mock }).setTimeout = setTimeoutMock

describe("extendCardTimeout", () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    setTimeoutMock.mockReset().mockResolvedValue(undefined)
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it("raises Android's 618 ms default to a budget an on-card signature fits in", async () => {
    jest.replaceProperty(Platform, "OS", "android")

    await extendCardTimeout()

    expect(setTimeoutMock).toHaveBeenCalledWith(CARD_TRANSCEIVE_TIMEOUT_MS)
    expect(CARD_TRANSCEIVE_TIMEOUT_MS).toBeGreaterThanOrEqual(5000)
  })

  it("does nothing on iOS, which has no such knob", async () => {
    jest.replaceProperty(Platform, "OS", "ios")

    await extendCardTimeout()

    expect(setTimeoutMock).not.toHaveBeenCalled()
  })

  it("is best-effort: a refusal is logged, never thrown", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    setTimeoutMock.mockRejectedValue(new Error("unsupported"))

    await expect(extendCardTimeout()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("transceive timeout"),
      "Error: unsupported",
    )
  })
})
