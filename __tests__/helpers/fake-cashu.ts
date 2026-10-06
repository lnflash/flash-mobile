/**
 * Test doubles for the Cashu card top-up: a mint that really signs (BDHKE with
 * DLEQ, NUT-20 quote locks, NUT-09 restore, NUT-07 proof states), quotes real
 * signed bolt11 invoices, and refuses a paid quote past its expiry as Nutshell
 * does, and a card that stores proofs the way the applet does, duplicates
 * included. The mint has a sat and a usd keyset, as forge does.
 */
import { verifyMintQuoteSignature } from "../../app/utils/cashu-card-topup/nut20"
import { createHash } from "crypto"
import { encode, sign } from "bolt11"
import {
  Amount,
  MintKeys,
  MintOperationError,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  createBlindSignature,
  createDLEQProof,
  createNewMintKeys,
  pointFromHex,
} from "@cashu/cashu-ts"

import { PROOF_SIZE, Transceiver, toHex } from "../../app/utils/cashu-card"
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
  }
  return fake
}

const SW_OK = [0x90, 0x00]

export type FakeCard = {
  transceive: jest.Mock<Promise<number[]>, [number[]]>
  /** 0 empty, 1 unspent, 2 spent, then the 77 data bytes: the applet's slot. */
  slots: number[][]
  /** The INS of every APDU the card was sent, in order. */
  ins: () => number[]
  /** The nonces held in unspent slots, in slot order. */
  unspentNonces: () => string[]
}

/**
 * A card answering GET_SLOT_STATUS, GET_PROOF, LOAD_PROOF and CLEAR_SPENT as
 * the v0.2.0 applet does: LOAD_PROOF takes the first empty slot and checks
 * nothing, so the same proof can be loaded twice. The app never sends
 * CLEAR_SPENT; the card answers it anyway, as a real one would, so the specs
 * that it is never sent (`ins()`) check the APDUs, not a missing handler.
 */
export const createFakeCard = (maxSlots = 32): FakeCard => {
  const slots: number[][] = Array.from({ length: maxSlots }, () =>
    new Array(PROOF_SIZE).fill(0),
  )
  const transceive = jest.fn(async (apdu: number[]) => {
    const [, ins, p1] = apdu
    switch (ins) {
      case 0x14:
        return [...slots.map((slot) => slot[0]), ...SW_OK]
      case 0x13:
        if (slots[p1][0] === 0) return [0x6a, 0x88]
        return [...slots[p1], ...SW_OK]
      case 0x30: {
        const index = slots.findIndex((slot) => slot[0] === 0)
        if (index < 0) return [0x6a, 0x84]
        slots[index] = [1, ...apdu.slice(5, 5 + apdu[4])]
        return [index, ...SW_OK]
      }
      case 0x31: {
        let freed = 0
        slots.forEach((slot, i) => {
          if (slot[0] === 2) {
            slots[i] = new Array(PROOF_SIZE).fill(0)
            freed += 1
          }
        })
        return [freed, ...SW_OK]
      }
      default:
        return [0x6d, 0x00]
    }
  })
  return {
    transceive: transceive as FakeCard["transceive"],
    slots,
    ins: () => transceive.mock.calls.map(([apdu]) => apdu[1]),
    unspentNonces: () =>
      slots.filter((slot) => slot[0] === 1).map((slot) => toHex(slot.slice(13, 45))),
  }
}

/** A Transceiver type check for the fake, so specs can pass it as one. */
export const asTransceiver = (card: FakeCard): Transceiver => card.transceive
