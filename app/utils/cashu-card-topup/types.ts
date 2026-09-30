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

/** Why a top-up step stopped: see `TopUpError`. */
export type TopUpFailure =
  | "amount"
  | "slots"
  | "unit"
  | "quote"
  | "state"
  | "not-found"
  | "restore"
  | "dleq"
  | "mint-mismatch"
  | "expired"
  /** The mint could not be asked (NUT-07, before a load's tap): the card was not touched. */
  | "mint-unreachable"

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
    /** Unix seconds on the mint's clock, or null when the mint sets none. */
    expiry: number | null
    /**
     * The phone's clock, in ms, when this quote arrived. Against the phone's
     * clock now, it says how old the quote is without comparing the phone's
     * clock with the mint's (`quoteAge` in the engine).
     */
    quotedAt: number
    /**
     * How long the quote lives, in ms: its `expiry` less its invoice's bolt11
     * timestamp, both on the mint's side. Null when there is no expiry.
     */
    lifeMs: number | null
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
    /** Never sent without it: a top-up is paid only under its key. */
    idempotencyKey: string
    /**
     * The retry flag. Set before a dispatch: while it is set a payment under
     * `idempotencyKey` may be out, so the next dispatch is a retry of that
     * key. Cleared, with a fresh key, only when a FIRST dispatch provably
     * moved nothing: refused before it executed, or reported failed by IBEX.
     */
    dispatched: boolean
    /**
     * Set before the first dispatch and never cleared. From then on the record
     * is dropped only once the mint still holds its quote unpaid well after the
     * quote expired: an answer read as a refusal may be wrong, and only this
     * record (its lock key) can mint a payment that lands anyway.
     */
    everDispatched: boolean
  }
  /**
   * Set when the mint refused this paid top-up in a way it will repeat: a
   * quote past its expiry, a signature that fails its DLEQ check, and the
   * like. The card-free pass stops asking the mint about it; the user can
   * still ask again (Finish), which asks the mint once more.
   */
  mintRefused?: TopUpFailure
  /** Set once minted: what each LOAD_PROOF writes. */
  proofs?: CardSlotProof[]
  /**
   * Set before the first LOAD_PROOF. From then on a proof may be on the card
   * without the app having seen the card's answer, so every later load reads
   * the card's inventory first (the card itself accepts duplicates), and asks
   * the mint about each proof the inventory does not find (a slot can be
   * spent and cleared since).
   */
  loadStarted: boolean
  state: TopUpState
  createdAt: number
  updatedAt: number
}
