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

  it("treats a void backend result as registered", async () => {
    // Callers that do not report refusals resolve undefined; only an explicit
    // `false` is a refusal.
    const { nsec, npub } = newKey()
    const ok = await importNsec(nsec, {
      onError: jest.fn(),
      updateFlashBackend: async () => undefined,
      accountId: ACCOUNT_B,
    })
    expect(ok).toBe(true)
    expect(await getNostrKeyOwner(npub)).toBe(ACCOUNT_B)
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
