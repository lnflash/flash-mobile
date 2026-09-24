/**
 * signer.generateAndStoreKey — the owner stamp.
 *
 * The key is written to the keychain and, when an account is given, recorded
 * as that account's (see key-owner.ts). Without the stamp every key the app
 * generates has no owner and the shared-phone guard in the ensurer never
 * fires.
 */
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Keychain from "react-native-keychain"
import { nip19 } from "nostr-tools"
import { getNostrKeyOwner } from "@app/nostr/key-owner"

const mockFetchSecret = jest.fn()
jest.mock("@app/utils/nostr", () => ({
  fetchSecretFromLocalStorage: () => mockFetchSecret(),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateAndStoreKey, getSigner, clearSigner } = require("@app/nostr/signer")

const KEYCHAIN_KEY = "nostr_creds_key"
const ACCOUNT_A = "account-a"

describe("generateAndStoreKey", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    clearSigner()
  })

  it("records the given account as the owner of the generated key", async () => {
    const npub = await generateAndStoreKey(ACCOUNT_A)
    expect(npub.startsWith("npub1")).toBe(true)
    expect(await getNostrKeyOwner(npub)).toBe(ACCOUNT_A)
  })

  it("stores the matching nsec in the keychain", async () => {
    const npub = await generateAndStoreKey(ACCOUNT_A)
    expect(Keychain.setInternetCredentials).toHaveBeenCalledTimes(1)
    const [server, , nsec] = (Keychain.setInternetCredentials as jest.Mock).mock.calls[0]
    expect(server).toBe(KEYCHAIN_KEY)
    // The stored secret is the one the returned npub derives from.
    mockFetchSecret.mockResolvedValue(nsec)
    const signer = await getSigner()
    expect(nip19.npubEncode(await signer.getPublicKey())).toBe(npub)
  })

  it("leaves the key ownerless when no account is given", async () => {
    const npub = await generateAndStoreKey()
    expect(await getNostrKeyOwner(npub)).toBeNull()
  })
})
