/* eslint-disable no-bitwise, max-statements -- the fake card is a byte-level APDU codec,
   one command to a case, as the applet's own dispatch is */
/**
 * Test doubles for the Cashu card: a mint that really signs (BDHKE with DLEQ,
 * NUT-20 quote locks, NUT-09 restore, NUT-07 proof states, NUT-03 swaps of
 * SIG_ALL card pieces), quotes real signed bolt11 invoices, and refuses a paid
 * quote past its expiry as Nutshell does; and a 2.0 card (card protocol 2.0,
 * ENG-675) that answers the commands this app sends as the applet does. The
 * mint has a sat and a usd keyset, as forge does.
 */
import { createHash } from "crypto"
import { encode, sign } from "bolt11"
import {
  Amount,
  MintKeys,
  MintOperationError,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  createBlindSignature,
  createDLEQProof,
  createNewMintKeys,
  hashToCurve,
  pointFromHex,
} from "@cashu/cashu-ts"
import { p256 } from "@noble/curves/p256"
import { schnorr, secp256k1 } from "@noble/curves/secp256k1"
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import {
  CASHU_AID,
  CASHU_APPLET_AID,
  FOXY_LEGACY_AID,
  LEGACY_CASHU_AID,
  MAX_SLOTS,
  PIECE_SIZE,
  PROOF_SIZE,
  Transceiver,
  authMessage,
  toHex,
} from "../../app/utils/cashu-card"
import { verifyMintQuoteSignature } from "../../app/utils/cashu-card-topup/nut20"
import type {
  CardUnit,
  ProofState,
  QuoteState,
  TopUpMint,
} from "../../app/utils/cashu-card-topup"

type FakeQuote = {
  amount: number
  unit: string
  pubkey: string
  state: QuoteState
  request: string
  expiry: number | null
}

export type FakeMint = TopUpMint & {
  /** The sat keyset's id. */
  keysetId: string
  usdKeysetId: string
  quotes: Map<string, FakeQuote>
  /** Settle a quote's invoice, as a payment reaching the mint would. */
  settle: (quote: string) => void
  /** Every output the mint has signed, by B_. */
  signed: Map<string, SerializedBlindedSignature>
  /** NUT-07: proofs the mint has seen spent (or pending), by Y. Others are UNSPENT. */
  proofStatesByY: Map<string, ProofState>
  /**
   * How long a new quote lives, in seconds, by unit: for sat phoenixd's
   * createinvoice default, and for usd 60 s, IBEX's cap on the Flash invoice
   * forge's usd backend creates.
   */
  ttlSeconds: Record<CardUnit, number>
  /**
   * NUT-03 swap of the card's SIG_ALL pieces: the first input carries the one
   * NUT-11 SIG_ALL witness, the BIP-340 signature by the key every input
   * locks to over every input's secret and C and every output's amount and
   * B_; no input may be spent already. The inputs turn SPENT
   * (`proofStatesByY`) and the outputs are signed, as Nutshell does. Fees are
   * the keyset's `input_fee_ppk`, 0 here.
   */
  swap: (
    inputs: Proof[],
    outputs: SerializedBlindedMessage[],
  ) => Promise<SerializedBlindedSignature[]>
}

/** The mint's Lightning node key: it signs every quote's invoice, as phoenixd does. */
const NODE_KEY = "11".repeat(32)

/** A real bolt11 for quote `id`, `amount` sats, issued at `timestamp` (unix seconds). */
const bolt11 = ({
  id,
  amount,
  timestamp,
  ttlSeconds,
}: {
  id: string
  amount: number
  timestamp: number
  ttlSeconds: number
}): string => {
  const unsigned = encode({
    satoshis: amount,
    timestamp,
    tags: [
      { tagName: "payment_hash", data: createHash("sha256").update(id).digest("hex") },
      { tagName: "description", data: "fake mint quote" },
      { tagName: "expire_time", data: ttlSeconds },
    ],
  })
  return sign(unsigned, NODE_KEY).paymentRequest as string
}

/**
 * `now` is the mint's clock in ms: a quote's expiry and its invoice's issue
 * time are on it, as Nutshell's are on the invoice's. Give the engine its own
 * clock to model a phone whose clock is not the mint's.
 */
export const createFakeMint = ({
  now = Date.now,
}: { now?: () => number } = {}): FakeMint => {
  const keysetFor = (unit: CardUnit) => {
    const pair = createNewMintKeys(21, undefined, { unit, versionByte: 0 })
    const keys: Record<string, string> = {}
    Object.entries(pair.pubKeys).forEach(([amount, key]) => {
      keys[amount] = toHex(key)
    })
    const keyset = {
      id: pair.keysetId,
      unit,
      active: true,
      // The mint API's own field name.
      // eslint-disable-next-line camelcase
      input_fee_ppk: 0,
      keys,
    } as MintKeys
    return { pair, keyset }
  }
  const keysets = [keysetFor("sat"), keysetFor("usd")]
  const byId = (id: string) => keysets.find(({ keyset }) => keyset.id === id)
  const quotes = new Map<string, FakeQuote>()
  const signed = new Map<string, SerializedBlindedSignature>()
  const proofStatesByY = new Map<string, ProofState>()
  const nowSeconds = () => Math.floor(now() / 1000)
  let count = 0

  const sign = (message: SerializedBlindedMessage): SerializedBlindedSignature => {
    const found = byId(message.id)
    if (!found) throw new Error(`unknown keyset ${message.id}`)
    const { pair } = found
    const privateKey = pair.privKeys[Amount.from(message.amount).toString()]
    const B_ = pointFromHex(message.B_)
    const { C_ } = createBlindSignature(B_, privateKey, pair.keysetId)
    const dleq = createDLEQProof(B_, privateKey)
    return {
      id: pair.keysetId,
      amount: message.amount,
      C_: toHex(C_.toBytes(true)),
      dleq: { e: toHex(dleq.e), s: toHex(dleq.s) },
    }
  }

  const quoteOf = (id: string): FakeQuote => {
    const quote = quotes.get(id)
    if (!quote) throw new Error(`unknown quote ${id}`)
    return quote
  }

  const fake: FakeMint = {
    url: "https://mint.test",
    keysetId: keysets[0].keyset.id,
    usdKeysetId: keysets[1].keyset.id,
    quotes,
    signed,
    proofStatesByY,
    ttlSeconds: { sat: 3600, usd: 60 },
    settle: (id) => {
      quoteOf(id).state = "PAID"
    },
    activeKeyset: jest.fn(async (unit: CardUnit) => {
      const found = keysets.find(({ keyset }) => keyset.unit === unit)
      if (!found) throw new Error(`no active ${unit} keyset`)
      return found.keyset
    }),
    keyset: jest.fn(async (id: string) => {
      const found = byId(id)
      if (!found) throw new Error(`unknown keyset ${id}`)
      return found.keyset
    }),
    createQuote: jest.fn(async ({ unit, amount, pubkey }) => {
      count += 1
      const id = `quote-${count}`
      const issuedAt = nowSeconds()
      const ttlSeconds = fake.ttlSeconds[unit]
      const quote: FakeQuote = {
        amount,
        unit,
        pubkey,
        state: "UNPAID",
        request: bolt11({ id, amount, timestamp: issuedAt, ttlSeconds }),
        expiry: issuedAt + ttlSeconds,
      }
      quotes.set(id, quote)
      return { quote: id, ...quote }
    }),
    quoteState: jest.fn(async (id: string) => quoteOf(id).state),
    mint: jest.fn(async ({ quote: id, outputs, signature }) => {
      const quote = quoteOf(id)
      // Nutshell cashu/mint/ledger.py mint() (main), in its order. Each
      // refusal is a 400 that cashu-ts throws as MintOperationError(code,
      // detail). A PAID quote refused after the state checks stays PAID.
      if (outputs.some((o) => !byId(o.id))) {
        throw new MintOperationError(12001, "keyset not found")
      }
      if (quote.state === "PENDING") {
        throw new MintOperationError(20005, "Mint quote already pending.")
      }
      if (quote.state === "ISSUED") {
        throw new MintOperationError(20002, "quote already issued")
      }
      if (quote.state !== "PAID") throw new MintOperationError(20001, "quote not paid")
      if (outputs.some((o) => byId(o.id)?.keyset.unit !== quote.unit)) {
        throw new MintOperationError(11000, "quote unit does not match output unit")
      }
      const total = outputs.reduce((sum, o) => sum + Amount.from(o.amount).toNumber(), 0)
      if (total !== quote.amount) {
        throw new MintOperationError(11000, "amount to mint does not match quote amount")
      }
      // Past its expiry: main raises QuoteExpiredError (20007); 0.20.3 raised
      // TransactionError (11000) with the same detail.
      if (quote.expiry !== null && quote.expiry < nowSeconds()) {
        throw new MintOperationError(20007, "quote expired")
      }
      if (
        !verifyMintQuoteSignature({
          pubkey: quote.pubkey,
          quoteId: id,
          outputs,
          signature,
        })
      ) {
        throw new MintOperationError(20008, "Signature for mint request invalid")
      }
      const signatures = outputs.map(sign)
      outputs.forEach((output, i) => signed.set(output.B_, signatures[i]))
      quote.state = "ISSUED"
      return signatures
    }),
    restore: jest.fn(async (outputs: SerializedBlindedMessage[]) => {
      const found = outputs.filter((output) => signed.has(output.B_))
      return {
        outputs: found,
        signatures: found.map(
          (output) => signed.get(output.B_) as SerializedBlindedSignature,
        ),
      }
    }),
    proofStates: jest.fn(async (Ys: string[]) =>
      Ys.map((Y) => proofStatesByY.get(Y) ?? "UNSPENT"),
    ),
    swap: jest.fn(async (inputs: Proof[], outputs: SerializedBlindedMessage[]) => {
      const total = (items: { amount: Proof["amount"] }[]) =>
        items.reduce((sum, item) => sum + Amount.from(item.amount).toNumber(), 0)
      if (total(inputs) !== total(outputs)) {
        throw new MintOperationError(11000, "inputs and outputs do not balance")
      }
      const Ys = inputs.map((input) =>
        toHex(hashToCurve(new TextEncoder().encode(input.secret)).toBytes(true)),
      )
      if (Ys.some((Y) => proofStatesByY.get(Y) === "SPENT")) {
        throw new MintOperationError(11001, "Token already spent.")
      }
      // NUT-11 SIG_ALL: one signature, the first input's witness, over every
      // input's secret and C and every output's amount and B_, by the key the
      // inputs lock to (all the same, all flagged SIG_ALL).
      const locks = inputs.map((input) => {
        const [kind, body] = JSON.parse(input.secret)
        const flagged = (body?.tags ?? []).some(
          (tag: string[]) => tag[0] === "sigflag" && tag[1] === "SIG_ALL",
        )
        return kind === "P2PK" && flagged ? (body.data as string) : undefined
      })
      const witness =
        typeof inputs[0]?.witness === "string"
          ? JSON.parse(inputs[0].witness)
          : inputs[0]?.witness
      const signature = witness?.signatures?.[0]
      const message =
        inputs.map((input) => input.secret + input.C).join("") +
        outputs
          .map((output) => `${Amount.from(output.amount).toString()}${output.B_}`)
          .join("")
      const digest = createHash("sha256").update(message).digest()
      if (
        !locks[0] ||
        locks.some((lock) => lock !== locks[0]) ||
        typeof signature !== "string" ||
        !schnorr.verify(signature, digest, locks[0].slice(2))
      ) {
        throw new MintOperationError(10001, "no valid signature provided for input.")
      }
      Ys.forEach((Y) => proofStatesByY.set(Y, "SPENT"))
      return outputs.map(sign)
    }),
  }
  return fake
}

const SW_OK = [0x90, 0x00]
const sw = (word: number) => [(word >> 8) & 0xff, word & 0xff]

/** The applet's PIN try limit. */
const PIN_TRIES = 3
const SLOT_DATA = PIECE_SIZE
const SEAL_TAG = 16

/**
 * A fixed P-256 owner key for the fake card's owner when a spec does not name
 * one: any key will do, and this one is not the TEST key, so a spec that
 * hands the app the TEST key sees the card refuse it.
 */
export const FAKE_OWNER_KEY = "42".repeat(32)
/** The fake card's own secp256k1 key when a spec does not name one. */
export const FAKE_CARD_KEY = "07".repeat(32)
/** The fake card's PIN key (the sealed PIN's), never its signing key. */
const FAKE_PIN_KEY = "31".repeat(32)

export type FakeCard = {
  transceive: jest.Mock<Promise<number[]>, [number[]]>
  /** 0 empty, 1 unspent, 2 spent, then the 81 data bytes (keyset, amount, nonce, C, date): the applet's slot. */
  slots: number[][]
  /** The mint's DLEQ proof (e ‖ s ‖ r, 96 bytes) the card kept beside a slot, by slot. */
  dleqs: Map<number, number[]>
  /** The INS of every APDU the card was sent, in order (SELECT as 0xA4). */
  ins: () => number[]
  /** The nonces held in unspent slots, in slot order. */
  unspentNonces: () => string[]
  /** The PIN the card holds, or undefined while it has none. */
  pin: () => string | undefined
  /** Whether the session has verified the PIN (VERIFY_PIN 9000, nothing failed since). */
  verified: () => boolean
  /** Whether the owner's grant (ALLOW_LOAD) is live in this session. */
  granted: () => boolean
  /** Tries left before the PIN blocks. */
  triesLeft: () => number
  /** The owner's public key (65 bytes, hex), or undefined with no owner. */
  owner: () => string | undefined
  /** The card's clock: the newest header's time. */
  now: () => number
  /** The record: set, and its mint. */
  record: () => { set: boolean; mint: string }
  /** The owner's limits as the card holds them. */
  limits: () => { day: number; payment: number; allowance: number; rollBudget: number }
  /** How often the window has rolled since the owner's last REFRESH. */
  rolls: () => number
  /** The card's public key, 33 bytes hex. */
  pubkey: string
}

export type FakeCardOptions = {
  /** A PIN the card ships with; none by default. */
  pin?: string
  /**
   * The owner's P-256 private key (hex), or `null` for a card with no owner.
   * By default the card is owned by `FAKE_OWNER_KEY`, with its record set.
   */
  owner?: string | null
  /** The record (SET_CARD) is set: by default when the card has an owner. */
  record?: boolean
  /** Capability bit 7: the card takes its PIN sealed. Off by default. */
  sealed?: boolean
  /** The card's own secp256k1 key (hex). */
  cardKey?: string
  /** The version SELECT and GET_INFO say. 2.0 by default. */
  version?: [number, number]
  /**
   * A card of an older protocol: it answers SELECT only to the withdrawn AID
   * ("0.x": D2 76 00 00 85 01 02; "1.x": Foxy's), and nothing else.
   */
  legacy?: "0.x" | "1.x"
  /** Answer AUTH with this tampered signature, as a card that is not the key it reported. */
  badAuth?: boolean
  /** How often the day's window has rolled since the owner's last REFRESH (GET_CARD byte 76). 0 by default. */
  rolls?: number
  /** The owner's limits the card ships with; all off, budget 7, by default. */
  limits?: Partial<{
    day: number
    payment: number
    allowance: number
    rollBudget: number
  }>
}

const hexToBytes = (hex: string): number[] =>
  (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
const sameBytes = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, i) => value === b[i])
const u32 = (n: number) => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
]
const readU32 = (b: number[], at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))

const LEGACY_AIDS = { "0.x": LEGACY_CASHU_AID, "1.x": FOXY_LEGACY_AID }

/**
 * A 2.0 card (cashu-javacard spec/APDU.md at the pinned ref), as far as this
 * app speaks to it: SELECT, GET_INFO (P1 = 1, 42 bytes), GET_PUBKEY,
 * GET_BALANCE, GET_PROOF_COUNT, GET_PROOF (82 bytes), GET_SLOT_STATUS,
 * GET_PIECES (pages), AUTH, GET_CARD, LOAD_PROOF (81 or 177 bytes, 6A94 for a
 * nonce already on the card), CLEAR_SPENT, SET_CARD, SET_LIMIT, SET_HEADER,
 * TELL_TIME, VERIFY_PIN / SET_PIN / CHANGE_PIN (clear and sealed), SET_OWNER,
 * GET_NONCE (P1 = 0 and 1), ALLOW_LOAD and REFRESH, with the owner's proof
 * (ECDSA P-256 over label ‖ nonce ‖ value, one try per nonce) checked as the
 * applet checks it. And a till's SPEND_ALL_BEGIN, SPEND_ALL_OUTPUTS and
 * SPEND_ALL_SIGN, for the e2e fixtures' spent slots. SELECT ends the session:
 * the verified PIN, the owner's nonce and the grant go, as on a new tap.
 * The real applet is cardsim's: `__tests__/integration/card-topup-cardsim.spec.ts`
 * holds this app to it.
 */
export const createFakeCard = (
  maxSlots = MAX_SLOTS,
  {
    pin: initialPin,
    owner: ownerOption = FAKE_OWNER_KEY,
    record: recordOption,
    sealed = false,
    cardKey = FAKE_CARD_KEY,
    version = [2, 0],
    legacy,
    badAuth = false,
    rolls: initialRolls = 0,
    limits: initialLimits = {},
  }: FakeCardOptions = {},
): FakeCard => {
  const slots: number[][] = Array.from({ length: maxSlots }, () =>
    new Array(PROOF_SIZE).fill(0),
  )
  const dleqs = new Map<number, number[]>()
  const cardKeyBytes = hexToBytes(cardKey)
  const pubkey = toHex(secp256k1.getPublicKey(Uint8Array.from(cardKeyBytes), true))
  const pinKeyPub = Array.from(secp256k1.getPublicKey(FAKE_PIN_KEY, true))
  let pin = initialPin
  let pinState = initialPin === undefined ? 0 : 1
  let tries = PIN_TRIES
  let verified = false
  let grant = false
  let nonce: number[] | undefined
  let owner: number[] | undefined =
    ownerOption === null ? undefined : Array.from(p256.getPublicKey(ownerOption, false))
  let recordSet = recordOption ?? owner !== undefined
  let mintUrl = recordSet ? "https://mint.test" : ""
  let now = 0
  let rolls = initialRolls
  let limits = { day: 0, payment: 0, allowance: 0, rollBudget: 7, ...initialLimits }
  let payment: { slots: number[]; outputs: number[][] } | undefined

  const pinOf = (bytes: number[]) => String.fromCharCode(...bytes)
  const counts = () =>
    slots.reduce(
      (n, slot) => {
        n[slot[0]] += 1
        return n
      },
      [0, 0, 0],
    )
  const pinOpen = () => verified || grant || pinState === 0
  const wrongPin = () => {
    verified = false
    tries -= 1
    if (tries === 0) {
      pinState = 2
      return sw(0x6983)
    }
    return [0x63, 0xc0 + tries]
  }

  /** The owner's proof at the head of `data`: the value after it, or a status word. */
  const ownerProof = (
    label: string,
    data: number[],
  ): number[] | { refused: number[] } => {
    if (!owner) return { refused: sw(0x6a90) }
    const live = nonce
    nonce = undefined
    const length = data[0]
    if (
      !live ||
      length === undefined ||
      length < 8 ||
      length > 72 ||
      data.length < 1 + length
    ) {
      return { refused: sw(0x6a91) }
    }
    const proof = data.slice(1, 1 + length)
    const value = data.slice(1 + length)
    const digest = sha256(Uint8Array.from([...ascii(label), ...live, ...value]))
    let good = false
    try {
      good = p256.verify(Uint8Array.from(proof), digest, Uint8Array.from(owner), {
        lowS: false,
        format: "der",
      })
    } catch {
      good = false
    }
    if (!good) return { refused: sw(0x6a91) }
    // A good proof arms the allowance; nothing more here.
    return value
  }

  /** A sealed command's data opened, or undefined where the envelope does not open. */
  const unseal = (ins: number, data: number[], spend: boolean): number[] | undefined => {
    const live = nonce
    if (spend) nonce = undefined
    if (!live) return undefined
    if (data.length < 65 + 1 + SEAL_TAG) return undefined
    const e = data.slice(0, 65)
    const ct = data.slice(65, data.length - SEAL_TAG)
    const tag = data.slice(data.length - SEAL_TAG)
    let shared: number[]
    try {
      shared = Array.from(
        secp256k1.getSharedSecret(FAKE_PIN_KEY, toHex(e), true).slice(1, 33),
      )
    } catch {
      nonce = undefined
      return undefined
    }
    const head = [...shared, ...e, ...live, ins]
    const block = (i: number, more: number[] = []) =>
      Array.from(
        sha256(Uint8Array.from([...ascii("CashuCard/seal"), i, ...head, ...more])),
      )
    if (!sameBytes(block(0, ct).slice(0, SEAL_TAG), tag)) {
      nonce = undefined
      return undefined
    }
    const clear: number[] = []
    for (let at = 0; at < ct.length; at += 32) {
      const stream = block(1 + at / 32)
      for (let k = 0; k < 32 && at + k < ct.length; k += 1)
        clear.push(ct[at + k] ^ stream[k])
    }
    return clear
  }

  /** The PIN block at the end of `clear`, as the PIN's bytes in its place. */
  const unblock = (clear: number[]): number[] | undefined => {
    if (clear.length < 9) return undefined
    const block = clear.slice(clear.length - 9)
    const length = block[0]
    if (length < 4 || length > 8) return undefined
    return [...clear.slice(0, clear.length - 9), ...block.slice(1, 1 + length)]
  }

  const secretOf = (slot: number[]) => {
    const nonceHex = toHex(slot.slice(13, 45))
    return `["P2PK",{"nonce":"${nonceHex}","data":"${pubkey}","tags":[["sigflag","SIG_ALL"]]}]`
  }

  const answer = (apdu: number[]): number[] => {
    const [cla, ins, p1, p2] = apdu
    const lc = apdu.length > 5 ? apdu[4] : 0
    const data = apdu.slice(5, 5 + lc)
    if (cla === 0x00 && ins === 0xa4) {
      verified = false
      grant = false
      nonce = undefined
      payment = undefined
      if (legacy) return sameBytes(data, LEGACY_AIDS[legacy]) ? SW_OK : sw(0x6a82)
      if (sameBytes(data, CASHU_AID) || sameBytes(data, CASHU_APPLET_AID)) {
        return [...version, ...SW_OK]
      }
      return sw(0x6a82)
    }
    if (legacy) return sw(0x6e00)
    if (cla !== 0xb0) return sw(0x6e00)
    switch (ins) {
      case 0x01: {
        const [empty, unspent, spent] = counts()
        const caps = 0x7f | (sealed ? 0x80 : 0)
        const body = [
          ...version,
          maxSlots,
          unspent,
          spent,
          empty,
          caps,
          pinState,
          4,
          tries,
          0,
          recordSet ? 1 : 0,
          ...u32(limits.day),
          owner ? 1 : 0,
          ...u32(now),
          ...u32(0),
          ...u32(0),
          0,
        ]
        if (p1 === 1)
          body.push(
            ...u32(grant ? limits.payment : 0),
            ...u32(limits.allowance),
            ...u32(0),
          )
        return [...body, ...SW_OK]
      }
      case 0x10:
        return [...hexToBytes(pubkey), ...SW_OK]
      case 0x11: {
        const balance = slots
          .filter((slot) => slot[0] === 1)
          .reduce((sum, slot) => sum + readU32(slot, 9), 0)
        return [...u32(balance), ...SW_OK]
      }
      case 0x12: {
        const [, unspent, spent] = counts()
        return [unspent + spent, ...SW_OK]
      }
      case 0x13:
        if (p1 >= maxSlots) return sw(0x6a83)
        if (slots[p1][0] === 0) return sw(0x6a88)
        return [...slots[p1], ...SW_OK]
      case 0x14:
        return [...slots.map((slot) => slot[0]), ...SW_OK]
      case 0x15: {
        if (data.length !== 16) return sw(0x6700)
        const mine = Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff)
        const message = authMessage(data, mine, hexToBytes(pubkey))
        const signature = Array.from(schnorr.sign(message, Uint8Array.from(cardKeyBytes)))
        if (badAuth) signature[63] ^= 1
        return [...mine, ...signature, ...SW_OK]
      }
      case 0x16: {
        const mint = ascii(mintUrl)
        return [
          4,
          recordSet ? 1 : 0,
          0,
          ...u32(limits.day),
          ...new Array(33).fill(0),
          ...new Array(4).fill(0),
          ...new Array(32).fill(0),
          rolls,
          limits.rollBudget === 7 ? 0 : limits.rollBudget,
          0,
          ...new Array(26).fill(0),
          mint.length,
          ...mint,
          0,
          0,
          0,
          ...SW_OK,
        ]
      }
      case 0x17: {
        if (p2 !== 0) return sw(0x6a86)
        if (p1 >= maxSlots) return sw(0x6a83)
        let length = 1
        let next = p1
        while (next < maxSlots) {
          const status = slots[next][0]
          const cost = status === 1 ? PROOF_SIZE : status === 2 ? 1 : 0
          if (length + cost > 255) break
          length += cost
          next += 1
        }
        // A smaller fake still ends its last page at the protocol's 128.
        const body = [next === maxSlots ? MAX_SLOTS : next]
        for (let i = p1; i < next; i += 1) {
          if (slots[i][0] === 1) body.push(i, ...slots[i].slice(1))
          if (slots[i][0] === 2) body.push(i | 0x80)
        }
        return [...body, ...SW_OK]
      }
      case 0x30: {
        if (!pinOpen()) return sw(0x6982)
        if (!owner) return sw(0x6a90)
        if (!recordSet) return sw(0x6a8c)
        const withDleq = p1 === 1
        if (data.length !== (withDleq ? SLOT_DATA + 96 : SLOT_DATA)) return sw(0x6700)
        const piece = data.slice(0, SLOT_DATA)
        const pieceNonce = piece.slice(12, 44)
        if (
          slots.some((slot) => slot[0] !== 0 && sameBytes(slot.slice(13, 45), pieceNonce))
        ) {
          return sw(0x6a94)
        }
        const index = slots.findIndex((slot) => slot[0] === 0)
        if (index < 0) return sw(0x6a84)
        slots[index] = [1, ...piece]
        if (withDleq) {
          dleqs.set(index, data.slice(SLOT_DATA))
          return [index, 1, ...SW_OK]
        }
        return [index, ...SW_OK]
      }
      case 0x31: {
        if (!pinOpen()) return sw(0x6982)
        let freed = 0
        slots.forEach((slot, i) => {
          if (slot[0] === 2) {
            slots[i] = new Array(PROOF_SIZE).fill(0)
            dleqs.delete(i)
            freed += 1
          }
        })
        return [freed, ...SW_OK]
      }
      case 0x32: {
        let value = data
        if (owner) {
          const proved = ownerProof("CashuCard/set-card", data)
          if ("refused" in proved) return proved.refused
          value = proved
        } else if (pinState !== 0 && !verified) {
          return sw(0x6982)
        }
        if (counts()[1] > 0) return sw(0x6a8d)
        if (value.length < 101) return sw(0x6700)
        const length = value[99]
        mintUrl = String.fromCharCode(...value.slice(100, 100 + length))
        recordSet = true
        return SW_OK
      }
      case 0x34: {
        const proved = ownerProof("CashuCard/set-limit", data)
        if ("refused" in proved) return proved.refused
        if (![4, 8, 12, 13].includes(proved.length)) return sw(0x6700)
        const budget = proved.length === 13 ? proved[12] : 7
        if (budget < 1 || budget > 30) return sw(0x6a80)
        if (proved.length >= 12 && readU32(proved, 8) > 0 && pinState === 0)
          return sw(0x6985)
        limits = {
          day: readU32(proved, 0),
          payment: proved.length >= 8 ? readU32(proved, 4) : limits.payment,
          allowance: proved.length >= 12 ? readU32(proved, 8) : limits.allowance,
          rollBudget: budget,
        }
        return SW_OK
      }
      case 0x36: {
        if (data.length !== 80) return sw(0x6700)
        const time = data[68] | (data[69] << 8) | (data[70] << 16) | (data[71] << 24)
        now = Math.max(now, time >>> 0)
        return [...u32(now), ...SW_OK]
      }
      case 0x37:
        return data.length === 4 ? SW_OK : sw(0x6700)
      case 0x40: {
        if (pinState === 0) return sw(0x6984)
        if (pinState === 2) return sw(0x6983)
        let pinData = data
        if (p1 === 1) {
          const clear = unseal(ins, data, true)
          if (!clear) return wrongPin()
          const opened = unblock(clear)
          if (!opened) return sw(0x6700)
          pinData = opened
        }
        if (pinOf(pinData) !== pin) return wrongPin()
        verified = true
        tries = PIN_TRIES
        return SW_OK
      }
      case 0x41: {
        if (owner) {
          if (pinState !== 0 || !grant) return sw(0x6a91)
        } else if (counts()[1] > 0) {
          return sw(0x6a8d)
        }
        let pinData = data
        if (p1 === 1) {
          const clear = unseal(ins, data, true)
          if (!clear) return sw(0x6a80)
          const opened = unblock(clear)
          if (!opened) return sw(0x6700)
          pinData = opened
        }
        if (pinData.length < 4 || pinData.length > 8) return sw(0x6700)
        pin = pinOf(pinData)
        pinState = 1
        tries = PIN_TRIES
        verified = false
        return SW_OK
      }
      case 0x42: {
        if (!owner) return sw(0x6a90)
        let commandData = data
        if (p1 === 1) {
          const clear = unseal(ins, data, false)
          if (!clear) return sw(0x6a80)
          const opened = unblock(clear)
          if (!opened) return sw(0x6700)
          commandData = opened
        }
        const proved = ownerProof("CashuCard/change-pin", commandData)
        if ("refused" in proved) return proved.refused
        if (proved.length < 4 || proved.length > 8) return sw(0x6700)
        pin = pinOf(proved)
        pinState = 1
        tries = PIN_TRIES
        verified = false
        return SW_OK
      }
      case 0x43: {
        let value = data
        if (owner) {
          const proved = ownerProof("CashuCard/set-owner", data)
          if ("refused" in proved) return proved.refused
          value = proved
        }
        if (counts()[1] > 0) return sw(0x6a8d)
        if (value.length !== 65 && value.length !== 145) return sw(0x6700)
        if (value[0] !== 0x04) return sw(0x6a80)
        owner = value.slice(0, 65)
        if (value.length === 145) {
          const header = value.slice(65)
          now = Math.max(
            now,
            (header[68] | (header[69] << 8) | (header[70] << 16) | (header[71] << 24)) >>>
              0,
          )
        }
        rolls = 0
        return SW_OK
      }
      case 0x44: {
        nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
        if (p1 === 1) {
          const digest = sha256(
            Uint8Array.from([...ascii("CashuCard/pinkey"), ...pinKeyPub]),
          )
          const signature = Array.from(
            schnorr.sign(digest, Uint8Array.from(cardKeyBytes)),
          )
          return [...nonce, ...pinKeyPub, ...signature, ...SW_OK]
        }
        if (!owner) {
          nonce = undefined
          return sw(0x6a90)
        }
        return [...nonce, ...SW_OK]
      }
      case 0x45: {
        const proved = ownerProof("CashuCard/load", data)
        if ("refused" in proved) return proved.refused
        grant = true
        return SW_OK
      }
      case 0x53: {
        const proved = ownerProof("CashuCard/refresh", data)
        if ("refused" in proved) return proved.refused
        if (proved.length !== 80) return sw(0x6700)
        now = Math.max(
          now,
          (proved[68] | (proved[69] << 8) | (proved[70] << 16) | (proved[71] << 24)) >>>
            0,
        )
        rolls = 0
        return [...u32(now), ...SW_OK]
      }
      case 0x22: {
        if (data.length < 1) return sw(0x6700)
        for (const slot of data) {
          if (slot >= maxSlots) return sw(0x6a83)
          if (slots[slot][0] === 0) return sw(0x6a88)
          if (slots[slot][0] === 2) return sw(0x6985)
        }
        payment = { slots: data, outputs: [] }
        return [
          ...u32(data.reduce((sum, slot) => sum + readU32(slots[slot], 9), 0)),
          ...SW_OK,
        ]
      }
      case 0x23: {
        if (!payment) return sw(0x6985)
        if (data.length % 37 !== 0) return sw(0x6700)
        for (let at = 0; at < data.length; at += 37)
          payment.outputs.push(data.slice(at, at + 37))
        return SW_OK
      }
      case 0x24: {
        if (!payment) return sw(0x6985)
        if (pinState !== 0 && !verified) {
          payment = undefined
          return sw(0x6a94)
        }
        let message = ""
        payment.slots.forEach((slot) => {
          message += secretOf(slots[slot]) + toHex(slots[slot].slice(45, 78))
        })
        payment.outputs.forEach((output) => {
          message += String(readU32(output, 0)) + toHex(output.slice(4))
        })
        const signature = Array.from(
          schnorr.sign(
            sha256(new TextEncoder().encode(message)),
            Uint8Array.from(cardKeyBytes),
          ),
        )
        payment.slots.forEach((slot) => {
          slots[slot][0] = 2
        })
        payment = undefined
        return [...signature, ...SW_OK]
      }
      default:
        return sw(0x6d00)
    }
  }

  const transceive = jest.fn(async (apdu: number[]) => answer(apdu))
  return {
    transceive: transceive as FakeCard["transceive"],
    slots,
    dleqs,
    ins: () => transceive.mock.calls.map(([apdu]) => apdu[1]),
    unspentNonces: () =>
      slots.filter((slot) => slot[0] === 1).map((slot) => toHex(slot.slice(13, 45))),
    pin: () => pin,
    verified: () => verified,
    granted: () => grant,
    triesLeft: () => tries,
    owner: () => (owner ? toHex(owner) : undefined),
    now: () => now,
    record: () => ({ set: recordSet, mint: mintUrl }),
    limits: () => limits,
    rolls: () => rolls,
    pubkey,
  }
}

/** A Transceiver type check for the fake, so specs can pass it as one. */
export const asTransceiver = (card: FakeCard): Transceiver => card.transceive
