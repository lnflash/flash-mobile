/**
 * reconnectLocalNpub — Settings › Nostr › Advanced › Reconnect profile.
 *
 * The backend refuses `userUpdateNpub` with NPUB_NOT_AVAILABLE when another
 * account holds the key. That must surface as `refused`, never `ok`: the
 * relink-failed copy sends users here, and telling them "Success" while the
 * account is still undeliverable would close the only path they were given.
 */
import AsyncStorage from "@react-native-async-storage/async-storage"
import { nip19 } from "nostr-tools"
import { reconnectLocalNpub } from "@app/nostr/reconnect-npub"
import { getNostrKeyOwner, setNostrKeyOwner } from "@app/nostr/key-owner"

const LOCAL_HEX = "a".repeat(64)
const LOCAL_NPUB = nip19.npubEncode(LOCAL_HEX)

const mockGetSigner = jest.fn()
jest.mock("@app/nostr/signer", () => ({
  getSigner: () => mockGetSigner(),
}))

describe("reconnectLocalNpub", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    mockGetSigner.mockResolvedValue({ getPublicKey: async () => LOCAL_HEX })
  })

  it("reports no-key without calling the backend when there is no local signer", async () => {
    mockGetSigner.mockRejectedValue(new Error("No signer available"))
    const update = jest.fn()
    await expect(reconnectLocalNpub(update)).resolves.toEqual({ status: "no-key" })
    expect(update).not.toHaveBeenCalled()
  })

  it("registers the local npub and reports ok when the backend accepts", async () => {
    const update = jest.fn().mockResolvedValue({
      data: { userUpdateNpub: { errors: [] } },
    })
    await expect(reconnectLocalNpub(update)).resolves.toEqual({
      status: "ok",
      npub: LOCAL_NPUB,
    })
    expect(update).toHaveBeenCalledWith(LOCAL_NPUB)
  })

  it("reports refused, not ok, when the backend returns errors", async () => {
    const update = jest.fn().mockResolvedValue({
      data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
    })
    await expect(reconnectLocalNpub(update)).resolves.toEqual({
      status: "refused",
      npub: LOCAL_NPUB,
      code: "NPUB_NOT_AVAILABLE",
      mayAdviseDelete: false,
    })
  })

  describe("key ownership", () => {
    const refuse = () =>
      jest.fn().mockResolvedValue({
        data: { userUpdateNpub: { errors: [{ code: "NPUB_NOT_AVAILABLE" }] } },
      })

    it("records the account as the key's owner on success", async () => {
      const update = jest.fn().mockResolvedValue({
        data: { userUpdateNpub: { errors: [] } },
      })
      await setNostrKeyOwner(LOCAL_NPUB, "account-a")
      await reconnectLocalNpub(update, "account-b")
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBe("account-b")
    })

    it("does not record an owner on refusal", async () => {
      await reconnectLocalNpub(refuse(), "account-b")
      expect(await getNostrKeyOwner(LOCAL_NPUB)).toBeNull()
    })

    it("never advises deleting a key another account on this phone owns", async () => {
      // B declined or failed the foreign prompt, then tapped Reconnect: A's
      // only copy of the key must not be called disposable.
      await setNostrKeyOwner(LOCAL_NPUB, "account-a")
      const result = await reconnectLocalNpub(refuse(), "account-b")
      expect(result).toMatchObject({ status: "refused", mayAdviseDelete: false })
    })

    it("never advises deleting a key with no owner record", async () => {
      // Every key from before the owner record: the refusal alone says some
      // other account holds it.
      const result = await reconnectLocalNpub(refuse(), "account-b")
      expect(result).toMatchObject({ status: "refused", mayAdviseDelete: false })
    })

    it("allows the delete advice only for a key this account owns", async () => {
      await setNostrKeyOwner(LOCAL_NPUB, "account-b")
      const result = await reconnectLocalNpub(refuse(), "account-b")
      expect(result).toMatchObject({ status: "refused", mayAdviseDelete: true })
    })
  })

  it("propagates a rejected mutation instead of swallowing it as success", async () => {
    const update = jest.fn().mockRejectedValue(new Error("network"))
    await expect(reconnectLocalNpub(update)).rejects.toThrow("network")
  })
})
