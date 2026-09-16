/**
 * relinkRefusedMessage — the copy for a refused key registration, shared by
 * the ensurer and Settings › Nostr › Advanced › Reconnect.
 *
 * Only this account's own key may be called disposable, and a key with no
 * owner record must not be described as belonging to another account on this
 * phone: every install from before the record has no owner, including
 * single-user phones whose key was registered from another device.
 */
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { keyOwnerState } from "@app/nostr/key-owner"
import { relinkRefusedMessage } from "@app/nostr/relink-refused-message"

loadLocale("en")
const LL = i18nObject("en")

describe("keyOwnerState", () => {
  it("is unknown without an owner record", () => {
    expect(keyOwnerState(null, "account-a")).toBe("unknown")
  })

  it("is self when this account is the recorded owner", () => {
    expect(keyOwnerState("account-a", "account-a")).toBe("self")
  })

  it("is other when another account is the recorded owner", () => {
    expect(keyOwnerState("account-a", "account-b")).toBe("other")
  })

  it("never treats a recorded owner as self when the account is unknown", () => {
    expect(keyOwnerState("account-a", undefined)).toBe("other")
    expect(keyOwnerState("account-a", null)).toBe("other")
  })
})

describe("relinkRefusedMessage", () => {
  it("advises deleting the keys only for this account's own key", () => {
    expect(relinkRefusedMessage(LL, "self")).toBe(LL.Nostr.keyMismatchRelinkRefused())
  })

  it("names another account on this phone only when one is on record", () => {
    expect(relinkRefusedMessage(LL, "other")).toBe(LL.Nostr.keyForeignRelinkRefused())
  })

  it("uses neutral back-up advice for a key with no owner record", () => {
    const message = relinkRefusedMessage(LL, "unknown")
    expect(message).toBe(LL.Nostr.keyUnownedRelinkRefused())
    expect(message).not.toBe(LL.Nostr.keyForeignRelinkRefused())
    expect(message).not.toMatch(/this phone/)
    expect(message).not.toBe(LL.Nostr.keyMismatchRelinkRefused())
  })
})
