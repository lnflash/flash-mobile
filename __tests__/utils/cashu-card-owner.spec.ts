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

import {
  CardError,
  CardInfo,
  CardNeedsUpdateError,
  CardProtocolError,
  CardRecord,
  CardTap,
  Transceiver,
  WrongCardError,
  getInfo,
  selectApplet,
} from "../../app/utils/cashu-card"
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
  SETUP_APPLET_VERSIONS,
  checkSetupState,
  freezeSetupIntent,
  newSetupProgress,
  setupWriteSent,
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
import {
  FAKE_OWNER_KEY,
  FakeCard,
  FakeCardOptions,
  createFakeCard,
} from "../helpers/fake-cashu"
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

/** An open, empty, fresh 2.2 card's GET_INFO (ENG-825). */
const baseInfo = (): CardInfo => ({
  version: "2.2",
  major: 2,
  minor: 2,
  maxSlots: 128,
  unspent: 0,
  spent: 0,
  empty: 128,
  secp256k1Native: true,
  schnorr: true,
  sealed: false,
  pinState: "unset",
  format: 4,
  tries: 3,
  locked: false,
  recordSet: false,
  dailyLimit: 0,
  hasOwner: false,
  now: 0,
  windowStart: 0,
  spentToday: 0,
  changeGrant: false,
  paymentLimit: 0,
  allowance: 0,
  nopinSpent: 0,
})

/** That card's GET_CARD: no record. */
const baseRecord = (): CardRecord => ({
  format: 4,
  recordSet: false,
  unit: 0,
  dailyLimit: 0,
  lastHeader: "00".repeat(32),
  rolls: 0,
  rollBudget: 7,
  allowanceArmed: false,
  mint: "",
})

describe("setUpCard: personalisation, owner last", () => {
  const key = { privateKey: FAKE_OWNER_KEY, source: "device" as const, saved: false }
  /** A 2.2 card, the applet version setup writes to (ENG-825). */
  const V22: [number, number] = [2, 2]
  const MINT = "https://mint.test"
  /** What runCardOperation's SELECT and GET_PUBKEY said of `card`. */
  const tapOf = (card: FakeCard, version: number[] = V22): CardTap => ({
    version,
    pubkey: card.pubkey,
  })
  /** One setup sequence's arguments for `card` as `info` reads it. */
  const argsFor = (
    card: FakeCard,
    info: CardInfo,
    { pin, mint = MINT }: { pin?: string; mint?: string } = {},
  ) => ({
    tap: tapOf(card, [info.major, info.minor]),
    info,
    pin,
    intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint, pin }),
    progress: newSetupProgress(),
    key,
  })

  it("SET_PIN, VERIFY_PIN, SET_CARD, the key saved, then SET_OWNER with the anchor: in that order", async () => {
    const card = createFakeCard(128, { owner: null, version: V22 })
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
        ...argsFor(card, info, { pin: "1234", mint: "https://mint.test" }),
        anchor: headerBytes(HEADER_VECTORS[2]),
      },
      save,
    )
    // One read before the writes (ENG-825): GET_CARD, then the same writes in
    // the same order.
    expect(order).toEqual(["16", "41", "40", "32", "saved", "43"])
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
    const card = createFakeCard(128, { owner: null, version: V22 })
    const info = await getInfo(card.transceive)
    card.transceive.mockClear()
    await setUpCard(card.transceive, argsFor(card, info))
    expect(card.ins()).toEqual([0x16, 0x32, 0x43])
    expect(card.pin()).toBeUndefined()
    expect(card.now()).toBe(0)
    await expect(ownerKeyStore.get(card.pubkey)).resolves.toMatchObject({
      privateKey: FAKE_OWNER_KEY,
      source: "device",
    })
  })

  it("keeps the key saved when SET_OWNER's answer is lost: the card may hold it as its owner", async () => {
    const card = createFakeCard(128, { owner: null, version: V22 })
    const info = await getInfo(card.transceive)
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      const response = await answer(apdu)
      // The card took SET_OWNER, and its answer never came back.
      if (apdu[1] === 0x43) throw new Error("Tag was lost")
      return response
    })
    await expect(setUpCard(card.transceive, argsFor(card, info))).rejects.toThrow(
      "Tag was lost",
    )
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
    const card = createFakeCard(128, { owner: null, version: V22 })
    const info = await getInfo(card.transceive)
    card.transceive.mockClear()
    const save = jest.fn(async () => {
      throw new OwnerKeyStoreError("the owner key was not saved")
    })
    await expect(
      setUpCard(card.transceive, argsFor(card, info), save),
    ).rejects.toBeInstanceOf(OwnerKeyStoreError)
    expect(card.ins()).not.toContain(0x43)
    expect(card.owner()).toBeUndefined()
  })

  it("refuses a card that has an owner, holds value, or has a PIN nobody here knows: before anything is written", async () => {
    const card = createFakeCard(128, { version: V22 })
    const owned = await getInfo(card.transceive)
    card.transceive.mockClear()
    await expect(
      setUpCard(card.transceive, argsFor(card, owned, { mint: "m" })),
    ).rejects.toMatchObject({ reason: "owned" })
    await expect(
      setUpCard(
        card.transceive,
        argsFor(
          card,
          { ...owned, hasOwner: false, unspent: 1, empty: owned.empty - 1 },
          { mint: "m" },
        ),
      ),
    ).rejects.toMatchObject({ reason: "in-use" })
    await expect(
      setUpCard(
        card.transceive,
        argsFor(card, { ...owned, hasOwner: false, unspent: 0, pinState: "set" }),
      ),
    ).rejects.toBeInstanceOf(CardNotOpenError)
    // GET_CARD each time, and nothing written.
    expect(card.ins()).toEqual([0x16, 0x16, 0x16])
  })

  // ENG-825: the guard before any setup write.
  describe("the guard before any write (ENG-825)", () => {
    /** Every INS a setup tap may send before its guard passes: reads only. */
    const READS = [0xa4, 0x01, 0x10, 0x16]
    const onlyReads = (card: FakeCard) =>
      expect(card.ins().filter((ins) => !READS.includes(ins))).toEqual([])

    /** A fresh 2.2 card, its GET_INFO, and the transceive cleared. */
    const fresh = async (options: FakeCardOptions = {}) => {
      const card = createFakeCard(128, { owner: null, version: V22, ...options })
      const info = await getInfo(card.transceive)
      card.transceive.mockClear()
      return { card, info }
    }

    for (const [name, found, version] of [
      ["2.0", "older", [2, 0]],
      ["2.1", "older", [2, 1]],
      ["2.3", "newer", [2, 3]],
    ] as [string, string, number[]][]) {
      it(`refuses applet ${name} with CardNeedsUpdateError (${found}) and writes nothing`, async () => {
        const card = createFakeCard(128, {
          owner: null,
          version: version as [number, number],
        })
        const info = await getInfo(card.transceive)
        card.transceive.mockClear()
        const thrown = await setUpCard(card.transceive, {
          ...argsFor(card, info, { pin: "1234" }),
          tap: tapOf(card, version),
        }).catch((err) => err)
        expect(thrown).toBeInstanceOf(CardNeedsUpdateError)
        expect(thrown).toMatchObject({ found })
        onlyReads(card)
        expect(card.pin()).toBeUndefined()
        expect(card.record().set).toBe(false)
      })
    }

    it("SETUP_APPLET_VERSIONS is 2.2 alone", () => {
      expect(SETUP_APPLET_VERSIONS).toEqual([[2, 2]])
    })

    it("refuses an owned card, before any write", async () => {
      const card = createFakeCard(128, { version: V22, record: false })
      const info = await getInfo(card.transceive)
      card.transceive.mockClear()
      await expect(
        setUpCard(card.transceive, argsFor(card, info, { pin: "1234" })),
      ).rejects.toMatchObject({ reason: "owned" })
      onlyReads(card)
    })

    for (const [label, pin] of [
      ["with a PIN chosen", "1234"],
      ["with none", undefined],
    ] as [string, string | undefined][]) {
      it(`refuses a card with a PIN from before, ${label}, before any write`, async () => {
        const { card, info } = await fresh({ pin: "9999" })
        await expect(
          setUpCard(card.transceive, argsFor(card, info, { pin })),
        ).rejects.toMatchObject({ reason: "pin-set" })
        onlyReads(card)
        expect(card.pin()).toBe("9999")
      })
    }

    it("refuses a blocked PIN as one from before", () => {
      const card = createFakeCard(128, { owner: null, version: V22 })
      const info = { ...baseInfo(), pinState: "blocked" as const }
      expect(() =>
        checkSetupState({
          tap: tapOf(card),
          info,
          record: baseRecord(),
          intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT, pin: "1234" }),
          progress: { pinSent: true, recordSent: false },
        }),
      ).toThrow(expect.objectContaining({ reason: "pin-set" }))
    })

    it("refuses a funded card, before any write", async () => {
      const { card } = await fresh()
      card.slots[0] = [1, ...new Array(81).fill(1)]
      const info = await getInfo(card.transceive)
      card.transceive.mockClear()
      await expect(setUpCard(card.transceive, argsFor(card, info))).rejects.toMatchObject(
        { reason: "in-use" },
      )
      onlyReads(card)
    })

    it("refuses a used card (spent slots), before any write", async () => {
      const { card } = await fresh()
      card.slots[3] = [2, ...new Array(81).fill(1)]
      const info = await getInfo(card.transceive)
      card.transceive.mockClear()
      await expect(setUpCard(card.transceive, argsFor(card, info))).rejects.toMatchObject(
        { reason: "used" },
      )
      onlyReads(card)
    })

    it("refuses a locked card, before any write", async () => {
      const { card, info } = await fresh({ locked: true })
      await expect(setUpCard(card.transceive, argsFor(card, info))).rejects.toMatchObject(
        { reason: "locked" },
      )
      onlyReads(card)
    })

    for (const [label, limits] of [
      ["a daily limit", { day: 5000 }],
      ["a no-PIN allowance", { allowance: 250 }],
    ] as [string, FakeCardOptions["limits"]][]) {
      it(`refuses a card with ${label}, before any write`, async () => {
        const { card, info } = await fresh({ limits })
        await expect(
          setUpCard(card.transceive, argsFor(card, info)),
        ).rejects.toMatchObject({ reason: "limits-set" })
        onlyReads(card)
      })
    }

    for (const [label, extra] of [
      ["paymentLimit", { paymentLimit: 1000 }],
      ["nopinSpent", { nopinSpent: 1 }],
      ["spentToday", { spentToday: 1 }],
    ] as [string, Partial<CardInfo>][]) {
      it(`refuses a card whose GET_INFO ${label} is not zero`, () => {
        const card = createFakeCard(128, { owner: null, version: V22 })
        expect(() =>
          checkSetupState({
            tap: tapOf(card),
            info: { ...baseInfo(), ...extra },
            record: baseRecord(),
            intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT }),
            progress: newSetupProgress(),
          }),
        ).toThrow(expect.objectContaining({ reason: "limits-set" }))
      })
    }

    it("an armed allowance with no PIN of this sequence's is a limit; after this sequence's own VERIFY_PIN it is not", () => {
      const card = createFakeCard(128, { owner: null, version: V22 })
      const check =
        (
          info: Partial<CardInfo>,
          progress: { pinSent: boolean; recordSent: boolean },
          pin?: string,
        ) =>
        () =>
          checkSetupState({
            tap: tapOf(card),
            info: { ...baseInfo(), ...info },
            record: { ...baseRecord(), allowanceArmed: true },
            intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT, pin }),
            progress,
          })
      expect(check({}, newSetupProgress())).toThrow(
        expect.objectContaining({ reason: "limits-set" }),
      )
      expect(check({ pinState: "set" }, newSetupProgress(), "1234")).toThrow(
        expect.objectContaining({ reason: "pin-set" }),
      )
      expect(
        check({ pinState: "set" }, { pinSent: true, recordSent: false }, "1234"),
      ).not.toThrow()
    })

    it("refuses a non-zero GET_CARD daily limit", () => {
      const card = createFakeCard(128, { owner: null, version: V22 })
      expect(() =>
        checkSetupState({
          tap: tapOf(card),
          info: baseInfo(),
          record: { ...baseRecord(), dailyLimit: 1 },
          intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT }),
          progress: newSetupProgress(),
        }),
      ).toThrow(expect.objectContaining({ reason: "limits-set" }))
    })

    /** Answers `ins` with `corrupt` of what the card said. */
    const corrupting = (
      card: FakeCard,
      ins: number,
      corrupt: (response: number[]) => number[],
    ): Transceiver => {
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        return apdu[1] === ins ? corrupt(response) : response
      })
      return card.transceive
    }

    it("a GET_CARD answer shorter than 106 bytes is unreadable: nothing written", async () => {
      const { card, info } = await fresh()
      const transceive = corrupting(card, 0x16, (r) => [...r.slice(0, 100), 0x90, 0x00])
      await expect(
        setUpCard(transceive, argsFor(card, info, { pin: "1234" })),
      ).rejects.toMatchObject({ reason: "unreadable" })
      onlyReads(card)
    })

    it("a GET_INFO PIN byte of 9 is unreadable: nothing written", async () => {
      const card = createFakeCard(128, { owner: null, version: V22 })
      const transceive = corrupting(card, 0x01, (r) => {
        const bad = [...r]
        bad[7] = 9
        return bad
      })
      const info = await getInfo(transceive)
      card.transceive.mockClear()
      await expect(
        setUpCard(transceive, argsFor(card, info, { pin: "1234" })),
      ).rejects.toMatchObject({ reason: "unreadable" })
      onlyReads(card)
    })

    it("a GET_INFO version that differs from SELECT's is unreadable: nothing written", async () => {
      const card = createFakeCard(128, { owner: null, version: V22 })
      const transceive = corrupting(card, 0x01, (r) => {
        const bad = [...r]
        bad[1] = 1
        return bad
      })
      const info = await getInfo(transceive)
      card.transceive.mockClear()
      await expect(
        setUpCard(transceive, { ...argsFor(card, info), tap: tapOf(card) }),
      ).rejects.toMatchObject({ reason: "unreadable" })
      onlyReads(card)
    })

    for (const [label, extra] of [
      ["a format other than 4", { format: 3 }],
      ["slot counts that do not add up", { empty: 127 }],
      ["GET_INFO and GET_CARD disagreeing on the record", { recordSet: true }],
    ] as [string, Partial<CardInfo>][]) {
      it(`${label} is unreadable`, () => {
        const card = createFakeCard(128, { owner: null, version: V22 })
        expect(() =>
          checkSetupState({
            tap: tapOf(card),
            info: { ...baseInfo(), ...extra },
            record: baseRecord(),
            intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT }),
            progress: newSetupProgress(),
          }),
        ).toThrow(expect.objectContaining({ reason: "unreadable" }))
      })
    }

    it("a set record in a unit other than sat is unreadable", () => {
      const card = createFakeCard(128, { owner: null, version: V22 })
      expect(() =>
        checkSetupState({
          tap: tapOf(card),
          info: { ...baseInfo(), recordSet: true },
          record: { ...baseRecord(), recordSet: true, unit: 1, mint: MINT },
          intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT }),
          progress: newSetupProgress(),
        }),
      ).toThrow(expect.objectContaining({ reason: "unreadable" }))
    })

    it("a PIN given that the intent did not choose (or none where it did) is refused before any APDU", async () => {
      const { card, info } = await fresh()
      await expect(
        setUpCard(card.transceive, {
          ...argsFor(card, info),
          pin: "1234",
        }),
      ).rejects.toMatchObject({ reason: "unreadable" })
      await expect(
        setUpCard(card.transceive, {
          ...argsFor(card, info, { pin: "1234" }),
          pin: undefined,
        }),
      ).rejects.toMatchObject({ reason: "unreadable" })
      expect(card.ins()).toEqual([])
    })

    it("a transport failure on GET_CARD propagates as it is", async () => {
      const { card, info } = await fresh()
      card.transceive.mockRejectedValueOnce(new Error("Tag was lost"))
      await expect(setUpCard(card.transceive, argsFor(card, info))).rejects.toThrow(
        "Tag was lost",
      )
      onlyReads(card)
    })

    it("a card swapped for another: the intent is for card A, the tap reached B", async () => {
      const a = createFakeCard(128, { owner: null, version: V22 })
      const { card: b, info } = await fresh({ cardKey: "09".repeat(32) })
      const args = argsFor(a, info, { pin: "1234" })
      const thrown = await setUpCard(b.transceive, {
        ...args,
        tap: tapOf(b),
      }).catch((err) => err)
      expect(thrown).toBeInstanceOf(WrongCardError)
      onlyReads(b)
      expect(b.pin()).toBeUndefined()
    })

    it("a tap on A cut after SET_PIN, and the retry reaches B: WrongCardError, nothing written to B", async () => {
      const { card: a, info: infoA } = await fresh()
      const answer = a.transceive.getMockImplementation()!
      a.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x41) throw new Error("Tag was lost")
        return response
      })
      const args = argsFor(a, infoA, { pin: "1234" })
      await expect(setUpCard(a.transceive, args)).rejects.toThrow("Tag was lost")
      expect(args.progress.pinSent).toBe(true)

      const { card: b, info: infoB } = await fresh({ cardKey: "09".repeat(32) })
      const thrown = await setUpCard(b.transceive, {
        ...args,
        info: infoB,
        tap: tapOf(b),
      }).catch((err) => err)
      expect(thrown).toBeInstanceOf(WrongCardError)
      onlyReads(b)
    })

    it("resumes in the same sequence: SET_PIN lands, the answer is lost, and the next tap finishes", async () => {
      const { card, info } = await fresh()
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x41) throw new Error("Tag was lost")
        return response
      })
      const args = argsFor(card, info, { pin: "1234" })
      await expect(setUpCard(card.transceive, args)).rejects.toThrow("Tag was lost")
      expect(card.pin()).toBe("1234")

      // The next tap: a new SELECT, a new GET_INFO that says the PIN is set.
      card.transceive.mockImplementation(answer)
      await selectApplet(card.transceive)
      const again = await getInfo(card.transceive)
      expect(again.pinState).toBe("set")
      await setUpCard(card.transceive, { ...args, info: again })
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
      expect(card.record()).toEqual({ set: true, mint: MINT })
    })

    it("the same card after an app restart (a new sequence) is refused: the PIN is not this sequence's", async () => {
      const { card, info } = await fresh()
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x41) throw new Error("Tag was lost")
        return response
      })
      await expect(
        setUpCard(card.transceive, argsFor(card, info, { pin: "1234" })),
      ).rejects.toThrow("Tag was lost")
      card.transceive.mockImplementation(answer)
      const again = await getInfo(card.transceive)
      card.transceive.mockClear()
      await expect(
        setUpCard(card.transceive, argsFor(card, again, { pin: "1234" })),
      ).rejects.toMatchObject({ reason: "pin-set" })
      onlyReads(card)
    })

    it("a recorded mint that differs from the intent's is refused; a matching one completes", async () => {
      const { card, info } = await fresh({ record: true })
      expect(info.recordSet).toBe(true)
      const thrown = await setUpCard(
        card.transceive,
        argsFor(card, info, { mint: "https://other.example" }),
      ).catch((err) => err)
      expect(thrown).toMatchObject({ reason: "other-mint", mint: MINT })
      onlyReads(card)

      // The same mint, spelled with a trailing slash, is the same mint.
      await setUpCard(card.transceive, argsFor(card, info, { mint: `${MINT}/` }))
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    })

    it("an invalid mint fails in freezeSetupIntent, before any transceive", () => {
      const transceive = jest.fn()
      expect(() => freezeSetupIntent({ cardPubkey: "02".repeat(33), mint: "" })).toThrow(
        CardProtocolError,
      )
      expect(() =>
        freezeSetupIntent({ cardPubkey: "02".repeat(33), mint: "x".repeat(78) }),
      ).toThrow(CardProtocolError)
      expect(transceive).not.toHaveBeenCalled()
    })

    it("the intent is frozen and keeps no PIN", () => {
      const intent = freezeSetupIntent({ cardPubkey: "ab", mint: MINT, pin: "1234" })
      expect(intent).toEqual({
        cardPubkey: "ab",
        mint: MINT,
        unit: 0,
        refundKey: null,
        design: null,
        pinChosen: true,
      })
      expect(Object.isFrozen(intent)).toBe(true)
      expect(JSON.stringify(intent)).not.toContain("1234")
    })

    it("marks each write sent before it goes out", async () => {
      const { card, info } = await fresh()
      const args = argsFor(card, info, { pin: "1234" })
      const seen: string[] = []
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        if (apdu[1] === 0x41) seen.push(`SET_PIN ${JSON.stringify(args.progress)}`)
        if (apdu[1] === 0x32) seen.push(`SET_CARD ${JSON.stringify(args.progress)}`)
        return answer(apdu)
      })
      await setUpCard(card.transceive, args)
      expect(seen).toEqual([
        'SET_PIN {"pinSent":true,"recordSent":false}',
        'SET_CARD {"pinSent":true,"recordSent":true}',
      ])
      expect(setupWriteSent(args.progress)).toBe(true)
      expect(setupWriteSent(newSetupProgress())).toBe(false)
    })

    it("the happy path on 2.2 adds exactly one GET_CARD to the writes", async () => {
      const { card, info } = await fresh()
      await setUpCard(card.transceive, argsFor(card, info, { pin: "1234" }))
      expect(card.ins()).toEqual([0x16, 0x41, 0x40, 0x32, 0x43])
    })
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
