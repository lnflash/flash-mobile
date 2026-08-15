import { nip19 } from "nostr-tools"

import { SUPPORT_CHAT_PUBKEY, normalizeSupportChatPubkey } from "../../app/config/appinfo"

const DEFAULT_PUBKEY = "0633099f411c1a5654953a2a81191a44e1c9fd979cf808d98dba57ff4d441ac9"

describe("normalizeSupportChatPubkey", () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("falls back to the default when no override is set", () => {
    expect(normalizeSupportChatPubkey(undefined)).toBe(DEFAULT_PUBKEY)
    expect(normalizeSupportChatPubkey("")).toBe(DEFAULT_PUBKEY)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("accepts a 64-char hex override and lowercases it", () => {
    const hex = "AB".repeat(32)
    expect(normalizeSupportChatPubkey(hex)).toBe("ab".repeat(32))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("decodes an npub override to its hex form", () => {
    const npub = nip19.npubEncode(DEFAULT_PUBKEY)
    expect(npub.startsWith("npub1")).toBe(true)
    expect(normalizeSupportChatPubkey(npub)).toBe(DEFAULT_PUBKEY)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("rejects a malformed npub back to the default and logs it", () => {
    expect(normalizeSupportChatPubkey("npub1notarealkey")).toBe(DEFAULT_PUBKEY)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects non-hex garbage back to the default and logs it", () => {
    expect(normalizeSupportChatPubkey("staging-support-key")).toBe(DEFAULT_PUBKEY)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects hex of the wrong length back to the default and logs it", () => {
    expect(normalizeSupportChatPubkey("ab".repeat(31))).toBe(DEFAULT_PUBKEY)
    expect(normalizeSupportChatPubkey("ab".repeat(33))).toBe(DEFAULT_PUBKEY)
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it("exports the default pubkey when the env override is absent (jest maps Config to {})", () => {
    expect(SUPPORT_CHAT_PUBKEY).toBe(DEFAULT_PUBKEY)
  })
})
