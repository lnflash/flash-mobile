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
  /** The card has no owner yet: it takes no top-up until it is set up (refused before any quote). */
  | "owner-unset"
  /** The card refused this phone's owner proof and no PIN was given (`6A91`). */
  | "not-owner"
  /**
   * A top-up saved for a 0.x card (`cardFormat` 0): its pieces are locked to
   * that card's key with SIG_INPUTS, and no 2.0 card can hold them. Kept
   * untouched, never minted, loaded or re-signed: an operator sweeps it.
   */
  | "needs-update"

/**
 * The format of the pieces a top-up's outputs become: 4, the 2.0 card's
 * SIG_ALL pieces (`buildCardP2PKSecret`), for every record this app saves now;
 * 0 for a record saved before card protocol 2.0 (store format 1), whose
 * SIG_INPUTS pieces only a 0.x card could hold (`needs-update`).
 */
export type CardFormat = 0 | 4

export type TopUpRecord = {
  version: 2
  /** See `CardFormat`. */
  cardFormat: CardFormat
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
     * The phone's clock, in ms, just before this quote was asked for. The
     * mint's invoice is never older than the time since, so the pay window
     * counts from this (`pastPayWindow` in the engine): the time the quote
     * took to arrive counts against paying it.
     */
    requestedAt: number
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
   * the mint about each proof the inventory does not find: a slot can be
   * spent and cleared since, by the load tap's own reclaim once the mint
   * settled it (`reclaimSpentSlots`), or by another tool.
   */
  loadStarted: boolean
  state: TopUpState
  createdAt: number
  updatedAt: number
}

/**
 * Where a card tidy (ENG-702) stands. Each state is saved before the next
 * outside effect, as a top-up's are:
 *
 * - `planned`: the inputs and the change's amounts are saved, before
 *   SPEND_ALL_BEGIN. Once the change's blinded messages are saved (`outputs`
 *   with `B_`) the card may sign at any moment: whether it did is the card's
 *   to say (its slots, SPEND_ALL_AGAIN), and nothing else can tell.
 * - `signed`: the card signed (and burned the inputs). The mint owes
 *   signatures on the change, for the saved witness.
 * - `swapped`: the mint signed the change (`signatures`). Some or none of
 *   the pieces are back on the card yet.
 * - `loaded`: every piece is on the card. Dropped from the store.
 * - `abandoned`: nothing was burned (every input still unspent on the card
 *   and at the mint). Dropped from the store.
 * - `needs-card`: the card burned the inputs and its signature is lost: it
 *   has signed another payment since, and gives only its last one again.
 *   Kept for a human, never dropped.
 */
export type TidyState =
  | "planned"
  | "signed"
  | "swapped"
  | "loaded"
  | "abandoned"
  | "needs-card"

/** A piece a tidy burns, as the card held it. */
export type TidyInput = {
  slot: number
  nonce: string
  C: string
  amount: number
}

/** One piece of the card's own change: its amount, and its blinded message once the card made it. */
export type TidyOutput = {
  amount: number
  /** SPEND_ALL_CHANGE's answer, 66 hex chars: what the mint signs, and the NUT-09 restore key. */
  B_?: string
}

/** A change opening GET_CHANGE gave, matched to its output by its blinded message. */
export type TidyOpening = {
  nonce: string
  /** The blinding factor, 64 hex chars. */
  r: string
  B_: string
}

export type TidyRecord = {
  kind: "tidy"
  version: 1
  id: string
  cardPubkey: string
  mintUrl: string
  /** Every input's keyset and the change's: one keyset, as the card makes its change in. */
  keysetId: string
  /** The mint's NUT-02 input fee: the inputs less the change. */
  fee: number
  /** The pieces named to SPEND_ALL_BEGIN, in that order. */
  inputs: TidyInput[]
  /** The change, in the order it went to SPEND_ALL_CHANGE. */
  outputs: TidyOutput[]
  /** The card's SIG_ALL signature over inputs and outputs, hex: the swap's witness. */
  signature?: string
  /** One per output, in the outputs' order, once GET_CHANGE has given them. */
  openings?: TidyOpening[]
  /** The mint's blind signatures on the outputs, in their order, once swapped. */
  signatures?: { C_: string; e: string; s: string }[]
  /** Set once unblinded and checked: what each LOAD_PROOF writes. */
  proofs?: CardSlotProof[]
  /** Set before the first LOAD_PROOF, as a top-up's is. */
  loadStarted: boolean
  state: TidyState
  createdAt: number
  updatedAt: number
}
