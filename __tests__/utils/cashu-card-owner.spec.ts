/**
 * ENG-675: the card's owner (card protocol 2.0). What it pins:
 *   - the owner's proof is ECDSA P-256 over label ‖ nonce ‖ value, for every
 *     label the applet checks, held to cashu-javacard spec/vectors/owner.json
 *     and to node's own ECDSA;
 *   - every owner's command takes a fresh nonce (GET_NONCE), one proof each;
 *   - the owner key is derived from the app's seed where it has one
 *     (HMAC-SHA256(seed, "CashuCard/owner" ‖ 00 ‖ card key) mod n), and is a
 *     random key that lives only on this phone where it has none;
 *   - the Keychain store reads strictly and never replaces a saved key;
 *   - setup saves the key BEFORE SET_OWNER goes out, and keeps it when
 *     SET_OWNER's answer is lost.
 */
import { createHash, createHmac, createPublicKey, verify as nodeVerify } from "crypto"
import * as bip39 from "bip39"
import * as Keychain from "react-native-keychain"
import { p256 } from "@noble/curves/p256"

import { CardError, getInfo } from "../../app/utils/cashu-card"
import { setCardBridge } from "../../app/utils/cashu-card-bridge"
import {
  NO_LIMITS,
  OWNER_DERIVATION_LABEL,
  TEST_OWNER_PRIVATE_KEY,
  allowLoad,
  deriveOwnerKey,
  limitValue,
  ownerProof,
  ownerPublicKey,
  ownerSigner,
  randomOwnerKey,
  refreshCard,
  setLimits,
  setOwner,
} from "../../app/utils/cashu-card-owner"
import {
  CardNotOpenError,
  OwnerKeyStoreError,
  SEED_SERVER,
  confirmOwnerKey,
  loadSeed,
  newOwnerKey,
  ownerKeyFor,
  ownerKeyStore,
  refreshAsOwner,
  resetSeedCache,
  saveOwnerKey,
  setUpCard,
} from "../../app/utils/cashu-card-owner-store"
import { FAKE_OWNER_KEY, createFakeCard } from "../helpers/fake-cashu"
import { HEADER_VECTORS, headerBytes } from "../helpers/block-headers"

const fromHex = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16))
const hex = (b: ArrayLike<number>) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")

const OWNER_SERVER = "flashcard-v2-owner"
const CARD = "02fa05ed0a3649886270bacec5ddc1a3643009a759bee996f9a6ac060c9992a82e"
const P256_N = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
)
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

/** cashu-javacard spec/vectors/owner.json (pinned ref): one proof for each label, and the key. */
const OWNER_VECTOR_KEY =
  "04aaa0aae0253f54d15aad42e4b8424bdc25d469e5967ac2da2738daca85a37afcfa5ed5d961320b9bdc39a703ddea98ac72e3e6cbd9c238a67f2475d8ad1d3b25"
const OWNER_VECTORS = [
  {
    label: "CashuCard/change-pin",
    value: "35363738",
    signature:
      "3045022100b5a105b400b83d81ad4c55ede47bdbbb55183779d2eda1c491286a43c19914470220781c545d227d396667dbcb0328a60703b937a6c7135aa1140216dbf94cc24838",
  },
  {
    label: "CashuCard/set-limit",
    value: "00001388",
    signature:
      "3045022100e842dc282f3b6c2b74d853f5fda7f038ad6f2b058c3796311d6040c6732b6ed7022017c6608ca2405eb27a1e77ff2d6437ef661f164c621b22a70830eb6b7635e30e",
  },
  {
    label: "CashuCard/load",
    value: "",
    signature:
      "3046022100ba6b60f9e229e50a7f62f8a9187a90c80f00194466dbb80e0072a328613fc542022100ce6b8875a93f2c41379333aa72bb73204c8343f798fce1ff1d5cd493c2f4c8d7",
  },
  {
    label: "CashuCard/set-owner",
    value:
      "04b6abfcb0a1eb2b12ad49452cbb1d062e50702660c3c1e64c8b6035bd7bcc3a0ce34858528ea343eed8f7d669095157dba840108a0472e66322ee790349053443",
    signature:
      "304502206dd3cd9e4e184f4c619b356e5e6f16e8bd84ea72df4f623ca228deabafeb7348022100fb8c72dff6e4b66669067a1b82ace3f1096d957db1cb52557daa72712c4776a5",
  },
]
const VECTOR_NONCE = "6c5544797a91115dc3330ebd003851d2"

/** A P-256 public key (65 bytes, hex) as a node KeyObject, for node's own ECDSA. */
const nodeKey = (pub: string) =>
  createPublicKey({
    key: Buffer.concat([
      Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
      Buffer.from(pub, "hex"),
    ]),
    format: "der",
    type: "spki",
  })

const messageOf = (label: string, nonce: string, value: string) =>
  Buffer.concat([
    Buffer.from(label, "ascii"),
    Buffer.from(nonce, "hex"),
    Buffer.from(value, "hex"),
  ])

beforeEach(async () => {
  await Keychain.resetInternetCredentials({ server: OWNER_SERVER })
  await Keychain.resetInternetCredentials({ server: SEED_SERVER })
  setCardBridge(undefined)
  resetSeedCache()
  jest.clearAllMocks()
})

afterAll(() => setCardBridge(undefined))

describe("the owner's proof", () => {
  OWNER_VECTORS.forEach(({ label, value, signature }) => {
    it(`the applet's vector for ${label} verifies as label ‖ nonce ‖ value, and so does this phone's proof`, () => {
      const message = messageOf(label, VECTOR_NONCE, value)
      // The vector, made by cashu-javacard's own signer, under its key.
      expect(
        nodeVerify(
          "sha256",
          message,
          nodeKey(OWNER_VECTOR_KEY),
          Buffer.from(signature, "hex"),
        ),
      ).toBe(true)
      // This phone's proof over the same bytes, under the TEST key: node checks it as the card would.
      const mine = ownerProof(TEST_OWNER_PRIVATE_KEY, {
        label,
        nonce: fromHex(VECTOR_NONCE),
        value: fromHex(value),
      })
      expect(mine[0]).toBe(0x30)
      expect(mine.length).toBeLessThanOrEqual(72)
      expect(
        nodeVerify(
          "sha256",
          message,
          nodeKey(hex(ownerPublicKey(TEST_OWNER_PRIVATE_KEY))),
          Buffer.from(mine),
        ),
      ).toBe(true)
      // And not over another label: the label is in the message.
      expect(
        nodeVerify(
          "sha256",
          messageOf("CashuCard/other", VECTOR_NONCE, value),
          nodeKey(hex(ownerPublicKey(TEST_OWNER_PRIVATE_KEY))),
          Buffer.from(mine),
        ),
      ).toBe(false)
    })
  })

  it('the TEST owner key is SHA-256("cashu-javacard/cardctl test owner key") mod n, as cardctl and cardsim hold it', () => {
    const d =
      BigInt(
        `0x${createHash("sha256")
          .update("cashu-javacard/cardctl test owner key")
          .digest("hex")}`,
      ) % P256_N
    expect(TEST_OWNER_PRIVATE_KEY).toBe(d.toString(16).padStart(64, "0"))
    expect(ownerPublicKey(TEST_OWNER_PRIVATE_KEY)).toHaveLength(65)
    expect(ownerPublicKey(TEST_OWNER_PRIVATE_KEY)[0]).toBe(0x04)
  })

  it("refuses a nonce that is not 16 bytes", () => {
    expect(() =>
      ownerProof(FAKE_OWNER_KEY, {
        label: "CashuCard/load",
        nonce: [1, 2, 3],
        value: [],
      }),
    ).toThrow()
  })
})

describe("one nonce per proof", () => {
  it("every owner's command asks GET_NONCE first, and each proof is over its own nonce", async () => {
    const card = createFakeCard()
    const nonces: number[][] = []
    const sign = jest.fn(async (label: string, nonce: number[], value: number[]) => {
      nonces.push(nonce)
      return ownerProof(FAKE_OWNER_KEY, { label, nonce, value })
    })
    await allowLoad(card.transceive, sign)
    await setLimits(card.transceive, sign, NO_LIMITS)
    expect(card.ins()).toEqual([0x44, 0x45, 0x44, 0x34])
    expect(sign.mock.calls.map(([label]) => label)).toEqual([
      "CashuCard/load",
      "CashuCard/set-limit",
    ])
    expect(hex(nonces[0])).not.toBe(hex(nonces[1]))
  })

  it("a proof sent twice is refused the second time: the card's nonce is good for one try", async () => {
    const card = createFakeCard()
    await allowLoad(card.transceive, ownerSigner(FAKE_OWNER_KEY))
    const [, allow] = card.transceive.mock.calls.map(([apdu]) => apdu)
    const replay = await card.transceive(allow)
    expect(replay.slice(-2)).toEqual([0x6a, 0x91])
  })

  it("a phone whose key is not the owner's is refused (6A91), at no cost and with nothing changed", async () => {
    const card = createFakeCard()
    await expect(
      allowLoad(card.transceive, ownerSigner("11".repeat(32))),
    ).rejects.toMatchObject({
      sw: 0x6a91,
    })
    expect(card.granted()).toBe(false)
  })

  it("a card with no owner answers GET_NONCE with 6A90", async () => {
    const card = createFakeCard(128, { owner: null })
    const error = await allowLoad(card.transceive, ownerSigner(FAKE_OWNER_KEY)).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(CardError)
    expect(error.sw).toBe(0x6a90)
  })
})

describe("SET_LIMIT's value", () => {
  it("is always the thirteen-byte form: the day's, the payment's, the allowance, the budget", () => {
    expect(
      limitValue({ day: 5000, payment: 1000, allowance: 250, rollBudget: 7 }),
    ).toEqual([0, 0, 0x13, 0x88, 0, 0, 0x03, 0xe8, 0, 0, 0, 0xfa, 7])
  })

  it("starts off: no limits, the budget 7", () => {
    expect(NO_LIMITS).toEqual({ day: 0, payment: 0, allowance: 0, rollBudget: 7 })
    expect(limitValue(NO_LIMITS)).toEqual([...new Array(12).fill(0), 7])
  })

  it("refuses a budget outside 1 to 30, and a limit the four bytes cannot hold", () => {
    expect(() => limitValue({ ...NO_LIMITS, rollBudget: 0 })).toThrow()
    expect(() => limitValue({ ...NO_LIMITS, rollBudget: 31 })).toThrow()
    expect(() => limitValue({ ...NO_LIMITS, day: 2 ** 32 })).toThrow()
    expect(() => limitValue({ ...NO_LIMITS, allowance: -1 })).toThrow()
  })

  it("the card holds what the owner set, the budget included", async () => {
    const card = createFakeCard(128, { pin: "1234" })
    await setLimits(card.transceive, ownerSigner(FAKE_OWNER_KEY), {
      day: 5000,
      payment: 1000,
      allowance: 250,
      rollBudget: 12,
    })
    expect(card.limits()).toEqual({
      day: 5000,
      payment: 1000,
      allowance: 250,
      rollBudget: 12,
    })
  })
})

describe("REFRESH", () => {
  it("sends the owner's proof over the header, and reads the card's clock", async () => {
    const card = createFakeCard()
    const [vector] = HEADER_VECTORS
    await expect(
      refreshCard(card.transceive, ownerSigner(FAKE_OWNER_KEY), headerBytes(vector)),
    ).resolves.toBe(vector.time)
    const refresh = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x53)
    expect(refresh?.slice(-81)).toEqual([...headerBytes(vector), 0x04])
  })

  it("refuses a header that is not 80 bytes before anything is sent", async () => {
    const card = createFakeCard()
    await expect(
      refreshCard(card.transceive, ownerSigner(FAKE_OWNER_KEY), [1, 2]),
    ).rejects.toThrow()
    expect(card.ins()).toEqual([])
  })
})

describe("the owner key from the seed (decision 14)", () => {
  const seed = Uint8Array.from(bip39.mnemonicToSeedSync(MNEMONIC))

  it('is HMAC-SHA256(seed, "CashuCard/owner" ‖ 00 ‖ card key) mod n', () => {
    const expected =
      BigInt(
        `0x${createHmac("sha256", Buffer.from(seed))
          .update(
            Buffer.concat([
              Buffer.from(OWNER_DERIVATION_LABEL),
              Buffer.from([0]),
              Buffer.from(CARD, "hex"),
            ]),
          )
          .digest("hex")}`,
      ) % P256_N
    expect(deriveOwnerKey(seed, CARD)).toBe(expected.toString(16).padStart(64, "0"))
    expect(OWNER_DERIVATION_LABEL).toBe("CashuCard/owner")
  })

  it("gives each card its own key, and the same key again from the same seed: a restore restores ownership", () => {
    const other = "03" + "cd".repeat(32)
    expect(deriveOwnerKey(seed, CARD)).not.toBe(deriveOwnerKey(seed, other))
    expect(
      deriveOwnerKey(Uint8Array.from(bip39.mnemonicToSeedSync(MNEMONIC)), CARD),
    ).toBe(deriveOwnerKey(seed, CARD))
  })

  it("refuses a seed that is not 64 bytes, and a card key that is not one", () => {
    expect(() => deriveOwnerKey(seed.slice(0, 32), CARD)).toThrow()
    expect(() => deriveOwnerKey(seed, "04" + "00".repeat(32))).toThrow()
  })

  it("newOwnerKey derives from the phone's seed when it has one", async () => {
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    await expect(newOwnerKey(CARD)).resolves.toEqual({
      privateKey: deriveOwnerKey(seed, CARD),
      source: "seed",
      saved: false,
    })
  })

  it("newOwnerKey makes a random key that lives only on this phone when it has no seed", async () => {
    const a = await newOwnerKey(CARD)
    const b = await newOwnerKey(CARD)
    expect(a.source).toBe("device")
    expect(a.privateKey).toMatch(/^[0-9a-f]{64}$/)
    expect(a.privateKey).not.toBe(b.privateKey)
    expect(randomOwnerKey()).not.toBe(randomOwnerKey())
  })

  it("never makes a seed: the Keychain's seed entry stays as it was", async () => {
    await newOwnerKey(CARD)
    expect(await Keychain.getInternetCredentials(SEED_SERVER)).toBe(false)
  })
})

describe("ownerKeyFor", () => {
  it("is the dev bridge's key in a development build, before anything saved", async () => {
    setCardBridge({ url: "http://localhost:9876", ownerKey: TEST_OWNER_PRIVATE_KEY })
    await ownerKeyStore.put(CARD, {
      privateKey: FAKE_OWNER_KEY,
      source: "device",
      createdAt: 1,
    })
    await expect(ownerKeyFor(CARD)).resolves.toEqual({
      privateKey: TEST_OWNER_PRIVATE_KEY,
      source: "dev",
      saved: false,
    })
  })

  it("never uses the dev bridge's key in a release build (__DEV__ false)", async () => {
    setCardBridge({ url: "http://localhost:9876", ownerKey: TEST_OWNER_PRIVATE_KEY })
    const dev = globalThis as unknown as { __DEV__: boolean }
    dev.__DEV__ = false
    try {
      await expect(ownerKeyFor(CARD)).resolves.toBeUndefined()
      await expect(newOwnerKey(CARD)).resolves.toMatchObject({ source: "device" })
    } finally {
      dev.__DEV__ = true
    }
  })

  it("is the saved key, then the seed's, then none", async () => {
    await expect(ownerKeyFor(CARD)).resolves.toBeUndefined()
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    await expect(ownerKeyFor(CARD)).resolves.toMatchObject({
      source: "seed",
      saved: false,
    })
    await ownerKeyStore.put(CARD, {
      privateKey: FAKE_OWNER_KEY,
      source: "device",
      createdAt: 1,
    })
    await expect(ownerKeyFor(CARD)).resolves.toEqual({
      privateKey: FAKE_OWNER_KEY,
      source: "device",
      saved: true,
    })
  })
})

describe("loadSeed", () => {
  it("runs the seed's PBKDF2 once per mnemonic per session, and again for a different mnemonic", async () => {
    const pbkdf2 = jest.spyOn(bip39, "mnemonicToSeedSync")
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const first = await loadSeed()
    const again = await loadSeed()
    expect(again).toBe(first)
    expect(pbkdf2).toHaveBeenCalledTimes(1)
    const other =
      "legal winner thank year wave sausage worth useful legal winner thank yellow"
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, other)
    await expect(loadSeed()).resolves.toEqual(
      Uint8Array.from(bip39.mnemonicToSeedSync(other)),
    )
    expect(pbkdf2).toHaveBeenCalledTimes(3)
    pbkdf2.mockRestore()
  })

  it("has none when the phone has no seed, or one that is not a phrase", async () => {
    await expect(loadSeed()).resolves.toBeUndefined()
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, "not a phrase")
    await expect(loadSeed()).resolves.toBeUndefined()
  })
})

describe("confirmOwnerKey: holding a key is not owning the card (Foxy's cardGrant)", () => {
  const seed = Uint8Array.from(bip39.mnemonicToSeedSync(MNEMONIC))

  it("a seed's key the card refuses (6A91: another phone's card) is not this phone's, and is not saved", async () => {
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const card = createFakeCard(128, { owner: FAKE_OWNER_KEY })
    await expect(confirmOwnerKey(card.transceive, card.pubkey)).resolves.toBeUndefined()
    expect(card.ins()).toEqual([0x44, 0x45])
    expect(card.granted()).toBe(false)
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toBeUndefined()
  })

  it("a seed's key the card takes (a phone restored from the seed) is this phone's, and is saved for the next tap", async () => {
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const pubkey = createFakeCard(1).pubkey
    const key = deriveOwnerKey(seed, pubkey)
    const card = createFakeCard(128, { owner: key })
    await expect(confirmOwnerKey(card.transceive, card.pubkey)).resolves.toEqual({
      privateKey: key,
      source: "seed",
      saved: true,
    })
    expect(card.granted()).toBe(true)
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toMatchObject({
      privateKey: key,
      source: "seed",
    })
    // The next read asks the card again, with the saved key, and saves nothing.
    const save = jest.fn(saveOwnerKey)
    const next = createFakeCard(128, { owner: key })
    await expect(
      confirmOwnerKey(next.transceive, next.pubkey, save),
    ).resolves.toMatchObject({ saved: true })
    expect(next.ins()).toEqual([0x44, 0x45])
    expect(next.granted()).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it("a key the card took is this phone's even when the Keychain will not keep it now", async () => {
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const pubkey = createFakeCard(1).pubkey
    const card = createFakeCard(128, { owner: deriveOwnerKey(seed, pubkey) })
    const save = jest.fn(async () => {
      throw new OwnerKeyStoreError("the owner key was not saved")
    })
    await expect(
      confirmOwnerKey(card.transceive, card.pubkey, save),
    ).resolves.toMatchObject({ source: "seed", saved: false })
  })

  it("asks the card nothing for a phone with no key, or the dev bridge's", async () => {
    const card = createFakeCard(128, { owner: FAKE_OWNER_KEY })
    await expect(confirmOwnerKey(card.transceive, card.pubkey)).resolves.toBeUndefined()
    setCardBridge({ url: "http://localhost:9876", ownerKey: TEST_OWNER_PRIVATE_KEY })
    await expect(confirmOwnerKey(card.transceive, card.pubkey)).resolves.toMatchObject({
      source: "dev",
    })
    expect(card.ins()).toEqual([])
  })

  it("asks the card about a saved key too: one it took is this phone's, with nothing saved again", async () => {
    const card = createFakeCard(128, { owner: FAKE_OWNER_KEY })
    await ownerKeyStore.put(card.pubkey, {
      privateKey: FAKE_OWNER_KEY,
      source: "device",
      createdAt: 1,
    })
    const save = jest.fn(saveOwnerKey)
    await expect(confirmOwnerKey(card.transceive, card.pubkey, save)).resolves.toEqual({
      privateKey: FAKE_OWNER_KEY,
      source: "device",
      saved: true,
    })
    expect(card.ins()).toEqual([0x44, 0x45])
    expect(card.granted()).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it("a saved key the card refuses (6A91: a setup cut short, then set up by another phone) is not this phone's", async () => {
    // Saved before SET_OWNER, which never landed; another phone owns the card.
    const other = "33".repeat(32)
    const card = createFakeCard(128, { owner: FAKE_OWNER_KEY })
    await ownerKeyStore.put(card.pubkey, {
      privateKey: other,
      source: "device",
      createdAt: 1,
    })
    await expect(confirmOwnerKey(card.transceive, card.pubkey)).resolves.toBeUndefined()
    expect(card.ins()).toEqual([0x44, 0x45])
    expect(card.granted()).toBe(false)
    // The saved key stays: the store never replaces one (it may be the owner's).
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toMatchObject({
      privateKey: other,
    })
  })

  it("rejects on anything but the card's yes or no: the caller knows nothing either way", async () => {
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const lost = jest.fn(async () => {
      throw new Error("Tag was lost")
    })
    await expect(confirmOwnerKey(lost, CARD)).rejects.toThrow("Tag was lost")
    const locked = jest.fn(async (apdu: number[]) =>
      apdu[1] === 0x44 ? [...new Array(16).fill(1), 0x90, 0x00] : [0x69, 0x86],
    )
    await expect(confirmOwnerKey(locked, CARD)).rejects.toBeInstanceOf(CardError)
  })
})

describe("refreshAsOwner: a locked card asked by REFRESH, the one owner's command it still takes", () => {
  const seed = Uint8Array.from(bip39.mnemonicToSeedSync(MNEMONIC))
  const [vector] = HEADER_VECTORS

  it("a locked card refuses the grant (6986) and takes its owner's REFRESH", async () => {
    const card = createFakeCard(128, { owner: FAKE_OWNER_KEY, locked: true, rolls: 4 })
    await expect(
      allowLoad(card.transceive, ownerSigner(FAKE_OWNER_KEY)),
    ).rejects.toMatchObject({
      sw: 0x6986,
    })
    await expect(
      refreshCard(card.transceive, ownerSigner(FAKE_OWNER_KEY), headerBytes(vector)),
    ).resolves.toBe(vector.time)
    expect(card.rolls()).toBe(0)
  })

  it("a seed's key the locked card takes is this phone's, saved, and the card's clock comes back", async () => {
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const pubkey = createFakeCard(1).pubkey
    const key = deriveOwnerKey(seed, pubkey)
    const card = createFakeCard(128, { owner: key, locked: true, rolls: 2 })
    await expect(
      refreshAsOwner(card.transceive, card.pubkey, headerBytes(vector)),
    ).resolves.toEqual({
      key: { privateKey: key, source: "seed", saved: true },
      now: vector.time,
    })
    expect(card.ins()).toEqual([0x44, 0x53])
    expect(card.rolls()).toBe(0)
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toMatchObject({
      privateKey: key,
      source: "seed",
    })
  })

  it("another phone's locked card refuses it (6A91): not this phone's, no PIN try spent, nothing changed or saved", async () => {
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const card = createFakeCard(128, {
      owner: FAKE_OWNER_KEY,
      locked: true,
      pin: "1234",
      rolls: 5,
    })
    await expect(
      refreshAsOwner(card.transceive, card.pubkey, headerBytes(vector)),
    ).resolves.toBeUndefined()
    expect(card.ins()).toEqual([0x44, 0x53])
    expect(card.rolls()).toBe(5)
    expect(card.now()).toBe(0)
    expect(card.triesLeft()).toBe(3)
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toBeUndefined()
  })

  it("sends nothing for a phone with no key, and rejects on anything but the card's yes or no", async () => {
    const card = createFakeCard(128, { owner: FAKE_OWNER_KEY, locked: true, rolls: 1 })
    await expect(
      refreshAsOwner(card.transceive, card.pubkey, headerBytes(vector)),
    ).resolves.toBeUndefined()
    expect(card.ins()).toEqual([])
    await Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)
    const lost = jest.fn(async () => {
      throw new Error("Tag was lost")
    })
    await expect(refreshAsOwner(lost, CARD, headerBytes(vector))).rejects.toThrow(
      "Tag was lost",
    )
  })
})

describe("the owner key store", () => {
  it("saves a key and reads it back, by the card's key in either case", async () => {
    await ownerKeyStore.put(CARD.toUpperCase(), {
      privateKey: FAKE_OWNER_KEY,
      source: "seed",
      createdAt: 5,
    })
    await expect(ownerKeyStore.get(CARD)).resolves.toEqual({
      privateKey: FAKE_OWNER_KEY,
      source: "seed",
      createdAt: 5,
    })
  })

  it("never replaces a saved key with another: the card may hold the first as its owner", async () => {
    await ownerKeyStore.put(CARD, {
      privateKey: FAKE_OWNER_KEY,
      source: "device",
      createdAt: 1,
    })
    await expect(
      ownerKeyStore.put(CARD, {
        privateKey: "11".repeat(32),
        source: "device",
        createdAt: 2,
      }),
    ).rejects.toBeInstanceOf(OwnerKeyStoreError)
    await expect(ownerKeyStore.get(CARD)).resolves.toMatchObject({
      privateKey: FAKE_OWNER_KEY,
    })
  })

  it("throws on an unreadable value or an unknown format, rather than reading it as no keys", async () => {
    await Keychain.setInternetCredentials(OWNER_SERVER, "owners", "{not json")
    await expect(ownerKeyStore.get(CARD)).rejects.toBeInstanceOf(OwnerKeyStoreError)
    await Keychain.setInternetCredentials(
      OWNER_SERVER,
      "owners",
      JSON.stringify({ format: 9, keys: {} }),
    )
    await expect(ownerKeyStore.get(CARD)).rejects.toThrow(/unknown format/)
    await Keychain.setInternetCredentials(
      OWNER_SERVER,
      "owners",
      JSON.stringify({
        format: 1,
        keys: { [CARD]: { privateKey: "zz", source: "device", createdAt: 1 } },
      }),
    )
    await expect(ownerKeyStore.get(CARD)).rejects.toThrow(/unknown format/)
    // And a write after a failed read writes nothing over it.
    await expect(
      ownerKeyStore.put(CARD, {
        privateKey: FAKE_OWNER_KEY,
        source: "device",
        createdAt: 1,
      }),
    ).rejects.toBeInstanceOf(OwnerKeyStoreError)
  })

  it("saveOwnerKey never saves the dev bridge's key, nor one already saved", async () => {
    await saveOwnerKey(CARD, {
      privateKey: TEST_OWNER_PRIVATE_KEY,
      source: "dev",
      saved: false,
    })
    await expect(ownerKeyStore.get(CARD)).resolves.toBeUndefined()
    await saveOwnerKey(
      CARD,
      { privateKey: FAKE_OWNER_KEY, source: "seed", saved: false },
      () => 9,
    )
    await expect(ownerKeyStore.get(CARD)).resolves.toEqual({
      privateKey: FAKE_OWNER_KEY,
      source: "seed",
      createdAt: 9,
    })
  })
})

describe("setUpCard: personalisation, owner last", () => {
  const key = { privateKey: FAKE_OWNER_KEY, source: "device" as const, saved: false }

  it("SET_PIN, VERIFY_PIN, SET_CARD, the key saved, then SET_OWNER with the anchor: in that order", async () => {
    const card = createFakeCard(128, { owner: null })
    const order: string[] = []
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      order.push(apdu[1].toString(16))
      return answer(apdu)
    })
    const save = jest.fn(async () => {
      order.push("saved")
    })
    const info = await getInfo(card.transceive)
    order.length = 0
    await setUpCard(
      card.transceive,
      {
        cardPubkey: card.pubkey,
        info,
        pin: "1234",
        mint: "https://mint.test",
        anchor: headerBytes(HEADER_VECTORS[2]),
        key,
      },
      save,
    )
    expect(order).toEqual(["41", "40", "32", "saved", "43"])
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    expect(card.pin()).toBe("1234")
    expect(card.record()).toEqual({ set: true, mint: "https://mint.test" })
    // The anchor took: the card never runs at now = 0.
    expect(card.now()).toBe(HEADER_VECTORS[2].time)
    const setOwnerApdu = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x43)
    expect(setOwnerApdu?.[4]).toBe(65 + 80)
  })

  it("with no PIN: SET_CARD, the key saved, SET_OWNER; no anchor when the phone has no header", async () => {
    const card = createFakeCard(128, { owner: null })
    const info = await getInfo(card.transceive)
    card.transceive.mockClear()
    await setUpCard(card.transceive, {
      cardPubkey: card.pubkey,
      info,
      mint: "https://mint.test",
      key,
    })
    expect(card.ins()).toEqual([0x32, 0x43])
    expect(card.pin()).toBeUndefined()
    expect(card.now()).toBe(0)
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toMatchObject({
      privateKey: FAKE_OWNER_KEY,
      source: "device",
    })
  })

  it("keeps the key saved when SET_OWNER's answer is lost: the card may hold it as its owner", async () => {
    const card = createFakeCard(128, { owner: null })
    const info = await getInfo(card.transceive)
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      const response = await answer(apdu)
      // The card took SET_OWNER, and its answer never came back.
      if (apdu[1] === 0x43) throw new Error("Tag was lost")
      return response
    })
    await expect(
      setUpCard(card.transceive, {
        cardPubkey: card.pubkey,
        info,
        mint: "https://mint.test",
        key,
      }),
    ).rejects.toThrow("Tag was lost")
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toMatchObject({
      privateKey: FAKE_OWNER_KEY,
    })
    // The next tap proves it: the card grants a load to the key this phone kept.
    card.transceive.mockImplementation(answer)
    await expect(
      allowLoad(card.transceive, ownerSigner(FAKE_OWNER_KEY)),
    ).resolves.toBeUndefined()
  })

  it("never sends SET_OWNER when the key could not be saved", async () => {
    const card = createFakeCard(128, { owner: null })
    const info = await getInfo(card.transceive)
    card.transceive.mockClear()
    const save = jest.fn(async () => {
      throw new OwnerKeyStoreError("the owner key was not saved")
    })
    await expect(
      setUpCard(
        card.transceive,
        { cardPubkey: card.pubkey, info, mint: "https://mint.test", key },
        save,
      ),
    ).rejects.toBeInstanceOf(OwnerKeyStoreError)
    expect(card.ins()).not.toContain(0x43)
    expect(card.owner()).toBeUndefined()
  })

  it("refuses a card that has an owner, holds value, or has a PIN nobody here knows: before anything is sent", async () => {
    const card = createFakeCard()
    const owned = await getInfo(card.transceive)
    card.transceive.mockClear()
    await expect(
      setUpCard(card.transceive, {
        cardPubkey: card.pubkey,
        info: owned,
        mint: "m",
        key,
      }),
    ).rejects.toMatchObject({ reason: "owned" })
    await expect(
      setUpCard(card.transceive, {
        cardPubkey: card.pubkey,
        info: { ...owned, hasOwner: false, unspent: 1 },
        mint: "m",
        key,
      }),
    ).rejects.toMatchObject({ reason: "in-use" })
    await expect(
      setUpCard(card.transceive, {
        cardPubkey: card.pubkey,
        info: { ...owned, hasOwner: false, unspent: 0, pinState: "set" },
        mint: "m",
        key,
      }),
    ).rejects.toBeInstanceOf(CardNotOpenError)
    expect(card.ins()).toEqual([])
  })

  it("SET_OWNER refuses an anchor that is not 80 bytes before anything is sent", async () => {
    const card = createFakeCard(128, { owner: null })
    await expect(setOwner(card.transceive, FAKE_OWNER_KEY, [1, 2, 3])).rejects.toThrow()
    expect(card.ins()).toEqual([])
  })

  it("the key the card holds is the owner key's public half, 04 ‖ X ‖ Y", () => {
    const pub = ownerPublicKey(FAKE_OWNER_KEY)
    expect(hex(pub)).toBe(hex(p256.getPublicKey(FAKE_OWNER_KEY, false)))
  })
})
