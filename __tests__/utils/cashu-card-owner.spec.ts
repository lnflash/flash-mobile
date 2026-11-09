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
  getCardRecord,
  getInfo,
  selectApplet,
  verifyCardPin,
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
  PinResumeStop,
  SEED_SERVER,
  SETUP_APPLET_VERSIONS,
  CardSetup,
  ReadBackField,
  SetupProgress,
  SetupReadBackError,
  SetupUnconfirmedError,
  checkSetupState,
  compareReadBack,
  compareVerification,
  finishHolderSetup,
  setupLimitsDiffer,
  setupUnverified,
  setupRecord,
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

/**
 * ENG-827: what follows SET_OWNER in the same tap: GET_NONCE and the owner's
 * SET_LIMIT, GET_NONCE and ALLOW_LOAD, then the verifying GET_INFO and GET_CARD.
 */
/**
 * After SET_OWNER with no limits wanted (ENG-827): no SET_LIMIT (spec/APDU.md
 * Personalisation: "if the holder wants limits"), only ALLOW_LOAD and the
 * verifying read.
 */
const VERIFY_TAIL = [0x44, 0x45, 0x01, 0x16]

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
    // The wallet's record (ENG-826) is pinned in its own describe below.
    persist: jest.fn(async () => undefined),
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
    // ENG-826: SET_CARD is read back (GET_CARD) before the key is saved.
    // ENG-827: then ALLOW_LOAD and the verifying read; no SET_LIMIT for
    // no limits.
    expect(order).toEqual([
      "16",
      "41",
      "40",
      "32",
      "16",
      "saved",
      "43",
      "44",
      "45",
      "1",
      "16",
    ])
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
    expect(card.ins()).toEqual([0x16, 0x32, 0x16, 0x43, ...VERIFY_TAIL])
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
          progress: { pinSent: true, recordSent: false, ownerSent: false },
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
        (info: Partial<CardInfo>, progress: SetupProgress, pin?: string) => () =>
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
        check(
          { pinState: "set" },
          { pinSent: true, recordSent: false, ownerSent: false },
          "1234",
        ),
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

    it("resumes in the same sequence after VERIFY_PIN lands: the card's allowance is armed, and the next tap finishes", async () => {
      const { card, info } = await fresh()
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x40) throw new Error("Tag was lost")
        return response
      })
      const args = argsFor(card, info, { pin: "1234" })
      await expect(setUpCard(card.transceive, args)).rejects.toThrow("Tag was lost")
      expect(args.progress.pinSent).toBe(true)
      expect(args.progress.recordSent).toBe(false)

      // The next tap: the PIN is set, and VERIFY_PIN armed the allowance (D20).
      card.transceive.mockImplementation(answer)
      await selectApplet(card.transceive)
      const again = await getInfo(card.transceive)
      expect(again.pinState).toBe("set")
      expect((await getCardRecord(card.transceive)).allowanceArmed).toBe(true)
      await setUpCard(card.transceive, { ...args, info: again })
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
      expect(card.record()).toEqual({ set: true, mint: MINT })
    })

    it("resumes in the same sequence after SET_CARD lands: record set, allowance armed, and the next tap finishes", async () => {
      const { card, info } = await fresh()
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x32) throw new Error("Tag was lost")
        return response
      })
      const args = argsFor(card, info, { pin: "1234" })
      await expect(setUpCard(card.transceive, args)).rejects.toThrow("Tag was lost")
      expect(args.progress.recordSent).toBe(true)

      card.transceive.mockImplementation(answer)
      await selectApplet(card.transceive)
      const again = await getInfo(card.transceive)
      expect(again.recordSet).toBe(true)
      await setUpCard(card.transceive, { ...args, info: again })
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    })

    it("a card a PIN from before has armed is refused as pin-set, not limits-set, and nothing is written", async () => {
      const { card, info } = await fresh()
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x40) throw new Error("Tag was lost")
        return response
      })
      await expect(
        setUpCard(card.transceive, argsFor(card, info, { pin: "1234" })),
      ).rejects.toThrow("Tag was lost")
      card.transceive.mockImplementation(answer)
      const again = await getInfo(card.transceive)
      card.transceive.mockClear()
      // A new sequence: the PIN and the armed allowance are not its own.
      await expect(
        setUpCard(card.transceive, argsFor(card, again, { pin: "1234" })),
      ).rejects.toMatchObject({ reason: "pin-set" })
      onlyReads(card)
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
        // ENG-827: none unless given.
        limits: NO_LIMITS,
      })
      expect(Object.isFrozen(intent)).toBe(true)
      expect(Object.isFrozen(intent.limits)).toBe(true)
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
        'SET_PIN {"pinSent":true,"recordSent":false,"ownerSent":false,"limitsSent":false,"verified":false}',
        'SET_CARD {"pinSent":true,"recordSent":true,"ownerSent":false,"limitsSent":false,"verified":false}',
      ])
      expect(setupWriteSent(args.progress)).toBe(true)
      expect(setupWriteSent(newSetupProgress())).toBe(false)
    })

    it("the happy path on 2.2 reads GET_CARD once before the writes and once after SET_CARD (ENG-826)", async () => {
      const { card, info } = await fresh()
      await setUpCard(card.transceive, argsFor(card, info, { pin: "1234" }))
      expect(card.ins()).toEqual([0x16, 0x41, 0x40, 0x32, 0x16, 0x43, ...VERIFY_TAIL])
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

// ENG-826: the wallet's setup record and the read-back.
describe("setUpCard: the setup record and the read-back (ENG-826)", () => {
  const key = { privateKey: FAKE_OWNER_KEY, source: "device" as const, saved: false }
  const V22: [number, number] = [2, 2]
  const MINT = "https://mint.test"
  const tapOf = (card: FakeCard): CardTap => ({ version: V22, pubkey: card.pubkey })
  /** Every setup record `persist` was given, in order. */
  const persisted: CardSetup[] = []
  /** The setup records persisted and the APDUs sent, in one order. */
  const log: string[] = []
  beforeEach(() => {
    persisted.length = 0
    log.length = 0
  })
  /** A `persist` that records each setup record, as the wallet's store would keep it. */
  const persistSpy = () =>
    jest.fn(async (setup: CardSetup) => {
      persisted.push(JSON.parse(JSON.stringify(setup)))
      log.push(`persist ${setup.status}`)
    })
  /** One setup sequence's arguments for `card` as `info` reads it. */
  const argsFor = (
    card: FakeCard,
    info: CardInfo,
    { pin, mint = MINT }: { pin?: string; mint?: string } = {},
  ) => ({
    tap: tapOf(card),
    info,
    pin,
    intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint, pin }),
    progress: newSetupProgress(),
    key,
    persist: persistSpy(),
  })
  /** A fresh 2.2 card, its GET_INFO, and the transceive cleared. */
  const fresh = async (options: FakeCardOptions = {}) => {
    const card = createFakeCard(128, { owner: null, version: V22, ...options })
    const info = await getInfo(card.transceive)
    card.transceive.mockClear()
    return { card, info }
  }
  /** Every APDU `card` is sent noted in `log`, beside the records persisted. */
  const logged = (card: FakeCard) => {
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      log.push(`apdu ${apdu[1].toString(16)}`)
      return answer(apdu)
    })
    return answer
  }
  /** The next tap after a restart: a new SELECT and GET_INFO, nothing else kept. */
  const nextTap = async (card: FakeCard, answer: Transceiver) => {
    card.transceive.mockImplementation(answer)
    await selectApplet(card.transceive)
    const info = await getInfo(card.transceive)
    card.transceive.mockClear()
    logged(card)
    return info
  }
  const PIN = "97531"

  it("persists the next progress before SET_PIN, SET_CARD and SET_OWNER, and the set-up record after", async () => {
    const { card, info } = await fresh()
    logged(card)
    await setUpCard(card.transceive, argsFor(card, info, { pin: PIN }))
    expect(log).toEqual([
      "apdu 16",
      "persist started",
      "apdu 41",
      "apdu 40",
      "persist started",
      "apdu 32",
      "apdu 16",
      "persist started",
      "apdu 43",
      // ENG-827: set-up, then verified after the read; no SET_LIMIT for no
      // limits.
      "persist set-up",
      "apdu 44",
      "apdu 45",
      "apdu 1",
      "apdu 16",
      "persist set-up",
    ])
    const sent = { limitsSent: false, verified: false }
    expect(persisted.map((setup) => setup.progress)).toEqual([
      { ...sent, pinSent: true, recordSent: false, ownerSent: false },
      { ...sent, pinSent: true, recordSent: true, ownerSent: false },
      { ...sent, pinSent: true, recordSent: true, ownerSent: true },
      { ...sent, pinSent: true, recordSent: true, ownerSent: true },
      {
        pinSent: true,
        recordSent: true,
        ownerSent: true,
        limitsSent: false,
        verified: true,
      },
    ])
    const last = persisted[persisted.length - 1]
    expect(last).toMatchObject({
      v: 1,
      status: "set-up",
      intent: { cardPubkey: card.pubkey, mint: MINT, pinChosen: true, limits: NO_LIMITS },
      heldByCard: { mint: MINT, unit: 0, refundKey: null, design: null },
      verification: {
        held: { mint: MINT, unit: 0, owner: true, ...NO_LIMITS },
      },
    })
    expect(typeof last.setUpAt).toBe("number")
    expect(last.mismatch).toBeUndefined()
    expect(last.unconfirmed).toBeUndefined()
  })

  it("with no PIN, the first persist comes before SET_CARD", async () => {
    const { card, info } = await fresh()
    logged(card)
    await setUpCard(card.transceive, argsFor(card, info))
    expect(log).toEqual([
      "apdu 16",
      "persist started",
      "apdu 32",
      "apdu 16",
      "persist started",
      "apdu 43",
      "persist set-up",
      "apdu 44",
      "apdu 45",
      "apdu 1",
      "apdu 16",
      "persist set-up",
    ])
  })

  for (const failAt of [1, 2, 3]) {
    it(`a persist that fails (call ${failAt}) sends nothing more: the write it precedes never goes out`, async () => {
      const { card, info } = await fresh()
      logged(card)
      const save = jest.fn(async () => undefined)
      let calls = 0
      const args = {
        ...argsFor(card, info, { pin: PIN }),
        persist: jest.fn(async () => {
          calls += 1
          log.push(`persist ${calls}`)
          if (calls === failAt) throw new Error("disk full")
        }),
      }
      await expect(setUpCard(card.transceive, args, save)).rejects.toThrow("disk full")
      expect(log[log.length - 1]).toBe(`persist ${failAt}`)
      expect(card.owner()).toBeUndefined()
      if (failAt === 1) expect(card.pin()).toBeUndefined()
      if (failAt <= 2) expect(card.record().set).toBe(false)
      if (failAt <= 2) expect(save).not.toHaveBeenCalled()
      // The progress is marked only once its record is on disk.
      expect(args.progress).toEqual({
        pinSent: failAt > 1,
        recordSent: failAt > 2,
        ownerSent: false,
        limitsSent: false,
        verified: false,
      })
    })
  }

  it("a set-up record that is not saved only warns, for an ENG-826 intent (no limits): the card is set up", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    const { card, info } = await fresh()
    const { limits: _dropped, ...legacy } = freezeSetupIntent({
      cardPubkey: card.pubkey,
      mint: MINT,
    })
    const args = {
      ...argsFor(card, info),
      intent: legacy,
      persist: jest.fn(async (setup: CardSetup) => {
        if (setup.status === "set-up") throw new Error("disk full")
      }),
    }
    await setUpCard(card.transceive, args)
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    expect(warn).toHaveBeenCalledWith("Cashu card setup record (set-up) not saved: Error")
    // An ENG-826 intent never sends SET_LIMIT.
    expect(card.ins()).not.toContain(0x34)
    warn.mockRestore()
  })

  it("after a restart with SET_PIN on the card, resumes the stored intent: one SET_PIN across both taps, VERIFY_PIN, and it finishes", async () => {
    const { card, info } = await fresh()
    const answer = logged(card)
    card.transceive.mockImplementation(async (apdu) => {
      log.push(`apdu ${apdu[1].toString(16)}`)
      const response = await answer(apdu)
      if (apdu[1] === 0x41) throw new Error("Tag was lost")
      return response
    })
    await expect(
      setUpCard(card.transceive, argsFor(card, info, { pin: PIN })),
    ).rejects.toThrow("Tag was lost")
    expect(card.pin()).toBe(PIN)

    // A restart: only what was persisted survives.
    const stored: CardSetup = JSON.parse(JSON.stringify(persisted[persisted.length - 1]))
    expect(stored).toMatchObject({ status: "started", progress: { pinSent: true } })
    const again = await nextTap(card, answer)
    expect(again.pinState).toBe("set")
    await setUpCard(card.transceive, {
      tap: tapOf(card),
      info: again,
      pin: PIN,
      intent: stored.intent,
      progress: { ...stored.progress },
      key,
      persist: persistSpy(),
    })
    expect(log.filter((entry) => entry === "apdu 41")).toHaveLength(1)
    expect(card.ins()).toEqual([0x16, 0x40, 0x32, 0x16, 0x43, ...VERIFY_TAIL])
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    expect(card.record()).toEqual({ set: true, mint: MINT })
  })

  it("with pinSent stored and a card that reads no PIN, SET_PIN never landed: it is sent again", async () => {
    const { card, info } = await fresh()
    const answer = logged(card)
    card.transceive.mockImplementation(async (apdu) => {
      log.push(`apdu ${apdu[1].toString(16)}`)
      // Lost on the way: the card never saw it.
      if (apdu[1] === 0x41) throw new Error("Tag was lost")
      return answer(apdu)
    })
    await expect(
      setUpCard(card.transceive, argsFor(card, info, { pin: PIN })),
    ).rejects.toThrow("Tag was lost")
    const stored: CardSetup = JSON.parse(JSON.stringify(persisted[persisted.length - 1]))
    expect(stored.progress.pinSent).toBe(true)
    const again = await nextTap(card, answer)
    expect(again.pinState).toBe("unset")
    await setUpCard(card.transceive, {
      tap: tapOf(card),
      info: again,
      pin: PIN,
      intent: stored.intent,
      progress: { ...stored.progress },
      key,
      persist: persistSpy(),
    })
    expect(log.filter((entry) => entry === "apdu 41")).toHaveLength(2)
    expect(card.pin()).toBe(PIN)
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
  })

  describe("the resume rule for the PIN step (ENG-829)", () => {
    /** A setup cut short at SET_PIN (`landed`: the card kept it), then a restart: the stored record and the next tap's GET_INFO. */
    const cutAtSetPin = async (landed: boolean) => {
      const { card, info } = await fresh()
      const answer = logged(card)
      card.transceive.mockImplementation(async (apdu) => {
        log.push(`apdu ${apdu[1].toString(16)}`)
        if (apdu[1] === 0x41 && !landed) throw new Error("Tag was lost")
        const response = await answer(apdu)
        if (apdu[1] === 0x41) throw new Error("Tag was lost")
        return response
      })
      await expect(
        setUpCard(card.transceive, argsFor(card, info, { pin: PIN })),
      ).rejects.toThrow("Tag was lost")
      const stored: CardSetup = JSON.parse(
        JSON.stringify(persisted[persisted.length - 1]),
      )
      expect(stored.progress).toMatchObject({ pinSent: true, recordSent: false })
      return { card, answer, stored }
    }
    const resumeArgs = (
      card: FakeCard,
      { info, stored }: { info: CardInfo; stored: CardSetup },
      extra: Partial<Parameters<typeof setUpCard>[1]> = {},
    ) => ({
      tap: tapOf(card),
      info,
      pin: PIN,
      intent: stored.intent,
      progress: { ...stored.progress },
      key,
      persist: persistSpy(),
      ...extra,
    })

    it("on the verify-only path, persists the tries read before VERIFY_PIN", async () => {
      const { card, answer, stored } = await cutAtSetPin(true)
      expect(stored.progress.pinTries).toBeUndefined()
      const again = await nextTap(card, answer)
      expect(again.tries).toBe(3)
      persisted.length = 0
      log.length = 0
      await setUpCard(card.transceive, resumeArgs(card, { info: again, stored }))
      expect(log.slice(0, 3)).toEqual(["apdu 16", "persist started", "apdu 40"])
      expect(persisted[0].progress).toMatchObject({ pinSent: true, pinTries: 3 })
      expect(persisted[0].progress.pinStop).toBeUndefined()
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    })

    it("a persist of the tries that fails sends no VERIFY_PIN", async () => {
      const { card, answer, stored } = await cutAtSetPin(true)
      const again = await nextTap(card, answer)
      const thrown = await setUpCard(
        card.transceive,
        resumeArgs(
          card,
          { info: again, stored },
          {
            persist: jest.fn(async () => {
              throw new Error("disk full")
            }),
          },
        ),
      ).catch((err) => err)
      expect(thrown).toEqual(new Error("disk full"))
      expect(card.ins()).toEqual([0x16])
      expect(card.triesLeft()).toBe(3)
    })

    it("an entry typed once on the resume step, on a card that holds no PIN, is never written: not-set, no SET_PIN or VERIFY_PIN", async () => {
      const { card, answer, stored } = await cutAtSetPin(false)
      const again = await nextTap(card, answer)
      expect(again.pinState).toBe("unset")
      persisted.length = 0
      const thrown = await setUpCard(
        card.transceive,
        resumeArgs(card, { info: again, stored }, { entered: { triesShown: 3 } }),
      ).catch((err) => err)
      expect(thrown).toBeInstanceOf(PinResumeStop)
      expect(thrown).toMatchObject({ reason: "not-set", tries: 3 })
      expect(card.ins()).toEqual([0x16])
      expect(card.pin()).toBeUndefined()
      expect(persisted).toHaveLength(1)
      expect(persisted[0]).toMatchObject({
        status: "started",
        progress: { pinSent: true, recordSent: false, pinStop: "not-set", pinTries: 3 },
      })
      expect(JSON.stringify(persisted)).not.toContain(PIN)
    })

    it("an entry typed against tries other than the card's sends no VERIFY_PIN: tries-changed", async () => {
      const { card, answer, stored } = await cutAtSetPin(true)
      card.transceive.mockImplementation(answer)
      await selectApplet(card.transceive)
      const before = await getInfo(card.transceive)
      // Another phone's wrong try in between: the card now has 2.
      await expect(
        verifyCardPin(card.transceive, "00000", {
          sealed: before.sealed,
          cardPubkey: card.pubkey,
        }),
      ).rejects.toBeInstanceOf(CardError)
      const again = await nextTap(card, answer)
      expect(again.tries).toBe(2)
      persisted.length = 0
      const thrown = await setUpCard(
        card.transceive,
        resumeArgs(card, { info: again, stored }, { entered: { triesShown: 3 } }),
      ).catch((err) => err)
      expect(thrown).toBeInstanceOf(PinResumeStop)
      expect(thrown).toMatchObject({ reason: "tries-changed", tries: 2 })
      expect(card.ins()).toEqual([0x16])
      expect(card.triesLeft()).toBe(2)
      expect(persisted[0].progress).toMatchObject({
        pinStop: "tries-changed",
        pinTries: 2,
      })
    })

    it("an entry typed against the card's own tries is verified, and the stop on record is cleared", async () => {
      const { card, answer, stored } = await cutAtSetPin(true)
      const again = await nextTap(card, answer)
      persisted.length = 0
      await setUpCard(
        card.transceive,
        resumeArgs(
          card,
          { info: again, stored },
          {
            progress: { ...stored.progress, pinStop: "tries-changed", pinTries: 2 },
            entered: { triesShown: 3 },
          },
        ),
      )
      expect(card.ins().slice(0, 2)).toEqual([0x16, 0x40])
      expect(persisted[0].progress).toMatchObject({ pinTries: 3 })
      expect(persisted[0].progress.pinStop).toBeUndefined()
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    })

    it("a PIN confirmed in this session, with pinSent and a card that holds none, is set exactly once, then verified (regression)", async () => {
      const { card, answer, stored } = await cutAtSetPin(false)
      const again = await nextTap(card, answer)
      log.length = 0
      await setUpCard(card.transceive, resumeArgs(card, { info: again, stored }))
      expect(log.filter((entry) => entry === "apdu 41")).toHaveLength(1)
      expect(card.ins().slice(0, 3)).toEqual([0x16, 0x41, 0x40])
      expect(card.pin()).toBe(PIN)
    })
  })

  /** The card answers its second GET_CARD (the read-back) with `corrupt` of what it holds. */
  const corruptReadBack = (card: FakeCard, corrupt: (body: number[]) => number[]) => {
    const answer = card.transceive.getMockImplementation()!
    let reads = 0
    card.transceive.mockImplementation(async (apdu) => {
      log.push(`apdu ${apdu[1].toString(16)}`)
      const response = await answer(apdu)
      if (apdu[1] !== 0x16) return response
      reads += 1
      if (reads !== 2) return response
      return [...corrupt(response.slice(0, -2)), 0x90, 0x00]
    })
  }
  const at = (body: number[], index: number, bytes: number[]) => {
    const out = [...body]
    out.splice(index, bytes.length, ...bytes)
    return out
  }

  for (const [field, corrupt] of [
    ["unset", (b: number[]) => at(b, 1, [0])],
    ["mint", (b: number[]) => at(b, 106, [0x48])],
    ["unit", (b: number[]) => at(b, 2, [1])],
    ["refundKey", (b: number[]) => at(b, 7, [0x02, ...new Array(32).fill(0x11)])],
    ["design", (b: number[]) => at(b, 106 + MINT.length, [0x46, 0x4c, 0x31])],
  ] as [ReadBackField, (b: number[]) => number[]][]) {
    it(`a read-back whose ${field} differs stops before SET_OWNER: mismatched, nothing after the read-back`, async () => {
      const { card, info } = await fresh()
      corruptReadBack(card, corrupt)
      const save = jest.fn(async () => undefined)
      const thrown = await setUpCard(
        card.transceive,
        argsFor(card, info, { pin: PIN }),
        save,
      ).catch((err) => err)
      expect(thrown).toBeInstanceOf(SetupReadBackError)
      expect(thrown.fields).toEqual([field])
      // The read-back is the last APDU: no SET_OWNER, no key saved.
      expect(card.ins()).toEqual([0x16, 0x41, 0x40, 0x32, 0x16])
      expect(log[log.length - 1]).toBe("persist mismatched")
      expect(save).not.toHaveBeenCalled()
      expect(card.owner()).toBeUndefined()
      expect(persisted[persisted.length - 1]).toMatchObject({
        status: "mismatched",
        mismatch: [field],
        progress: { pinSent: true, recordSent: true, ownerSent: false },
      })
      expect(persisted[persisted.length - 1].heldByCard).toBeDefined()
    })
  }

  it("a mismatched record that is not saved still stops before SET_OWNER", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    const { card, info } = await fresh()
    corruptReadBack(card, (b) => at(b, 2, [1]))
    const args = {
      ...argsFor(card, info),
      persist: jest.fn(async (setup: CardSetup) => {
        if (setup.status === "mismatched") throw new Error("disk full")
      }),
    }
    await expect(setUpCard(card.transceive, args)).rejects.toBeInstanceOf(
      SetupReadBackError,
    )
    expect(card.ins()).not.toContain(0x43)
    expect(warn).toHaveBeenCalledWith(
      "Cashu card setup record (mismatched) not saved: Error",
    )
    warn.mockRestore()
  })

  it("a read-back framed wrong is unreadable, not final: no SET_OWNER", async () => {
    const { card, info } = await fresh()
    corruptReadBack(card, (b) => b.slice(0, 100))
    await expect(setUpCard(card.transceive, argsFor(card, info))).rejects.toMatchObject({
      reason: "unreadable",
    })
    expect(card.ins()).toEqual([0x16, 0x32, 0x16])
  })

  describe("compareReadBack", () => {
    const intent = freezeSetupIntent({ cardPubkey: CARD, mint: MINT })
    const kept = (): CardRecord => ({
      ...baseRecord(),
      recordSet: true,
      mint: MINT,
      design: null,
    })
    for (const [label, record, fields] of [
      ["the record as written", kept(), []],
      ["no record", { ...kept(), recordSet: false }, ["unset"]],
      [
        "the mint with a trailing slash (exact bytes)",
        { ...kept(), mint: `${MINT}/` },
        ["mint"],
      ],
      ["another unit", { ...kept(), unit: 1 }, ["unit"]],
      ["a refund key", { ...kept(), refundKey: "02" + "11".repeat(32) }, ["refundKey"]],
      ["a design", { ...kept(), design: "FL1" }, ["design"]],
      [
        "an answer that stops before the design",
        { ...kept(), design: undefined },
        ["design"],
      ],
      [
        "everything",
        {
          ...kept(),
          recordSet: false,
          mint: "x",
          unit: 2,
          refundKey: "03" + "22".repeat(32),
          design: "AB1",
        },
        ["unset", "mint", "unit", "refundKey", "design"],
      ],
    ] as [string, CardRecord, ReadBackField[]][]) {
      it(`${label}: ${fields.length ? fields.join(", ") : "kept"}`, () => {
        expect(compareReadBack(intent, record)).toEqual(fields)
      })
    }
  })

  it("no persisted record holds the PIN or any key", async () => {
    const { card, info } = await fresh()
    await setUpCard(card.transceive, argsFor(card, info, { pin: PIN }))
    const all = JSON.stringify(persisted)
    expect(persisted.length).toBeGreaterThan(0)
    expect(all).not.toContain(PIN)
    expect(all).not.toContain(FAKE_OWNER_KEY)
    expect(all).not.toContain(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    expect(all).not.toMatch(/privateKey|publicKey|seed/)
  })

  it("setupRecord copies the intent and progress: later progress does not reach a record already made", () => {
    const intent = freezeSetupIntent({ cardPubkey: CARD, mint: MINT })
    const progress = newSetupProgress()
    const record = setupRecord(intent, progress, { status: "started", at: 5 })
    progress.recordSent = true
    expect(record).toEqual({
      v: 1,
      intent: { ...intent },
      progress: {
        pinSent: false,
        recordSent: false,
        ownerSent: false,
        limitsSent: false,
        verified: false,
      },
      status: "started",
      updatedAt: 5,
    })
  })
})

// ENG-827: the owner's SET_LIMIT in the same tap as SET_OWNER, the ALLOW_LOAD
// read-back, and "holder setup verified".
describe("holder setup: SET_LIMIT after SET_OWNER, and the verifying read (ENG-827)", () => {
  const key = { privateKey: FAKE_OWNER_KEY, source: "device" as const, saved: false }
  const V22: [number, number] = [2, 2]
  const MINT = "https://mint.test"
  const PIN = "97531"
  /** Limits a holder may choose: a no-PIN allowance (so a PIN), and a budget not 7. */
  const LIMITS = { day: 50000, payment: 21000, allowance: 2500, rollBudget: 12 }
  /**
   * What the wallet's persist rejects with when the record is not on disk
   * (`PersistWriteError` in app/store/redux, whose store is not built here;
   * the screen spec pins that one): setUpCard passes it on as it is.
   */
  class PersistWriteError extends Error {}
  const persisted: CardSetup[] = []
  beforeEach(() => {
    persisted.length = 0
  })
  const persistSpy = () =>
    jest.fn(async (setup: CardSetup) => {
      persisted.push(JSON.parse(JSON.stringify(setup)))
    })
  const last = () => persisted[persisted.length - 1]
  /** A fresh 2.2 card, its GET_INFO, and the transceive cleared. */
  const fresh = async (options: FakeCardOptions = {}) => {
    const card = createFakeCard(128, { owner: null, version: V22, ...options })
    const info = await getInfo(card.transceive)
    card.transceive.mockClear()
    return { card, info }
  }
  const argsFor = (
    card: FakeCard,
    info: CardInfo,
    { pin = PIN, limits = LIMITS }: { pin?: string; limits?: typeof LIMITS } = {},
  ) => ({
    tap: { version: V22, pubkey: card.pubkey },
    info,
    pin,
    intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT, pin, limits }),
    progress: newSetupProgress(),
    key,
    persist: persistSpy(),
  })
  /** An owned 2.2 card with its record set, as a setup cut after SET_OWNER leaves it. */
  const owned = (options: FakeCardOptions = {}) =>
    createFakeCard(128, { version: V22, pin: PIN, ...options })
  /** That card's sequence: SET_OWNER sent, the intent's limits not confirmed. */
  const ownedSequence = (card: FakeCard, limits = LIMITS) => ({
    intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: MINT, pin: PIN, limits }),
    progress: { pinSent: true, recordSent: true, ownerSent: true },
    key,
    persist: persistSpy(),
  })
  const setLimitCount = (card: FakeCard) => card.ins().filter((i) => i === 0x34).length

  it("sends the owner's SET_LIMIT after SET_OWNER in the same tap, then ALLOW_LOAD, GET_INFO and GET_CARD; the card holds the intent's limits, the budget too", async () => {
    const { card, info } = await fresh()
    await setUpCard(card.transceive, argsFor(card, info))
    const ins = card.ins()
    expect(ins.slice(ins.indexOf(0x43))).toEqual([
      0x43, 0x44, 0x34, 0x44, 0x45, 0x01, 0x16,
    ])
    expect(card.limits()).toEqual(LIMITS)
    // The thirteen-byte form, under the owner's proof: the budget is the one chosen.
    const setLimit = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((apdu) => apdu[1] === 0x34)
    // The value is the last thirteen bytes, after the proof (spec/APDU.md).
    const data = setLimit?.slice(5, 5 + (setLimit?.[4] ?? 0)) ?? []
    expect(hex(data.slice(-13))).toBe("0000c35000005208000009c40c")
  })

  it("the record is verified only once every field matched: verification, and progress.verified", async () => {
    const { card, info } = await fresh()
    const args = argsFor(card, info)
    await setUpCard(card.transceive, args)
    expect(args.progress).toEqual({
      pinSent: true,
      recordSent: true,
      ownerSent: true,
      limitsSent: true,
      verified: true,
    })
    expect(last()).toMatchObject({
      status: "set-up",
      intent: { limits: LIMITS },
      verification: {
        held: {
          mint: MINT,
          unit: 0,
          refundKey: null,
          design: null,
          owner: true,
          ...LIMITS,
        },
      },
    })
    expect(typeof last().verification?.at).toBe("number")
    expect(setupUnverified(last())).toBe(false)
  })

  it("a persist rejected after SET_OWNER sends no SET_LIMIT: PersistWriteError is thrown, and the started record with ownerSent stays", async () => {
    const { card, info } = await fresh()
    const args = {
      ...argsFor(card, info),
      persist: jest.fn(async (setup: CardSetup) => {
        if (setup.status === "set-up") throw new PersistWriteError("not written")
        persisted.push(JSON.parse(JSON.stringify(setup)))
      }),
    }
    await expect(setUpCard(card.transceive, args)).rejects.toBeInstanceOf(
      PersistWriteError,
    )
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    expect(card.ins()).not.toContain(0x34)
    expect(card.ins()[card.ins().length - 1]).toBe(0x43)
    expect(last()).toMatchObject({ status: "started", progress: { ownerSent: true } })
    expect(args.progress.limitsSent).toBe(false)
  })

  it("a card that reports another daily limit than it was sent: set-up with unconfirmed dailyLimit, and SetupUnconfirmedError", async () => {
    const { card, info } = await fresh({ reportLimits: { day: 1 } })
    const args = argsFor(card, info)
    const err = await setUpCard(card.transceive, args).catch((e) => e)
    expect(err).toBeInstanceOf(SetupUnconfirmedError)
    expect(err.fields).toEqual(["dailyLimit"])
    // This tap wrote them: not "changed elsewhere".
    expect(err.limitsChangedElsewhere).toBe(false)
    expect(setLimitCount(card)).toBe(1)
    expect(last()).toMatchObject({ status: "set-up", unconfirmed: ["dailyLimit"] })
    expect(last().verification).toBeUndefined()
    expect(args.progress.verified).toBe(false)
    expect(setupUnverified(last())).toBe(true)
  })

  it("an ENG-826 intent (no limits) never sends SET_LIMIT, and is never read as unverified", async () => {
    const { card, info } = await fresh()
    const { limits: _dropped, ...legacy } = freezeSetupIntent({
      cardPubkey: card.pubkey,
      mint: MINT,
    })
    await setUpCard(card.transceive, {
      ...argsFor(card, info, { pin: undefined }),
      pin: undefined,
      intent: legacy,
    })
    expect(card.ins()).not.toContain(0x34)
    expect(card.ins()[card.ins().length - 1]).toBe(0x43)
    expect(last()).toMatchObject({ status: "set-up" })
    expect(last().verification).toBeUndefined()
    expect(setupUnverified(last())).toBe(false)
  })

  describe("compareVerification", () => {
    const intent = freezeSetupIntent({
      cardPubkey: CARD,
      mint: MINT,
      pin: PIN,
      limits: LIMITS,
    })
    const info = (): CardInfo => ({
      ...baseInfo(),
      hasOwner: true,
      recordSet: true,
      pinState: "set",
      dailyLimit: LIMITS.day,
      paymentLimit: LIMITS.payment,
      allowance: LIMITS.allowance,
    })
    const record = (): CardRecord => ({
      ...baseRecord(),
      recordSet: true,
      mint: MINT,
      design: null,
      dailyLimit: LIMITS.day,
      rollBudget: LIMITS.rollBudget,
    })

    it("is empty when everything matches", () => {
      expect(compareVerification(intent, info(), record())).toEqual([])
    })

    for (const [field, change] of [
      ["owner", { info: { hasOwner: false } }],
      ["dailyLimit", { info: { dailyLimit: 1 } }],
      ["dailyLimit", { record: { dailyLimit: 1 } }],
      ["paymentLimit", { info: { paymentLimit: 0 } }],
      ["allowance", { info: { allowance: 0 } }],
      ["rollBudget", { record: { rollBudget: 7 } }],
      ["mint", { record: { mint: "https://other.test" } }],
      ["design", { record: { design: undefined } }],
    ] as [ReadBackField, { info?: Partial<CardInfo>; record?: Partial<CardRecord> }][]) {
      it(`${field} differs alone (${JSON.stringify(change)})`, () => {
        expect(
          compareVerification(
            intent,
            { ...info(), ...change.info },
            { ...record(), ...change.record },
          ),
        ).toEqual([field])
      })
    }

    it("a payment limit read without the owner's grant differs: ALLOW_LOAD must come first", async () => {
      const card = owned({ limits: LIMITS })
      await selectApplet(card.transceive)
      const without = await getInfo(card.transceive)
      expect(without.paymentLimit).toBe(0)
      expect(
        compareVerification(intent, without, await getCardRecord(card.transceive)),
      ).toEqual(["paymentLimit"])
      await allowLoad(card.transceive, ownerSigner(FAKE_OWNER_KEY))
      expect(
        compareVerification(
          intent,
          await getInfo(card.transceive),
          await getCardRecord(card.transceive),
        ),
      ).toEqual([])
    })
  })

  describe("freezeSetupIntent's limits", () => {
    it("are none by default", () => {
      expect(freezeSetupIntent({ cardPubkey: CARD, mint: MINT }).limits).toEqual(
        NO_LIMITS,
      )
    })

    it("refuses a budget of 31 before any APDU", () => {
      expect(() =>
        freezeSetupIntent({
          cardPubkey: CARD,
          mint: MINT,
          pin: PIN,
          limits: { ...NO_LIMITS, rollBudget: 31 },
        }),
      ).toThrow(CardProtocolError)
    })

    it("refuses a no-PIN allowance above 0 with no PIN: the card would refuse it (6985) after SET_OWNER", () => {
      let err: unknown
      try {
        freezeSetupIntent({
          cardPubkey: CARD,
          mint: MINT,
          limits: { ...NO_LIMITS, allowance: 1 },
        })
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(CardNotOpenError)
      expect((err as CardNotOpenError).reason).toBe("unreadable")
      expect(
        freezeSetupIntent({
          cardPubkey: CARD,
          mint: MINT,
          pin: PIN,
          limits: { ...NO_LIMITS, allowance: 1 },
        }).limits,
      ).toEqual({ ...NO_LIMITS, allowance: 1 })
    })
  })

  describe("finishHolderSetup", () => {
    it("writes a new card's limits once, persisting limitsSent first, and verifies", async () => {
      const card = owned()
      const sequence = ownedSequence(card)
      const order: string[] = []
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        order.push(apdu[1].toString(16))
        return answer(apdu)
      })
      sequence.persist.mockImplementation(async (setup: CardSetup) => {
        order.push(`persist ${setup.progress.verified ? "verified" : setup.status}`)
        persisted.push(JSON.parse(JSON.stringify(setup)))
      })
      const verification = await finishHolderSetup(card.transceive, {
        ...sequence,
        granted: false,
        setUpAt: 42,
      })
      expect(order).toEqual([
        "44",
        "45",
        "1",
        "16",
        "persist set-up",
        "44",
        "34",
        "44",
        "45",
        "1",
        "16",
        "persist verified",
      ])
      expect(setLimitCount(card)).toBe(1)
      expect(card.limits()).toEqual(LIMITS)
      expect(persisted[0].progress.limitsSent).toBe(true)
      expect(verification.held).toMatchObject({ owner: true, ...LIMITS, mint: MINT })
      expect(last()).toMatchObject({
        setUpAt: 42,
        verification,
        progress: { verified: true },
      })
      expect(sequence.progress).toMatchObject({ limitsSent: true, verified: true })
    })

    it("writes nothing to a card that already holds the intent's limits (a SET_LIMIT whose answer was lost)", async () => {
      const card = owned({ limits: LIMITS })
      const sequence = ownedSequence(card)
      await allowLoad(card.transceive, ownerSigner(FAKE_OWNER_KEY))
      card.transceive.mockClear()
      await finishHolderSetup(card.transceive, { ...sequence, granted: true })
      // Granted already: no ALLOW_LOAD before the read.
      expect(card.ins()).toEqual([0x01, 0x16])
      expect(last()).toMatchObject({ status: "set-up", verification: { held: LIMITS } })
    })

    it("never overwrites limits that are neither the intent's nor a new card's: changed elsewhere, unconfirmed", async () => {
      const foreign = { day: 7000, payment: 0, allowance: 0, rollBudget: 7 }
      const card = owned({ limits: foreign })
      const sequence = ownedSequence(card)
      const err = await finishHolderSetup(card.transceive, {
        ...sequence,
        granted: false,
      }).catch((e) => e)
      expect(err).toBeInstanceOf(SetupUnconfirmedError)
      expect(err.limitsChangedElsewhere).toBe(true)
      expect(err.fields).toEqual([
        "dailyLimit",
        "paymentLimit",
        "allowance",
        "rollBudget",
      ])
      expect(card.ins()).not.toContain(0x34)
      expect(card.limits()).toEqual(foreign)
      expect(last()).toMatchObject({
        status: "set-up",
        unconfirmed: ["dailyLimit", "paymentLimit", "allowance", "rollBudget"],
        limitsChangedElsewhere: true,
      })
      expect(last().verification).toBeUndefined()
      // No tap finishes it: not offered as unverified, but as limits that differ.
      expect(setupUnverified(last())).toBe(false)
      expect(setupLimitsDiffer(last())).toBe(true)
    })

    it("a persist rejected before the resumed SET_LIMIT sends it not", async () => {
      const card = owned()
      const sequence = ownedSequence(card)
      sequence.persist.mockRejectedValue(new PersistWriteError("not written"))
      await expect(
        finishHolderSetup(card.transceive, { ...sequence, granted: false }),
      ).rejects.toBeInstanceOf(PersistWriteError)
      expect(card.ins()).not.toContain(0x34)
    })

    it("a verified record that is not saved only warns: the next tap verifies again", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
      const card = owned({ limits: LIMITS })
      const sequence = ownedSequence(card)
      sequence.persist.mockRejectedValue(new Error("disk full"))
      await expect(
        finishHolderSetup(card.transceive, { ...sequence, granted: false }),
      ).resolves.toMatchObject({ held: { owner: true } })
      expect(warn).toHaveBeenCalledWith(
        "Cashu card setup record (set-up) not saved: Error",
      )
      warn.mockRestore()
    })

    it("an ENG-826 intent (no limits) is refused before anything is sent", async () => {
      const card = owned()
      const { intent, ...rest } = ownedSequence(card)
      const { limits: _dropped, ...legacy } = intent
      card.transceive.mockClear()
      await expect(
        finishHolderSetup(card.transceive, { ...rest, intent: legacy, granted: false }),
      ).rejects.toBeInstanceOf(CardNotOpenError)
      expect(card.transceive).not.toHaveBeenCalled()
    })

    it("a tap cut after SET_OWNER, then the next tap: SET_LIMIT once, and verified", async () => {
      const { card, info } = await fresh()
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x43) throw new Error("Tag was lost")
        return response
      })
      const args = argsFor(card, info)
      await expect(setUpCard(card.transceive, args)).rejects.toThrow("Tag was lost")
      const stored: CardSetup = JSON.parse(JSON.stringify(last()))
      expect(stored).toMatchObject({ status: "started", progress: { ownerSent: true } })
      card.transceive.mockImplementation(answer)
      await selectApplet(card.transceive)
      card.transceive.mockClear()
      await finishHolderSetup(card.transceive, {
        intent: stored.intent,
        progress: { ...stored.progress },
        key,
        persist: persistSpy(),
        granted: false,
      })
      expect(setLimitCount(card)).toBe(1)
      expect(card.limits()).toEqual(LIMITS)
      expect(last().verification).toBeDefined()
    })

    it("a tap cut after SET_LIMIT, then the next tap: no second SET_LIMIT, and verified", async () => {
      const { card, info } = await fresh()
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === 0x34) throw new Error("Tag was lost")
        return response
      })
      await expect(setUpCard(card.transceive, argsFor(card, info))).rejects.toThrow(
        "Tag was lost",
      )
      const stored: CardSetup = JSON.parse(JSON.stringify(last()))
      expect(stored).toMatchObject({ status: "set-up", progress: { limitsSent: true } })
      expect(setupUnverified(stored)).toBe(true)
      card.transceive.mockImplementation(answer)
      await selectApplet(card.transceive)
      card.transceive.mockClear()
      await finishHolderSetup(card.transceive, {
        intent: stored.intent,
        progress: { ...stored.progress },
        key,
        persist: persistSpy(),
        granted: false,
        setUpAt: stored.setUpAt,
      })
      expect(card.ins()).not.toContain(0x34)
      expect(last()).toMatchObject({
        setUpAt: stored.setUpAt,
        progress: { verified: true },
      })
    })
  })
})
