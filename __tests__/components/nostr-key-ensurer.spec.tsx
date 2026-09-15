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

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

jest.mock("@app/graphql/generated", () => ({
  useHomeAuthedQuery: (options: unknown) => {
    mockUseHomeAuthedQuery(options)
    return { data: { me: mockMe } }
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
const foreignKeyPromptedKey: (accountId: string) => string =
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

describe("NostrKeyEnsurer", () => {
  let alertSpy: jest.SpyInstance

  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    mockIsAppLocked = false
    mockInitializeChat.mockResolvedValue(undefined)
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

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
      expect(alertSpy).toHaveBeenCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyMismatchMessage(),
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
      expect(await AsyncStorage.getItem(foreignKeyPromptedKey(ACCOUNT_B))).toBe("1")
    })

    it("leaves the key with its owner when the user declines, and does not nag", async () => {
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.common.cancel()).onPress?.()
      await flush()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe(ACCOUNT_A)
      expect(await AsyncStorage.getItem(foreignKeyPromptedKey(ACCOUNT_B))).toBe("1")
    })

    it("does not ask an account it already asked", async () => {
      await AsyncStorage.setItem(foreignKeyPromptedKey(ACCOUNT_B), "1")
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(mockGetSigner).toHaveBeenCalled())
      await flush()
      expect(alertSpy).not.toHaveBeenCalled()
      expect(mockUserUpdateNpub).not.toHaveBeenCalled()
    })

    it("tells the original owner when the backend now refuses its own key", async () => {
      // B took the key over. A comes back: the key's owner is B, so A is
      // asked; A chooses this device; the backend refuses (B holds it). A
      // must hear about it rather than stay silently undeliverable.
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
        LL.Nostr.keyMismatchRelinkFailed(),
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
        LL.Nostr.keyMismatchRelinkFailed(),
      )
    })
  })

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
      mockUserUpdateNpub.mockResolvedValue({
        data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
      })
      render(<NostrKeyEnsurer />)
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
      alertButton(alertSpy, LL.Nostr.keyMismatchUseThisDevice()).onPress?.()
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2))
      await flush()
      // Deterministic refusal: asking again would give the same answer.
      expect(await AsyncStorage.getItem(npubMismatchPromptedKey(OTHER_NPUB))).toBe("1")
      expect(alertSpy).toHaveBeenLastCalledWith(
        LL.Nostr.keyMismatchTitle(),
        LL.Nostr.keyMismatchRelinkFailed(),
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
    mockUserUpdateNpub.mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })
    mockMe = { id: ACCOUNT_A, npub: null }
    render(<NostrKeyEnsurer />)
    await waitFor(() => expect(mockUserUpdateNpub).toHaveBeenCalled())
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1))
    expect(alertSpy).toHaveBeenCalledWith(
      LL.Nostr.keyMismatchTitle(),
      LL.Nostr.keyMismatchRelinkFailed(),
    )
    expect(mockInitializeChat).not.toHaveBeenCalled()
    expect(mockGenerateAndStoreKey).not.toHaveBeenCalled()
    // Not this account's key after all.
    expect(await getNostrKeyOwner(LOCAL_NPUB)).toBeNull()
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
