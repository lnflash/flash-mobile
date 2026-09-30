/**
 * Test doubles for the Cashu card top-up: a mint that really signs (BDHKE with
 * DLEQ, NUT-20 quote locks, NUT-09 restore, NUT-07 proof states) and refuses
 * a paid quote past its expiry as Nutshell does, and a card that stores
 * proofs the way the applet does, duplicates included.
 */
import {
  Amount,
  MintKeys,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  createBlindSignature,
  createDLEQProof,
  createNewMintKeys,
  pointFromHex,
  verifyMintQuoteSignature,
} from "@cashu/cashu-ts"

import { PROOF_SIZE, Transceiver, toHex } from "../../app/utils/cashu-card"
import type { ProofState, QuoteState, TopUpMint } from "../../app/utils/cashu-card-topup"

type FakeQuote = {
  amount: number
  unit: string
  pubkey: string
  state: QuoteState
  request: string
  expiry: number | null
}

export type FakeMint = TopUpMint & {
  keysetId: string
  quotes: Map<string, FakeQuote>
  /** Settle a quote's invoice, as a payment reaching the mint would. */
  settle: (quote: string) => void
  /** Every output the mint has signed, by B_. */
  signed: Map<string, SerializedBlindedSignature>
  /** NUT-07: proofs the mint has seen spent (or pending), by Y. Others are UNSPENT. */
  proofStatesByY: Map<string, ProofState>
  /** How long a new quote lives, in seconds: phoenixd's createinvoice default. */
  ttlSeconds: number
}

/**
 * `now` is the mint's clock in ms (a quote's expiry is on it, as Nutshell's
 * is on the invoice's); pass the engine's clock so the two agree.
 */
export const createFakeMint = ({
  now = Date.now,
}: { now?: () => number } = {}): FakeMint => {
  const pair = createNewMintKeys(21, undefined, { unit: "sat", versionByte: 0 })
  const keys: Record<string, string> = {}
  Object.entries(pair.pubKeys).forEach(([amount, key]) => {
    keys[amount] = toHex(key)
  })
  const keyset = {
    id: pair.keysetId,
    unit: "sat",
    active: true,
    // The mint API's own field name.
    // eslint-disable-next-line camelcase
    input_fee_ppk: 0,
    keys,
  } as MintKeys
  const quotes = new Map<string, FakeQuote>()
  const signed = new Map<string, SerializedBlindedSignature>()
  const proofStatesByY = new Map<string, ProofState>()
  const nowSeconds = () => Math.floor(now() / 1000)
  let count = 0

  const sign = (message: SerializedBlindedMessage): SerializedBlindedSignature => {
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
    keysetId: pair.keysetId,
    quotes,
    signed,
    proofStatesByY,
    ttlSeconds: 3600,
    settle: (id) => {
      quoteOf(id).state = "PAID"
    },
    activeKeyset: jest.fn(async (unit: string) => {
      if (unit !== "sat") throw new Error(`no active ${unit} keyset`)
      return keyset
    }),
    keyset: jest.fn(async (id: string) => {
      if (id !== keyset.id) throw new Error(`unknown keyset ${id}`)
      return keyset
    }),
    createQuote: jest.fn(async ({ unit, amount, pubkey }) => {
      count += 1
      const id = `quote-${count}`
      const quote: FakeQuote = {
        amount,
        unit,
        pubkey,
        state: "UNPAID",
        request: `lnbc${amount}n1quote${count}`,
        expiry: nowSeconds() + fake.ttlSeconds,
      }
      quotes.set(id, quote)
      return { quote: id, ...quote }
    }),
    quoteState: jest.fn(async (id: string) => quoteOf(id).state),
    mint: jest.fn(async ({ quote: id, outputs, signature }) => {
      const quote = quoteOf(id)
      if (quote.state !== "PAID") throw new Error(`quote is ${quote.state}`)
      if (!verifyMintQuoteSignature(quote.pubkey, id, outputs, signature)) {
        throw new Error("the quote's NUT-20 signature does not verify")
      }
      const total = outputs.reduce((sum, o) => sum + Amount.from(o.amount).toNumber(), 0)
      if (total !== quote.amount) throw new Error("outputs do not add up to the quote")
      // Nutshell 0.20.3 cashu/mint/ledger.py mint(): a PAID quote is refused
      // once its expiry has passed, and stays PAID.
      if (quote.expiry !== null && quote.expiry < nowSeconds()) {
        throw new Error("quote expired")
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
 * nothing, so the same proof can be loaded twice.
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
