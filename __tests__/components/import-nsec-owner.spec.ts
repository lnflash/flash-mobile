/**
 * importNsec — the owner stamp.
 *
 * An imported nsec replaces the device key. It must be recorded as the
 * importing account's as soon as the backend accepts it (not only on the next
 * ensurer run), a refused key must not be claimed, and the owner record of
 * the key it replaced must not linger.
 */
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Keychain from "react-native-keychain"
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools"
import { importNsec, KEYCHAIN_NOSTRCREDS_KEY } from "@app/components/import-nsec/utils"
import { getNostrKeyOwner, setNostrKeyOwner } from "@app/nostr/key-owner"

const ACCOUNT_A = "account-a"
const ACCOUNT_B = "account-b"

const newKey = () => {
  const sk = generateSecretKey()
  return { nsec: nip19.nsecEncode(sk), npub: nip19.npubEncode(getPublicKey(sk)) }
}

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
    const ok = await importNsec(nsec, onError, async () => true, { accountId: ACCOUNT_B })
    expect(ok).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    expect(await getNostrKeyOwner(npub)).toBe(ACCOUNT_B)
  })

  it("does not claim a key the backend refused", async () => {
    const { nsec, npub } = newKey()
    await importNsec(nsec, jest.fn(), async () => false, { accountId: ACCOUNT_B })
    expect(await getNostrKeyOwner(npub)).toBeNull()
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
    await importNsec(nsec, jest.fn(), async () => true, { accountId: ACCOUNT_B })
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
    await importNsec(nsec, jest.fn(), async () => true, { accountId: ACCOUNT_A })
    expect(await getNostrKeyOwner(npub)).toBe(ACCOUNT_A)
  })
})
