import type { CardSlotProof } from "../cashu-card-outputs"

/** The units a card can hold (ENG-616 D1: sat by default, usd as an option). */
export type CardUnit = "sat" | "usd"

/** One blinded output the app asked the mint to sign, as persisted. */
export type TopUpOutput = {
  amount: number
  /** The canonical card secret, exactly as the card will rebuild it. */
  secret: string
  /** Blinding factor r, 64 hex chars: what unblinds the mint's signature. */
  r: string
  /** The blinded message B_, 66 hex chars: what the mint signs, and the NUT-09 restore key. */
  B_: string
}

/**
 * Where a top-up stands. Each state is persisted before the next outside
 * effect (a payment, a mint call, a card write), so an interruption at any
 * point resumes rather than repeats:
 *
 * - `quoted`: the mint quote and the outputs are saved; whether the invoice is
 *   paid is the mint's to say (its quote state), not the wallet's.
 * - `paid`: the invoice is paid. The mint owes signatures on the saved outputs.
 * - `minted`: the proofs are unblinded, DLEQ-checked and saved. Some or none
 *   are on the card yet.
 * - `loaded`: every proof is on the card.
 */
export type TopUpState = "quoted" | "paid" | "minted" | "loaded"

export type TopUpRecord = {
  version: 1
  id: string
  cardPubkey: string
  mintUrl: string
  unit: CardUnit
  /** In the unit's smallest denomination: sats, or cents for usd. */
  amount: number
  keysetId: string
  quote: {
    id: string
    /** The bolt11 invoice the wallet pays. */
    request: string
    /** Unix seconds, or null when the mint sets none. */
    expiry: number | null
  }
  /**
   * NUT-20: the private key the quote is locked to, hex. Without it nobody,
   * this app included, can mint the paid quote, so it is kept until the
   * proofs are saved.
   */
  lockKey?: string
  outputs: TopUpOutput[]
  payment: {
    walletId: string
    idempotencyKey: string
    /** Set before the first dispatch: from then on the outcome may be unknown. */
    dispatched: boolean
    /** A dispatch went out without the key (the server refused the field). */
    wentKeyless: boolean
  }
  /** Set once minted: what each LOAD_PROOF writes. */
  proofs?: CardSlotProof[]
  /**
   * Set before the first LOAD_PROOF. From then on a proof may be on the card
   * without the app having seen the card's answer, so every later load reads
   * the card's inventory first: the card itself accepts duplicates.
   */
  loadStarted: boolean
  state: TopUpState
  createdAt: number
  updatedAt: number
}
