import {
  Amount,
  Mint,
  MintKeys,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
} from "@cashu/cashu-ts"

import type { CardUnit } from "./types"

/** NUT-04 quote states: the mint's word on whether its invoice was paid. */
export type QuoteState = "UNPAID" | "PAID" | "ISSUED"

export type TopUpQuote = {
  quote: string
  request: string
  unit: string
  amount: number
  state: QuoteState
  expiry: number | null
  pubkey?: string
}

/** The mint calls a top-up makes, over the mint the app is connected to. */
export type TopUpMint = {
  url: string
  /** The active keyset for `unit`, with its keys. */
  activeKeyset: (unit: CardUnit) => Promise<MintKeys>
  keyset: (id: string) => Promise<MintKeys>
  createQuote: (args: {
    unit: CardUnit
    amount: number
    /** NUT-20: only a signature from this key can mint the quote. */
    pubkey: string
  }) => Promise<TopUpQuote>
  quoteState: (quote: string) => Promise<QuoteState>
  mint: (args: {
    quote: string
    outputs: SerializedBlindedMessage[]
    signature: string
  }) => Promise<SerializedBlindedSignature[]>
  /** NUT-09: the signatures the mint already made on these outputs. */
  restore: (outputs: SerializedBlindedMessage[]) => Promise<{
    outputs: SerializedBlindedMessage[]
    signatures: SerializedBlindedSignature[]
  }>
}

/**
 * A card slot stores the keyset id as 8 raw bytes (spec/APDU.md), which is a
 * NUT-02 v1 id: 16 hex chars. A v2 id (33 bytes) cannot be written, so a
 * keyset with one is refused before anything is minted under it.
 */
const CARD_KEYSET_ID = /^[0-9a-f]{16}$/

export class TopUpMintError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TopUpMintError"
  }
}

export const createTopUpMint = (url: string): TopUpMint => {
  const mint = new Mint(url)
  const keysets = new Map<string, Promise<MintKeys>>()

  const keyset = (id: string): Promise<MintKeys> => {
    let cached = keysets.get(id)
    if (!cached) {
      cached = mint.getKeys(id).then(({ keysets: found }) => {
        const match = found.find((k) => k.id === id)
        if (!match) throw new TopUpMintError(`the mint does not publish keyset ${id}`)
        return match
      })
      keysets.set(id, cached)
      // A failed fetch is not cached: the next call asks again.
      cached.catch(() => keysets.delete(id))
    }
    return cached
  }

  return {
    url,
    keyset,
    activeKeyset: async (unit) => {
      const { keysets: all } = await mint.getKeySets()
      const active = all
        .filter((k) => k.unit === unit && k.active)
        .sort((a, b) => (a.input_fee_ppk ?? 0) - (b.input_fee_ppk ?? 0))
      if (active.length === 0) {
        throw new TopUpMintError(`the mint has no active ${unit} keyset`)
      }
      const [chosen] = active
      if (!CARD_KEYSET_ID.test(chosen.id)) {
        throw new TopUpMintError(
          `keyset ${chosen.id} does not fit in a card slot (8-byte keyset id)`,
        )
      }
      return keyset(chosen.id)
    },
    createQuote: async ({ unit, amount, pubkey }) => {
      const quote = await mint.createMintQuoteBolt11({ unit, amount, pubkey })
      return {
        quote: quote.quote,
        request: quote.request,
        unit: quote.unit,
        amount: Amount.from(quote.amount).toNumber(),
        state: quote.state,
        expiry: quote.expiry ?? null,
        pubkey: quote.pubkey,
      }
    },
    quoteState: async (quote) => (await mint.checkMintQuoteBolt11(quote)).state,
    mint: async (payload) => (await mint.mintBolt11(payload)).signatures,
    restore: (outputs) => mint.restore({ outputs }),
  }
}
