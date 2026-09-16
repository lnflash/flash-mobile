/**
 * NostrKeyEnsurer — on every authenticated session start, the npub the backend
 * advertises for the account must be the key this device can decrypt with.
 *
 * Contract under test:
 *  - linked          → no backend write.
 *  - unregistered    → register the local key silently (the "flash" account
 *                      case: local key, backend npub null, so nobody can DM
 *                      it). The local signer is unchanged, so chat is NOT
 *                      re-initialised.
 *  - mismatch        → never rewrite a registered npub silently. Ask once per
 *                      backend npub; relink only on confirmation; remember
 *                      the prompt only once a button was pressed, so a
 *                      dismissed prompt re-asks and an answered one does not
 *                      nag on every cold start.
 *  - foreign key     → a local key another account on this device generated
 *                      (the keychain survives logout) is prompt-class even
 *                      when this account is `unregistered`; never claimed
 *                      silently.
 *  - backend refuses → no chat re-init, no crash (NPUB_NOT_AVAILABLE); a
 *                      refused silent relink is told to the user.
 *  - conflict        → never auto-generate over a registered npub.
 *  - fresh           → generate, register, init chat, record the owner.
 *  - logout          → a prompt still held behind the lock screen is dropped,
 *                      never shown to whoever signs in next; a check still in
 *                      flight at logout (relink, storage read) or a button
 *                      pressed afterwards acts on nothing.
 *  - locked          → the silent write still happens, but no Alert is shown
 *                      while the PIN/biometric gate is up; it appears once
 *                      the app unlocks.
 */
import React from "react"
import { Alert } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { render, waitFor } from "@testing-library/react-native"
import { nip19 } from "nostr-tools"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

const mockUserUpdateNpub = jest.fn()
const mockInitializeChat = jest.fn()
const mockUseHomeAuthedQuery = jest.fn()
const mockFetchSecret = jest.fn()
const mockGetSigner = jest.fn()
const mockGenerateAndStoreKey = jest.fn()
let mockMe: { id?: string; npub?: string | null } | null = null
let mockIsAppLocked = false
let mockIsAuthed = true

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => mockIsAuthed,
}))

jest.mock("@app/graphql/generated", () => ({
  useHomeAuthedQuery: (options: { skip?: boolean }) => {
    mockUseHomeAuthedQuery(options)
    return { data: options?.skip ? undefined : { me: mockMe } }
  },
  useUserUpdateNpubMutation: () => [mockUserUpdateNpub],
}))

jest.mock("@app/navigation/navigation-container-wrapper", () => ({
  useAuthenticationContext: () => ({
    isAppLocked: mockIsAppLocked,
    setAppUnlocked: jest.fn(),
    setAppLocked: jest.fn(),
  }),
}))

jest.mock("@app/screens/chat/chatContext", () => ({
  useChatContext: () => ({ initializeChat: mockInitializeChat }),
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/utils/nostr", () => ({
  fetchSecretFromLocalStorage: () => mockFetchSecret(),
}))

jest.mock("@app/nostr/signer", () => ({
  getSigner: () => mockGetSigner(),
  generateAndStoreKey: (...args: unknown[]) => mockGenerateAndStoreKey(...args),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ensurerModule = require("@app/components/nostr-key-ensurer")
const NostrKeyEnsurer = ensurerModule.default
const npubMismatchPromptedKey: (backendNpub: string) => string =
  ensurerModule.npubMismatchPromptedKey
const foreignKeyPromptedKey: (accountId: string, localNpub: string) => string =
  ensurerModule.foreignKeyPromptedKey
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getNostrKeyOwner, setNostrKeyOwner } = require("@app/nostr/key-owner")

loadLocale("en")
const LL = i18nObject("en")

const LOCAL_HEX = "a".repeat(64)
const LOCAL_NPUB = nip19.npubEncode(LOCAL_HEX)
const OTHER_NPUB = nip19.npubEncode("b".repeat(64))
const ACCOUNT_A = "account-a"
const ACCOUNT_B = "account-b"
const ACCOUNT_C = "account-c"

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

const withLocalKey = () => {
  mockFetchSecret.mockResolvedValue("nsec1local")
  mockGetSigner.mockResolvedValue({ getPublicKey: async () => LOCAL_HEX })
}

const okMutation = () =>
  mockUserUpdateNpub.mockResolvedValue({ data: { userUpdateNpub: { errors: [] } } })

type AlertButton = { text?: string; onPress?: () => void }
const alertButton = (alertSpy: jest.SpyInstance, text: string): AlertButton => {
  const buttons = alertSpy.mock.calls[0][2] as AlertButton[]
  const button = buttons.find((b) => b.text === text)
  if (!button) throw new Error(`no alert button "${text}"`)
  return button
}

// Shared by both top-level describes below; the file is split in two only to
// keep each describe under the max-lines-per-function lint limit.
let alertSpy: jest.SpyInstance

const resetEnsurerMocks = async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  mockIsAppLocked = false
  mockIsAuthed = true
  mockInitializeChat.mockResolvedValue(undefined)
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
  jest.spyOn(console, "log").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
  jest.spyOn(console, "error").mockImplementation(() => {})
}

describe("NostrKeyEnsurer", () => {
  beforeEach(resetEnsurerMocks)

  it("reads the account npub from the network, never the persisted cache", async () => {
    // The Apollo cache survives launches; a cache-first read would decide a
    // backend write off last session's npub.
    withLocalKey()
    mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
    render(<NostrKeyEnsurer />)
    expect(mockUseHomeAuthedQuery).toHaveBeenCalledWith(
      expect.objectContaining({ fetchPolicy: "network-only" }),
    )
  })

  it("does nothing when the local key matches the backend npub", async () => {
    withLocalKey()
    mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
    await flush()
    expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    expect(mockInitializeChat).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it("records the account as the owner of a linked key", async () => {
    // Keys from before the owner record (or an imported nsec) are adopted by
    // the account that advertises them, so a later login as someone else on
    // this device is asked before claiming the key.
    withLocalKey()
    mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(async () => expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A))
  })

  it("skips a local key it cannot read instead of generating over it", async () => {
    // fetchSecretFromLocalStorage says a key exists but the signer cannot
    // load it. Falling through to the generate path would overwrite the
    // existing key and make every DM encrypted to it unreadable.
    mockFetchSecret.mockResolvedValue("nsec1local")
    mockGetSigner.mockRejectedValue(new Error("keychain locked"))
    okMutation()
    mockMe = { id: ACCOUNT_A, npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
    await flush()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    expect(mockInitializeChat).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it("registers the local key silently when the backend has no npub", async () => {
    withLocalKey()
    okMutation()
    mockMe = { id: ACCOUNT_A, npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalled())
    await flush()
    expect(mockUserUpdateNpub).toHaveBeenCalledWith({
      variables: { input: { npub: LOCAL_NPUB } },
    })
    expect(alertSpy).not.toHaveBeenCalled()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    // The local signer did not change; chat already subscribed with it.
    expect(mockInitializeChat).not.toHaveBeenCalled()
    // The key is now this account's.
    expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A)
  })

  it("registers silently a key it generated for this same account", async () => {
    withLocalKey()
    okMutation()
    await setNostrKeyOwner(LOCAL_NPUB, ACCOUNT_A)
    mockMe = { id: ACCOUNT_A, npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1))
    await flush()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  describe("foreign key (another account on this device generated it)", () => {
    // Shared phone: account A generated the key and is still `unregistered`
    // (the exact case the silent path repairs). A logs out — the keychain
    // entry stays — and B logs in with no backend npub. Silently registering
    // A's key on B would strand A: the backend refuses a second owner.
    beforeEach(async () => {
      withLocalKey()
      okMutation()
      await setNostrKeyOwner(LOCAL_NPUB, ACCOUNT_A)
      mockMe = { id: ACCOUNT_B, npub: null }
    })

    it("asks instead of claiming the key silently", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      await flush()
      // The account has no key of its own here, so "your keys differ" would
      // be false; the question is whether to take over another account's key.
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyForeignMessage(),
        expect.any(Array),
      )
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A)
    })

    it("takes the key over only when the user chooses this device", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1))
      await flush()
      expect(mockUserUpdateNpub).toHaveBeenCalledWith({
        variables: { input: { npub: LOCAL_NPUB } },
      })
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_B)
      expect(
        await AsyncStorage.getItem(foreignKeyPromptedKey(ACCOUNT_B, LOCAL_NPUB)),
      ).toBe("1")
    })

    it("leaves the key with its owner when the user declines, and does not nag", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.common.cancel()).onPress?.()
      await flush()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A)
      expect(
        await AsyncStorage.getItem(foreignKeyPromptedKey(ACCOUNT_B, LOCAL_NPUB)),
      ).toBe("1")
    })

    it("does not ask an account it already asked about this key", async () => {
      await AsyncStorage.setItem(foreignKeyPromptedKey(ACCOUNT_B, LOCAL_NPUB), "1")
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("asks again when the local key is a different one than it declined", async () => {
      // B declined A's key K1. Later C's phone login hands K2 to the
      // keychain and C becomes its owner. B logs in again: K2 is foreign
      // too, but B was never asked about it — a marker keyed on the
      // account alone would swallow the prompt and leave B undeliverable
      // on this device for good.
      const K1 = LOCAL_NPUB
      const K2_HEX = "c".repeat(64)
      const K2 = nip19.npubEncode(K2_HEX)
      await AsyncStorage.setItem(foreignKeyPromptedKey(ACCOUNT_B, K1), "1")
      mockGetSigner.mockResolvedValue({ getPublicKey: async () => K2_HEX })
      await setNostrKeyOwner(K2, ACCOUNT_C)
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      await flush()
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyForeignMessage(),
        expect.any(Array),
      )
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      expect(await getNostrKeyOwner(K2)).toBe(ACCOUNT_C)
    })

    it("tells the original owner when the backend now refuses its own key", async () => {
      // B took the key over. A comes back: the key's owner is B, so A is
      // asked; A chooses this device; the backend refuses (B holds it). A
      // must hear about it rather than stay silently undeliverable, and must
      // not be told to delete the key, which is B's only copy.
      await setNostrKeyOwner(LOCAL_NPUB, ACCOUNT_B)
      mockMe = { id: ACCOUNT_A, npub: null }
      mockUserUpdateNpub.mockResolvedValue({
        data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
      })
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2))
      expect(alertSpy).toHaveBeenLastCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyForeignRelinkRefused(),
      )
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_B)
    })
  })

  describe("while the app is locked (PIN / biometric gate not yet passed)", () => {
    beforeEach(() => {
      mockIsAppLocked = true
      withLocalKey()
      okMutation()
    })

    it("still registers an unregistered key silently", async () => {
      mockMe = { id: ACCOUNT_A, npub: null }
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1))
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("holds the mismatch prompt until the app unlocks", async () => {
      // One tap on an alert over the lock screen would rewrite the account's
      // npub without unlocking.
      mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
      await flush()
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()

      mockIsAppLocked = false
      rerender(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyMismatchMessage(),
        expect.any(Array),
      )
      // Shown once, not on every re-render after unlock.
      rerender(<NostrKeyEnsurer />)
      await flush()
      expect(alertSpy).toHaveBeenCalledTimes(1)
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("holds the refused-relink notice until the app unlocks", async () => {
      await setNostrKeyOwner(LOCAL_NPUB, ACCOUNT_A)
      mockMe = { id: ACCOUNT_A, npub: null }
      mockUserUpdateNpub.mockResolvedValue({
        data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
      })
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1))
      await flush()
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()

      mockIsAppLocked = false
      rerender(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyMismatchRelinkRefused(),
      )
    })
  })

  describe("once per account, not once per mount", () => {
    it("checks a second account that logs in during the same process", async () => {
      // Logout does not remount anything above the ensurer, so a mount-scoped
      // guard would leave account B unchecked after A on a shared phone.
      withLocalKey()
      okMutation()
      mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(async () =>
        expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A),
      )
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()

      // Same account re-rendering: no second run.
      rerender(<NostrKeyEnsurer />)
      await flush()
      expect(mockGetSigner).toHaveBeenCalledTimes(1)

      // Account B, no npub, key owned by A → the foreign-key question is
      // asked, which proves the check ran again for B.
      mockMe = { id: ACCOUNT_B, npub: null }
      rerender(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyForeignMessage(),
        expect.any(Array),
      )
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("does not run for an account payload without an id", async () => {
      withLocalKey()
      mockMe = { npub: null }
      render(<NostrKeyEnsurer />)
      await flush()
      await flush()
      expect(mockGetSigner).not.toHaveBeenCalled()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })
  })

  describe("mismatch while the local key belongs to another account on this phone", () => {
    // A is linked here with the local key; B logs in with a backend npub from
    // B's other phone. B must be told the key is A's, and a refusal must never
    // advise deleting it.
    beforeEach(async () => {
      withLocalKey()
      await setNostrKeyOwner(LOCAL_NPUB, ACCOUNT_A)
      mockMe = { id: ACCOUNT_B, npub: OTHER_NPUB }
    })

    it("names the other account in the prompt", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyForeignMessage(),
        expect.any(Array),
      )
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("does not tell the user to delete the other account's key on refusal", async () => {
      mockUserUpdateNpub.mockResolvedValue({
        data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
      })
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2))
      await flush()
      expect(alertSpy).toHaveBeenLastCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyForeignRelinkRefused(),
      )
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A)
    })
  })

  it("drops a prompt still held behind the lock screen when the account logs out", async () => {
    // GaloyClient keeps this component mounted across a logout, so a prompt
    // decided for the first account must not appear once the app unlocks
    // for the next one.
    mockIsAppLocked = true
    withLocalKey()
    okMutation()
    mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
    const { rerender } = render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
    await flush()
    await flush()
    expect(alertSpy).not.toHaveBeenCalled()

    mockIsAuthed = false
    rerender(<NostrKeyEnsurer />)
    await flush()
    mockIsAppLocked = false
    rerender(<NostrKeyEnsurer />)
    await flush()
    // Signing back in re-checks the account (once per account). Make that
    // fresh check a no-op (linked), so any alert or write below can only
    // come from the stale check that started before logout.
    mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
    mockIsAuthed = true
    rerender(<NostrKeyEnsurer />)
    await flush()
    await flush()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(mockUserUpdateNpub).not.toHaveBeenCalled()
  })

  it("drops a held prompt when logout and unlock land in the same render", async () => {
    mockIsAppLocked = true
    withLocalKey()
    mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
    const { rerender } = render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
    await flush()
    await flush()

    mockIsAuthed = false
    mockIsAppLocked = false
    rerender(<NostrKeyEnsurer />)
    await flush()
    // Signing back in re-checks the account (once per account). Make that
    // fresh check a no-op (linked), so any alert or write below can only
    // come from the stale check that started before logout.
    mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
    mockIsAuthed = true
    rerender(<NostrKeyEnsurer />)
    await flush()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  describe("logout while the check is still in flight", () => {
    const refused = {
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    }
    const deferred = () => {
      let resolve: (v: unknown) => void = () => {}
      const promise = new Promise((r) => {
        resolve = r
      })
      return { promise, resolve }
    }

    it("never shows a refused-relink notice that resolves after logout", async () => {
      mockIsAppLocked = true
      withLocalKey()
      mockMe = { id: ACCOUNT_A, npub: null }
      const pending = deferred()
      mockUserUpdateNpub.mockReturnValue(pending.promise)
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1))

      mockIsAuthed = false
      rerender(<NostrKeyEnsurer />)
      await flush()
      pending.resolve(refused)
      await flush()
      await flush()

      // Signing back in re-checks the account (once per account). Make that
      // fresh check a no-op (linked), so any alert or write below can only
      // come from the stale check that started before logout.
      mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
      mockIsAuthed = true
      rerender(<NostrKeyEnsurer />)
      await flush()
      mockIsAppLocked = false
      rerender(<NostrKeyEnsurer />)
      await flush()
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("never shows a notice that resolves after logout and a new sign-in", async () => {
      withLocalKey()
      mockMe = { id: ACCOUNT_A, npub: null }
      const pending = deferred()
      mockUserUpdateNpub.mockReturnValue(pending.promise)
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1))

      mockIsAuthed = false
      rerender(<NostrKeyEnsurer />)
      await flush()
      // Signing back in re-checks the account (once per account). Make that
      // fresh check a no-op (linked), so any alert or write below can only
      // come from the stale check that started before logout.
      mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
      mockIsAuthed = true
      rerender(<NostrKeyEnsurer />)
      await flush()
      pending.resolve(refused)
      await flush()
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("never holds a mismatch prompt whose storage read resolves after logout", async () => {
      mockIsAppLocked = true
      withLocalKey()
      okMutation()
      mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
      const pending = deferred()
      // The async-storage jest mock is itself a jest.fn: queue one held read
      // rather than spying, which would wipe its implementation on restore.
      const getItemSpy = AsyncStorage.getItem as jest.Mock
      getItemSpy.mockImplementationOnce(() => pending.promise)
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(getItemSpy).toHaveBeenCalled())

      mockIsAuthed = false
      rerender(<NostrKeyEnsurer />)
      await flush()
      pending.resolve(null)
      await flush()
      await flush()

      // Signing back in re-checks the account (once per account). Make that
      // fresh check a no-op (linked), so any alert or write below can only
      // come from the stale check that started before logout.
      mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
      mockIsAuthed = true
      rerender(<NostrKeyEnsurer />)
      await flush()
      mockIsAppLocked = false
      rerender(<NostrKeyEnsurer />)
      await flush()
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("ignores 'Use this device' pressed after the account logged out", async () => {
      withLocalKey()
      okMutation()
      mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))

      mockIsAuthed = false
      rerender(<NostrKeyEnsurer />)
      // Signing back in re-checks the account (once per account). Make that
      // fresh check a no-op (linked), so any alert or write below can only
      // come from the stale check that started before logout.
      mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
      mockIsAuthed = true
      rerender(<NostrKeyEnsurer />)
      await flush()
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await flush()
      await flush()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledTimes(1)
    })
  })
})

describe("NostrKeyEnsurer: mismatch, refusals and key generation", () => {
  beforeEach(resetEnsurerMocks)

  describe("mismatch (backend advertises a key this device does not hold)", () => {
    beforeEach(() => {
      withLocalKey()
      okMutation()
      mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
    })

    it("asks before touching the registered npub and never relinks on its own", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      await flush()
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyMismatchMessage(),
        expect.any(Array),
      )
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
      expect(mockInitializeChat).not.toHaveBeenCalled()
    })

    it("asks again next launch when the prompt is dismissed without an answer", async () => {
      // Android replaces a showing alert with any later one (no button
      // pressed) and the back button dismisses it. Neither may count as an
      // answer, so no marker is persisted until a button handler runs.
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      await flush()
      expect(await AsyncStorage.getItem(npubMismatchPromptedKey(OTHER_NPUB))).toBeNull()
    })

    it("relinks the local key only after the user chooses this device", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalledTimes(1))
      await flush()
      expect(mockUserUpdateNpub).toHaveBeenCalledWith({
        variables: { input: { npub: LOCAL_NPUB } },
      })
      expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
      expect(mockInitializeChat).not.toHaveBeenCalled()
      // Remembered per backend npub so the next cold start does not nag.
      expect(await AsyncStorage.getItem(npubMismatchPromptedKey(OTHER_NPUB))).toBe("1")
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A)
    })

    it("asks again next launch when the chosen relink fails in transit", async () => {
      mockUserUpdateNpub.mockRejectedValue(new Error("network"))
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2))
      await flush()
      // No marker: the user's answer was lost, so the question must come back.
      expect(await AsyncStorage.getItem(npubMismatchPromptedKey(OTHER_NPUB))).toBeNull()
      expect(alertSpy).toHaveBeenLastCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyMismatchRelinkFailed(),
      )
    })

    it("tells the user and remembers when the backend refuses the chosen relink", async () => {
      await setNostrKeyOwner(LOCAL_NPUB, ACCOUNT_A)
      mockUserUpdateNpub.mockResolvedValue({
        data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
      })
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2))
      await flush()
      // Deterministic refusal: asking again would give the same answer, and
      // "check your connection" would send the user to a Reconnect that
      // refuses the same way — so the copy points at deleting the keys.
      expect(await AsyncStorage.getItem(npubMismatchPromptedKey(OTHER_NPUB))).toBe("1")
      expect(alertSpy).toHaveBeenLastCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyMismatchRelinkRefused(),
      )
    })

    it("leaves the registered npub alone when the user declines", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.common.cancel()).onPress?.()
      await flush()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      // A decline is an answer: remembered so it does not nag on every launch.
      expect(await AsyncStorage.getItem(npubMismatchPromptedKey(OTHER_NPUB))).toBe("1")
    })

    it("does not ask again for a backend npub it already prompted about", async () => {
      await AsyncStorage.setItem(npubMismatchPromptedKey(OTHER_NPUB), "1")
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("asks again when the account's npub changed since the last prompt", async () => {
      await AsyncStorage.setItem(
        npubMismatchPromptedKey(nip19.npubEncode("c".repeat(64))),
        "1",
      )
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })
  })

  it("tells the user when the backend refuses the silent relink", async () => {
    // NPUB_NOT_AVAILABLE: another account registered this key. The account
    // stays undeliverable and only the user can fix it, so a log line is not
    // enough.
    withLocalKey()
    await setNostrKeyOwner(LOCAL_NPUB, ACCOUNT_A)
    mockUserUpdateNpub.mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })
    mockMe = { id: ACCOUNT_A, npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalled())
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
    expect(alertSpy).toHaveBeenCalledWith(
      LL.Nostr.keyMismatchTitle(),
      LL.Nostr.keyMismatchRelinkRefused(),
    )
    expect(mockInitializeChat).not.toHaveBeenCalled()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
  })

  describe("key with no owner record (installed before the record existed)", () => {
    // Shared phone, first launch of the upgraded build: A generated the key
    // long ago, B is the first to launch. No owner, so B registers silently
    // and the backend refuses because A holds it. B must not be told to
    // delete the chat keys: that is A's only copy.
    beforeEach(() => {
      withLocalKey()
      mockUserUpdateNpub.mockResolvedValue({
        data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
      })
    })

    it("answers a refused silent relink with back-up advice, not delete advice", async () => {
      mockMe = { id: ACCOUNT_B, npub: null }
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      expect(alertSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        LL.Nostr.keyMismatchRelinkRefused(),
      )
      // Nor told the key belongs to another account on this phone: the
      // refusal only says some account holds it, possibly on another phone.
      expect(alertSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        LL.Nostr.keyForeignRelinkRefused(),
      )
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyUnownedRelinkRefused(),
      )
      // Not this account's key after all.
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBeNull()
    })

    it("answers a refused chosen mismatch relink with back-up advice", async () => {
      mockMe = { id: ACCOUNT_B, npub: OTHER_NPUB }
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2))
      expect(alertSpy).toHaveBeenLastCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyUnownedRelinkRefused(),
      )
    })
  })

  describe("a prompt belongs to the account whose check produced it", () => {
    it("drops A's parked prompt when A logs out at the lock screen and B unlocks", async () => {
      // A's mismatch prompt waits behind the PIN gate. The lock screen has a
      // Logout button; B logs in and unlocks. A's alert must not appear in
      // B's session, where "Use this device" would write the key onto B.
      withLocalKey()
      okMutation()
      mockIsAppLocked = true
      mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalledTimes(1))
      await flush()
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()

      // Logout.
      mockIsAuthed = false
      mockMe = null
      rerender(<NostrKeyEnsurer />)
      await flush()

      // B logs in (B is linked to the local key, so B's own check is quiet)
      // and unlocks.
      mockIsAuthed = true
      mockMe = { id: ACCOUNT_B, npub: LOCAL_NPUB }
      rerender(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalledTimes(2))
      mockIsAppLocked = false
      rerender(<NostrKeyEnsurer />)
      await flush()
      await flush()
      rerender(<NostrKeyEnsurer />)
      await flush()

      expect(alertSpy).not.toHaveBeenCalled()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("stops a check still running for A once B is signed in", async () => {
      // A's check is waiting on the keychain when A logs out and B logs in.
      // Resuming would register A's key through the mutation, which now
      // authenticates as B. B's own check must leave nothing behind that
      // would stop A's by accident: B has a mismatch it already answered
      // (no prompt, no owner record, no write), and the local key has no
      // owner, so a resumed A would reach the silent `unregistered` relink.
      mockFetchSecret.mockResolvedValue("nsec1local")
      let resolveA: (signer: unknown) => void = () => {}
      mockGetSigner.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve
          }),
      )
      mockGetSigner.mockResolvedValue({ getPublicKey: async () => LOCAL_HEX })
      okMutation()
      await AsyncStorage.setItem(npubMismatchPromptedKey(OTHER_NPUB), "1")
      mockMe = { id: ACCOUNT_A, npub: null }
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalledTimes(1))

      mockIsAuthed = false
      mockMe = null
      rerender(<NostrKeyEnsurer />)
      await flush()
      mockIsAuthed = true
      mockMe = { id: ACCOUNT_B, npub: OTHER_NPUB }
      rerender(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalledTimes(2))
      await flush()
      await flush()
      // B's check finished without recording an owner.
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBeNull()

      resolveA({ getPublicKey: async () => LOCAL_HEX })
      await flush()
      await flush()
      await flush()

      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBeNull()
    })

    it("checks the same account again after it logs out and back in", async () => {
      withLocalKey()
      okMutation()
      mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
      const { rerender } = render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalledTimes(1))
      await flush()
      mockIsAuthed = false
      mockMe = null
      rerender(<NostrKeyEnsurer />)
      await flush()
      mockIsAuthed = true
      mockMe = { id: ACCOUNT_A, npub: LOCAL_NPUB }
      rerender(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalledTimes(2))
    })
  })

  it("survives a rejected relink mutation", async () => {
    withLocalKey()
    mockUserUpdateNpub.mockRejectedValue(new Error("network"))
    mockMe = { id: ACCOUNT_A, npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalled())
    await flush()
    expect(mockInitializeChat).not.toHaveBeenCalled()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    // Transient: the next launch retries silently, no alert.
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it("never auto-generates over a registered npub when the device has no key", async () => {
    mockFetchSecret.mockResolvedValue(null)
    mockMe = { id: ACCOUNT_A, npub: OTHER_NPUB }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockFetchSecret).toHaveBeenCalled())
    await flush()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it("generates and registers a key when neither side has one", async () => {
    mockFetchSecret.mockResolvedValue(null)
    mockGenerateAndStoreKey.mockResolvedValue(LOCAL_NPUB)
    okMutation()
    mockMe = { id: ACCOUNT_A, npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockInitializeChat).toHaveBeenCalled())
    expect(mockGenerateAndStoreKey).toHaveBeenCalledTimes(1)
    // The generated key is stamped with the account that owns it.
    expect(mockGenerateAndStoreKey).toHaveBeenCalledWith(ACCOUNT_A)
    expect(mockUserUpdateNpub).toHaveBeenCalledWith({
      variables: { input: { npub: LOCAL_NPUB } },
    })
  })
})
