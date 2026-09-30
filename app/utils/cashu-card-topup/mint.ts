import {
  Amount,
  Mint,
  MintKeys,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
} from "@cashu/cashu-ts"

import type { CardUnit } from "./types"

/**
 * NUT-04 quote states: the mint's word on whether its invoice was paid.
 * Nutshell also answers PENDING while a mint call for the quote is running
 * (its MintQuoteState), which ends ISSUED, or PAID again if the call failed.
 */
export type QuoteState = "UNPAID" | "PAID" | "PENDING" | "ISSUED"

const QUOTE_STATES: readonly string[] = ["UNPAID", "PAID", "PENDING", "ISSUED"]

/** NUT-07 proof states: whether the mint has seen a proof spent. */
export type ProofState = "UNSPENT" | "PENDING" | "SPENT"

const PROOF_STATES: readonly string[] = ["UNSPENT", "PENDING", "SPENT"]

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
  /**
   * NUT-07: the state of each proof, by its Y = hash_to_curve(secret), in the
   * order asked. Every Y must come back with a known state, or this throws.
   */
  proofStates: (Ys: string[]) => Promise<ProofState[]>
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
    quoteState: async (quote) => {
      // Typed as three states; Nutshell can also answer PENDING. Anything
      // else is refused rather than read as "not unpaid", which is "paid".
      const { state } = await mint.checkMintQuoteBolt11(quote)
      if (!QUOTE_STATES.includes(state)) {
        throw new TopUpMintError(`the mint answered an unknown quote state (${state})`)
      }
      return state as QuoteState
    },
    mint: async (payload) => (await mint.mintBolt11(payload)).signatures,
    restore: (outputs) => mint.restore({ outputs }),
    proofStates: async (Ys) => {
      const { states } = await mint.check({ Ys })
      // Paired by Y, not by position, as cashu-client's checkProofStates
      // does: a verdict read against the wrong proof is worse than none.
      const byY = new Map(states.map((entry) => [entry.Y.toLowerCase(), entry.state]))
      return Ys.map((Y) => {
        const state = byY.get(Y.toLowerCase())
        if (state === undefined || !PROOF_STATES.includes(state)) {
          throw new TopUpMintError(`the mint gave no known state for proof ${Y}`)
        }
        return state as ProofState
      })
    },
  }
}
