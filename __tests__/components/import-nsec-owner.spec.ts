/**
 * importNsec — the owner stamp.
 *
 * An imported nsec replaces the device key. It must be recorded as the
 * importing account's as soon as the backend accepts it (not only on the next
 * ensurer run), a refused key must not be claimed (or reported as a success),
 * and the owner record of the key it replaced must not linger.
 */
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Keychain from "react-native-keychain"
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools"
import {
  importNsec,
  KEYCHAIN_NOSTRCREDS_KEY,
  NSEC_REGISTERED_ELSEWHERE_ERROR,
} from "@app/components/import-nsec/utils"
import { getNostrKeyOwner, setNostrKeyOwner } from "@app/nostr/key-owner"

const ACCOUNT_A = "account-a"
const ACCOUNT_B = "account-b"

const newKey = () => {
  const sk = generateSecretKey()
  return { nsec: nip19.nsecEncode(sk), npub: nip19.npubEncode(getPublicKey(sk)) }
}

const accepted = async () => true
const refused = async () => false

describe("importNsec owner record", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    await Keychain.resetInternetCredentials({ server: KEYCHAIN_NOSTRCREDS_KEY })
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  it("records the importing account as the owner once the backend accepts", async () => {
    const { nsec, npub } = newKey()
    const onError = jest.fn()
    const ok = await importNsec(nsec, {
      onError,
      updateFlashBackend: accepted,
      accountId: ACCOUNT_B,
    })
    expect(ok).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    expect(await getNostrKeyOwner(npub)).toBe(ACCOUNT_B)
  })

  it("reports a refused key as an error, not a success, and does not claim it", async () => {
    const { nsec, npub } = newKey()
    const onError = jest.fn()
    const ok = await importNsec(nsec, {
      onError,
      updateFlashBackend: refused,
      accountId: ACCOUNT_B,
    })
    expect(ok).toBe(false)
    expect(onError).toHaveBeenCalledWith(NSEC_REGISTERED_ELSEWHERE_ERROR)
    expect(await getNostrKeyOwner(npub)).toBeNull()
  })

  it("leaves the previous key and its owner record untouched when refused", async () => {
    // Shared phone: B imports A's nsec, A holds it on the backend. The
    // refusal must be a no-op — B's own key stays in the keychain (it is the
    // only copy that decrypts DMs to B's registered npub) and stays B's.
    const previous = newKey()
    await Keychain.setInternetCredentials(
      KEYCHAIN_NOSTRCREDS_KEY,
      KEYCHAIN_NOSTRCREDS_KEY,
      previous.nsec,
    )
    await setNostrKeyOwner(previous.npub, ACCOUNT_B)
    const { nsec, npub } = newKey()
    const ok = await importNsec(nsec, {
      onError: jest.fn(),
      updateFlashBackend: refused,
      accountId: ACCOUNT_B,
    })
    expect(ok).toBe(false)
    const stored = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
    expect(stored && stored.password).toBe(previous.nsec)
    expect(await getNostrKeyOwner(previous.npub)).toBe(ACCOUNT_B)
    expect(await getNostrKeyOwner(npub)).toBeNull()
  })

  it("does not write the keychain until the backend has accepted", async () => {
    const { nsec } = newKey()
    const order: string[] = []
    // The keychain module is a jest.fn mock; a one-shot implementation leaves
    // its default in-memory store behaviour intact for later tests.
    ;(Keychain.setInternetCredentials as jest.Mock).mockImplementationOnce(async () => {
      order.push("keychain")
      return false
    })
    await importNsec(nsec, {
      onError: jest.fn(),
      updateFlashBackend: async () => {
        order.push("backend")
        return true
      },
      accountId: ACCOUNT_B,
    })
    expect(order).toEqual(["backend", "keychain"])
  })

  it("drops the owner record of the key it replaced", async () => {
    const previous = newKey()
    await Keychain.setInternetCredentials(
      KEYCHAIN_NOSTRCREDS_KEY,
      KEYCHAIN_NOSTRCREDS_KEY,
      previous.nsec,
    )
    await setNostrKeyOwner(previous.npub, ACCOUNT_A)
    const { nsec, npub } = newKey()
    await importNsec(nsec, {
      onError: jest.fn(),
      updateFlashBackend: accepted,
      accountId: ACCOUNT_B,
    })
    expect(await getNostrKeyOwner(previous.npub)).toBeNull()
    expect(await getNostrKeyOwner(npub)).toBe(ACCOUNT_B)
  })

  it("keeps the owner when the same key is imported again", async () => {
    const { nsec, npub } = newKey()
    await Keychain.setInternetCredentials(
      KEYCHAIN_NOSTRCREDS_KEY,
      KEYCHAIN_NOSTRCREDS_KEY,
      nsec,
    )
    await setNostrKeyOwner(npub, ACCOUNT_A)
    await importNsec(nsec, {
      onError: jest.fn(),
      updateFlashBackend: accepted,
      accountId: ACCOUNT_A,
    })
    expect(await getNostrKeyOwner(npub)).toBe(ACCOUNT_A)
  })
})
