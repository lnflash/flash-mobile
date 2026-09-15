/**
 * npubLinkState — the state table that decides whether a device can receive
 * Nostr DMs. Senders encrypt to the backend npub; the device decrypts with the
 * keychain key. Every state except `linked` means DMs are undeliverable.
 */
import { needsRelink, npubLinkState } from "@app/nostr/npub-link"

const A = "npub1aaaa"
const B = "npub1bbbb"

describe("npubLinkState", () => {
  it("is linked when the local key is what the backend advertises", () => {
    expect(npubLinkState(A, A)).toBe("linked")
    expect(needsRelink("linked")).toBe(false)
  })

  it("is unregistered when a local key exists but the backend has no npub", () => {
    expect(npubLinkState(A, null)).toBe("unregistered")
    expect(npubLinkState(A, undefined)).toBe("unregistered")
    expect(npubLinkState(A, "")).toBe("unregistered")
    expect(needsRelink("unregistered")).toBe(true)
  })

  it("is mismatch when the backend advertises a different key", () => {
    expect(npubLinkState(A, B)).toBe("mismatch")
    expect(needsRelink("mismatch")).toBe(true)
  })

  it("is conflict when the backend has an npub but the device has no key", () => {
    expect(npubLinkState(null, A)).toBe("conflict")
    expect(npubLinkState(undefined, A)).toBe("conflict")
    expect(needsRelink("conflict")).toBe(false)
  })

  it("is fresh when neither side has a key", () => {
    expect(npubLinkState(null, null)).toBe("fresh")
    expect(npubLinkState(undefined, undefined)).toBe("fresh")
    expect(needsRelink("fresh")).toBe(false)
  })
})
