import {
  Amount,
  OutputData,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  getPubKeyFromPrivKey,
  hasValidDleq,
  hashToCurve,
  signMintQuote,
} from "@cashu/cashu-ts"

import {
  CardInfo,
  Transceiver,
  getProof,
  getSlotStatuses,
  loadProof,
  toHex,
} from "../cashu-card"
import {
  buildCardP2PKSecret,
  cardSlotFromProof,
  makeCanonicalCardOutput,
  randomBytes,
  splitPow2,
} from "../cashu-card-outputs"
import type { ProofState, TopUpMint } from "./mint"
import type { TopUpStore } from "./store"
import type { CardUnit, TopUpOutput, TopUpRecord } from "./types"

/**
 * A card top-up, minted by the app at the mint it is connected to (ENG-616
 * D2): quote → pay the invoice from the user's wallet → mint outputs locked to
 * the card → LOAD_PROOF. No Flash backend call mints anything.
 *
 * Every step saves the record before its outside effect, so an interruption
 * anywhere resumes instead of repeating:
 * - the quote and the blinding data are saved before the invoice is paid;
 * - the mint's own quote state, not the wallet's answer, decides whether the
 *   invoice was paid, and a record that was ever sent for payment is dropped
 *   only once the mint still holds it unpaid well after it expired;
 * - a paid quote is minted as soon as the mint says so, card or no card
 *   (`advanceTopUps`): the mint issues a paid quote only until its expiry;
 * - a mint call whose answer was lost is recovered with NUT-09, never by
 *   minting again;
 * - the proofs are saved, DLEQ-checked, before anything is written to the
 *   card, and a resumed load reads the card's inventory and asks the mint
 *   (NUT-07) before it writes, because the card itself accepts the same
 *   proof twice and cannot tell a proof the mint has already paid out;
 * - spent slots are never cleared: a spent slot is owed until it settles.
 */

/** forge's NUT-04 limit per quote, for both units. The mint enforces it too. */
export const MAX_TOPUP_AMOUNT = 1_000_000

/**
 * A payment is sent only while this much of its quote's life is left. The
 * mint issues a paid quote only until the quote's `expiry` (Nutshell 0.20.3
 * mint(): "quote expired"), and with MINT_QUOTE_TTL unset that is the
 * invoice's own expiry: phoenixd's for sat, five minutes for a Flash USD
 * invoice. A payment sent later could land with no time left to mint it. A
 * quote never sent for payment is quoted again instead.
 */
export const PAY_WINDOW_MS = 2 * 60_000

/**
 * How long past its `expiry` a quote the mint still holds unpaid is kept
 * before it is dropped. The expiry is on the mint's clock (the invoice's);
 * this covers a phone clock running ahead of it while a payment in flight can
 * still be accepted.
 */
export const EXPIRY_GRACE_MS = 10 * 60_000

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

export class TopUpError extends Error {
  constructor(readonly reason: TopUpFailure, message: string) {
    super(message)
    this.name = "TopUpError"
  }
}

/**
 * Failures that asking again will not change: a bad or missing signature, a
 * paid quote the mint no longer issues, a record in the wrong state. The
 * card-free pass stops asking about them; the screen still offers a retry.
 */
const FINAL_FAILURES: readonly TopUpFailure[] = [
  "state",
  "not-found",
  "restore",
  "dleq",
  "mint-mismatch",
  "expired",
]
const isFinal = (err: unknown) =>
  err instanceof TopUpError && FINAL_FAILURES.includes(err.reason)

/** What the wallet said about the payment. */
export type PayOutcome =
  /** SUCCESS or ALREADY_PAID. */
  | { kind: "paid" }
  /** PENDING: the mint's quote turns PAID when it settles. */
  | { kind: "pending" }
  /**
   * The wallet refused the payment before it executed, or IBEX reported it
   * failed: nothing left the wallet. Only an answer that proves it may read
   * as this (see the wallet's `pay`); anything else is `unknown`.
   */
  | { kind: "failed"; message?: string }
  /** The dispatch may or may not have executed (a lost answer, a busy key). */
  | { kind: "unknown"; message?: string }

export type PayArgs = {
  walletId: string
  paymentRequest: string
  /** Always sent: a top-up is never paid without its key. */
  idempotencyKey: string
  /** An earlier dispatch under this same key went out; its outcome is unknown. */
  isRetry: boolean
}

export type TopUpDeps = {
  mint: TopUpMint
  store: TopUpStore
  pay: (args: PayArgs) => Promise<PayOutcome>
  now: () => number
  newId: () => string
}

/** What the steps that need neither the wallet nor the card use. */
export type CardFreeDeps = Pick<TopUpDeps, "mint" | "store" | "now">

const toSaved = (output: OutputData): TopUpOutput => ({
  amount: Amount.from(output.blindedMessage.amount).toNumber(),
  secret: new TextDecoder().decode(output.secret),
  r: output.blindingFactor.toString(16).padStart(64, "0"),
  B_: output.blindedMessage.B_,
})

const fromSaved = (saved: TopUpOutput, keysetId: string): OutputData =>
  new OutputData(
    { id: keysetId, amount: Amount.from(saved.amount), B_: saved.B_ },
    BigInt(`0x${saved.r}`),
    new TextEncoder().encode(saved.secret),
  )

const load = async (deps: Pick<TopUpDeps, "store">, id: string): Promise<TopUpRecord> => {
  const record = await deps.store.get(id)
  if (!record) throw new TopUpError("not-found", `top-up ${id} is not saved`)
  return record
}

const expiryMs = (record: TopUpRecord): number | undefined =>
  record.quote.expiry === null ? undefined : record.quote.expiry * 1000

/** Too little of the quote's life is left to send a payment for it. */
const pastPayWindow = (record: TopUpRecord, now: number): boolean => {
  const expiry = expiryMs(record)
  return expiry !== undefined && now > expiry - PAY_WINDOW_MS
}

/** The mint would refuse to issue the quote now, paid or not. */
const pastExpiry = (record: TopUpRecord, now: number): boolean => {
  const expiry = expiryMs(record)
  return expiry !== undefined && now > expiry
}

/**
 * The quote's invoice can no longer be paid, even on a phone clock running
 * ahead of the mint's. A quote with no expiry never dies.
 */
export const quoteIsDead = (record: TopUpRecord, now: number): boolean => {
  const expiry = expiryMs(record)
  return expiry !== undefined && now > expiry + EXPIRY_GRACE_MS
}

/**
 * A payment of this record went out at some point (`everDispatched`; a
 * record whose retry flag is up was sent too, whatever else it says).
 */
const everSent = (record: TopUpRecord): boolean =>
  record.payment.everDispatched || record.payment.dispatched

/** The slots a top-up of `amount` takes: one per power of two in it. */
export const slotsNeeded = (amount: number): number => splitPow2(amount).length

/**
 * Whether a saved top-up holds a claim on its card: anything paid, or whose
 * payment may be out right now. A quote whose last dispatch was provably
 * refused, or that was never sent, holds none: no payment of it is out.
 */
const holdsCard = (record: TopUpRecord): boolean =>
  record.state !== "loaded" && (record.state !== "quoted" || record.payment.dispatched)

/**
 * What a card's unfinished top-ups already hold of it: the empty slots their
 * proofs will take (all of them, even for a load cut part way), and their
 * units. A new top-up is sized against what is left, and may only be in the
 * unit they are in (ENG-616 D1: a card never holds two units).
 */
export const cardCommitments = (
  records: TopUpRecord[],
  cardPubkey: string,
): { slots: number; units: CardUnit[] } => {
  const pubkey = cardPubkey.toLowerCase()
  const holding = records.filter((r) => r.cardPubkey === pubkey && holdsCard(r))
  return {
    slots: holding.reduce((sum, r) => sum + r.outputs.length, 0),
    units: [...new Set(holding.map((r) => r.unit))],
  }
}

export type PrepareArgs = {
  cardPubkey: string
  unit: CardUnit
  amount: number
  walletId: string
  /**
   * The card as last read: its empty slots, and the unit of the value it
   * holds (none when it is empty). Spent slots are not room: a spent slot is
   * owed until it settles at the mint (cashu-javacard spec/CARD-FILE.md, "Why
   * `spent` is required"), and this app never clears one.
   */
  card: Pick<CardInfo, "empty"> & { unit?: CardUnit }
}

/**
 * A NUT-04 quote locked (NUT-20) to a fresh key only this app holds, checked
 * to be the quote that was asked for.
 */
const lockedQuote = async (
  deps: Pick<TopUpDeps, "mint">,
  unit: CardUnit,
  amount: number,
): Promise<Pick<TopUpRecord, "quote" | "lockKey">> => {
  const lockKey = randomBytes(32)
  const lockPubkey = toHex(getPubKeyFromPrivKey(lockKey))
  const quote = await deps.mint.createQuote({ unit, amount, pubkey: lockPubkey })
  if (
    quote.unit !== unit ||
    quote.amount !== amount ||
    quote.state !== "UNPAID" ||
    (quote.pubkey !== undefined && quote.pubkey !== lockPubkey)
  ) {
    throw new TopUpError("quote", "the mint quoted something other than what was asked")
  }
  return {
    quote: { id: quote.quote, request: quote.request, expiry: quote.expiry },
    lockKey: toHex(lockKey),
  }
}

/**
 * Quote the top-up and build its outputs, and save both before anything is
 * paid. Nothing here moves money: an interruption before the save leaves an
 * unpaid quote at the mint and nothing else.
 */
export async function prepareTopUp(
  deps: TopUpDeps,
  args: PrepareArgs,
): Promise<TopUpRecord> {
  const { amount, unit } = args
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_TOPUP_AMOUNT) {
    throw new TopUpError("amount", `a top-up is 1 to ${MAX_TOPUP_AMOUNT}, got ${amount}`)
  }
  const cardPubkey = args.cardPubkey.toLowerCase()
  const committed = cardCommitments(await deps.store.list(), cardPubkey)
  const units = [...committed.units, ...(args.card.unit ? [args.card.unit] : [])]
  if (units.some((held) => held !== unit)) {
    throw new TopUpError(
      "unit",
      `the card holds, or is being topped up in, ${units.join(", ")}: not ${unit}`,
    )
  }
  const pieces = splitPow2(amount)
  const room = args.card.empty - committed.slots
  if (pieces.length > room) {
    throw new TopUpError(
      "slots",
      `the top-up needs ${pieces.length} slots and the card has ${Math.max(
        room,
        0,
      )} free`,
    )
  }
  const keyset = await deps.mint.activeKeyset(unit)
  const outputs = pieces.map((piece) =>
    makeCanonicalCardOutput(piece, keyset.id, cardPubkey),
  )
  const { quote, lockKey } = await lockedQuote(deps, unit, amount)
  const at = deps.now()
  return deps.store.put({
    version: 1,
    id: deps.newId(),
    cardPubkey,
    mintUrl: deps.mint.url,
    unit,
    amount,
    keysetId: keyset.id,
    quote,
    lockKey,
    outputs: outputs.map(toSaved),
    payment: {
      walletId: args.walletId,
      idempotencyKey: deps.newId(),
      dispatched: false,
      everDispatched: false,
    },
    loadStarted: false,
    state: "quoted",
    createdAt: at,
    updatedAt: at,
  })
}

/**
 * A new quote for a record whose quote has too little life left and was never
 * sent for payment (so nothing can pay the old one). The saved outputs are
 * kept: the old quote is never minted, so nothing else signs them.
 */
const requote = async (deps: TopUpDeps, record: TopUpRecord): Promise<TopUpRecord> => {
  const fresh = await lockedQuote(deps, record.unit, record.amount)
  return deps.store.update(record.id, (r) => {
    if (r.state !== "quoted" || everSent(r) || r.quote.id !== record.quote.id) {
      throw new TopUpError("state", "the top-up changed while it was quoted again")
    }
    return {
      ...r,
      ...fresh,
      // A new invoice is a new payment.
      payment: { ...r.payment, idempotencyKey: deps.newId() },
    }
  })
}

export type PayResult =
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; message?: string }
  | { status: "unknown"; message?: string }
  /**
   * Not sent: the quote has too little life left to be paid and minted, and
   * an earlier dispatch rules out quoting again. The record stays until the
   * mint says whether that dispatch landed.
   */
  | { status: "expired" }

/**
 * Pay the quote's invoice from the record's wallet. The mint is asked first:
 * an invoice it already holds as paid is never paid again, whatever the
 * wallet said last time. A quote near its expiry is never paid: a first
 * payment gets a new quote, a retry is refused.
 */
export async function payTopUp(
  deps: TopUpDeps,
  id: string,
): Promise<{ record: TopUpRecord; result: PayResult }> {
  let record = await load(deps, id)
  if (record.state !== "quoted") return { record, result: { status: "paid" } }

  if ((await deps.mint.quoteState(record.quote.id)) !== "UNPAID") {
    record = await deps.store.update(id, (r) =>
      r.state === "quoted" ? { ...r, state: "paid" } : r,
    )
    return { record, result: { status: "paid" } }
  }

  if (pastPayWindow(record, deps.now())) {
    if (everSent(record)) return { record, result: { status: "expired" } }
    record = await requote(deps, record)
  }

  const isRetry = record.payment.dispatched
  if (!isRetry) {
    record = await deps.store.update(id, (r) => ({
      ...r,
      payment: { ...r.payment, dispatched: true, everDispatched: true },
    }))
  }

  let outcome: PayOutcome
  try {
    outcome = await deps.pay({
      walletId: record.payment.walletId,
      paymentRequest: record.quote.request,
      idempotencyKey: record.payment.idempotencyKey,
      isRetry,
    })
  } catch (err) {
    // A thrown dispatch may still have executed: the next attempt asks the
    // mint first and retries with the same key.
    return {
      record,
      result: {
        status: "unknown",
        message: err instanceof Error ? err.message : undefined,
      },
    }
  }

  switch (outcome.kind) {
    case "paid":
      record = await deps.store.update(id, (r) =>
        r.state === "quoted" ? { ...r, state: "paid" } : r,
      )
      return { record, result: { status: "paid" } }
    case "pending":
      return { record, result: { status: "pending" } }
    case "unknown":
      return { record, result: { status: "unknown", message: outcome.message } }
    case "failed":
      if (isRetry) {
        // This dispatch was refused, and says nothing about the earlier one
        // whose answer was lost: it may still land. The server's contract is
        // that such an answer is retried under the SAME key (flash
        // src/app/payments/idempotency.ts), so this stays a retry of it.
        return { record, result: { status: "unknown", message: outcome.message } }
      }
      // The only dispatch under this key was refused: nothing is out. A
      // fresh key for the next attempt (the server replays a cached failure
      // to the old one). `everDispatched` stays: see `cancelTopUp`.
      record = await deps.store.update(id, (r) => ({
        ...r,
        payment: { ...r.payment, idempotencyKey: deps.newId(), dispatched: false },
      }))
      return { record, result: { status: "failed", message: outcome.message } }
  }
}

const restoreSignatures = async (
  deps: Pick<TopUpDeps, "mint">,
  messages: SerializedBlindedMessage[],
): Promise<SerializedBlindedSignature[]> => {
  const restored = await deps.mint.restore(messages)
  return messages.map((message) => {
    const index = restored.outputs.findIndex((output) => output.B_ === message.B_)
    if (index < 0 || !restored.signatures[index]) {
      throw new TopUpError("restore", "the mint returned no signature for an output")
    }
    return restored.signatures[index]
  })
}

type MintResult = { record: TopUpRecord; status: "minted" | "waiting" }

const mintOnce = async (deps: CardFreeDeps, id: string): Promise<MintResult> => {
  const record = await load(deps, id)
  if (record.state === "minted" || record.state === "loaded") {
    return { record, status: "minted" }
  }
  const quoteState = await deps.mint.quoteState(record.quote.id)
  // UNPAID: the payment has not reached the mint. PENDING: a mint call for
  // this quote is running right now, and ends ISSUED or PAID again.
  if (quoteState === "UNPAID" || quoteState === "PENDING") {
    return { record, status: "waiting" }
  }

  const outputs = record.outputs.map((saved) => fromSaved(saved, record.keysetId))
  const messages = outputs.map((output) => output.blindedMessage)
  let signatures: SerializedBlindedSignature[]
  if (quoteState === "PAID") {
    if (!record.lockKey) {
      throw new TopUpError("state", "the quote's lock key is missing")
    }
    try {
      signatures = await deps.mint.mint({
        quote: record.quote.id,
        outputs: messages,
        signature: signMintQuote(record.lockKey, record.quote.id, messages),
      })
    } catch (err) {
      // A mint call whose answer was lost leaves the quote ISSUED: the
      // signatures come back through NUT-09, not through a second mint.
      const after = await deps.mint.quoteState(record.quote.id)
      if (after === "PENDING") return { record, status: "waiting" }
      if (after !== "ISSUED") {
        // Nutshell refuses to mint a paid quote once its expiry has passed,
        // and will keep refusing: the value is at the mint, out of reach.
        if (after === "PAID" && pastExpiry(record, deps.now())) {
          throw new TopUpError(
            "expired",
            "the mint no longer issues this paid quote: its expiry has passed",
          )
        }
        throw err
      }
      signatures = await restoreSignatures(deps, messages)
    }
  } else {
    signatures = await restoreSignatures(deps, messages)
  }

  const keyset = await deps.mint.keyset(record.keysetId)
  let proofs: Proof[]
  try {
    // toProof itself refuses a DLEQ proof that is present and wrong.
    proofs = outputs.map((output, i) => output.toProof(signatures[i], keyset))
  } catch (err) {
    throw new TopUpError(
      "dleq",
      `the mint's signature failed verification: ${
        err instanceof Error ? err.message : err
      }`,
    )
  }
  // And a signature that carries no DLEQ proof at all is refused here.
  if (!proofs.every((proof) => hasValidDleq(proof, keyset, { require: true }))) {
    throw new TopUpError("dleq", "a signature came without a valid DLEQ proof")
  }
  const slots = proofs.map((proof) => cardSlotFromProof(proof, record.cardPubkey))
  const total = slots.reduce((sum, slot) => sum + slot.amount, 0)
  if (
    total !== record.amount ||
    slots.some((slot) => slot.keysetId !== record.keysetId)
  ) {
    throw new TopUpError(
      "mint-mismatch",
      "the mint signed something other than what was paid",
    )
  }
  const saved = await deps.store.update(id, (r) => ({
    ...r,
    proofs: slots,
    // Nothing else can be minted from the quote now.
    lockKey: undefined,
    state: "minted",
  }))
  return { record: saved, status: "minted" }
}

// One mint of a top-up at a time in this app: the screen and the card-free
// pass can both reach for the same record.
const minting = new Map<string, Promise<MintResult>>()

/**
 * Get the mint's signatures on the saved outputs and turn them into card
 * proofs. `waiting` while the mint has not seen the payment. Every proof is
 * DLEQ-checked against the mint's published key and checked to rebuild on
 * this card before it is saved; nothing that fails either check is kept.
 * Needs no card: run it as soon as the mint may say PAID.
 */
export function mintTopUp(deps: CardFreeDeps, id: string): Promise<MintResult> {
  const running = minting.get(id)
  if (running) return running
  const run = mintOnce(deps, id).finally(() => minting.delete(id))
  minting.set(id, run)
  return run
}

/** One record's card-free step. Resolves whether a payment for it may still land. */
const advanceOne = async (deps: CardFreeDeps, record: TopUpRecord): Promise<boolean> => {
  try {
    if (record.state === "quoted") {
      const state = await deps.mint.quoteState(record.quote.id)
      if (state === "UNPAID") {
        // Watched closely only while a payment of it may be out right now; a
        // quote whose last dispatch was refused is still checked on every
        // pass, in case that answer was wrong.
        if (!quoteIsDead(record, deps.now())) return record.payment.dispatched
        await deps.store.removeIf(
          record.id,
          (r) => r.state === "quoted" && r.quote.id === record.quote.id,
        )
        return false
      }
    }
    const { status } = await mintTopUp(deps, record.id)
    return status === "waiting" && !quoteIsDead(record, deps.now())
  } catch (err) {
    // A refusal the mint will repeat waits for the user; anything else is
    // asked again while the quote can still be minted.
    return !isFinal(err) && !quoteIsDead(record, deps.now())
  }
}

/**
 * Move every saved top-up forward that needs no card, and drop the quotes
 * nobody can pay any more. Run on launch, on foreground, while a payment may
 * still land, and when the card screen is focused:
 * - a paid top-up (or a sent quote the mint now holds as paid) is minted at
 *   once, so its proofs are saved while the mint still issues the quote;
 * - a quote the mint still holds unpaid past its expiry and
 *   `EXPIRY_GRACE_MS` is dropped, lock key and all: nothing can pay it now.
 * Minted and loaded top-ups need the card and are left alone. A mint that
 * cannot be reached is asked again on the next pass.
 *
 * Resolves how many top-ups are still waiting on a payment that may land,
 * so the caller knows whether to ask again.
 */
export async function advanceTopUps(deps: CardFreeDeps): Promise<{ waiting: number }> {
  const records = (await deps.store.list()).filter(
    (record) => record.state === "quoted" || record.state === "paid",
  )
  let waiting = 0
  // One record at a time, gently: forge rate-limits its API per IP.
  for (const record of records) {
    if (await advanceOne(deps, record)) waiting += 1
  }
  return { waiting }
}

/** Y = hash_to_curve(secret): how the mint knows a proof (NUT-00, NUT-07). */
const proofY = (nonce: string, cardPubkey: string): string =>
  toHex(
    hashToCurve(new TextEncoder().encode(buildCardP2PKSecret(nonce, cardPubkey))).toBytes(
      true,
    ),
  )

/**
 * Before a resumed load's tap: the mint's NUT-07 state of each of the
 * top-up's proofs, by nonce, asked here so the card session never waits on
 * the network. Undefined for a first load: none of its proofs can be on a
 * card, or spent, yet.
 */
export async function proofStatesForLoad(
  deps: Pick<TopUpDeps, "mint" | "store">,
  id: string,
): Promise<Map<string, ProofState> | undefined> {
  const record = await load(deps, id)
  const { proofs } = record
  if (record.state !== "minted" || !record.loadStarted || !proofs) return undefined
  const states = await deps.mint.proofStates(
    proofs.map((proof) => proofY(proof.nonce, record.cardPubkey)),
  )
  return new Map(proofs.map((proof, i) => [proof.nonce, states[i]]))
}

/**
 * Write the minted proofs onto the card, inside one card session whose PIN
 * (if the card has one) the caller has already verified.
 *
 * The first load saves `loadStarted` before its first LOAD_PROOF. Any later
 * load reads every occupied slot first and skips proofs already there, spent
 * or not: a LOAD_PROOF can land on the card and its answer be lost, and the
 * card takes the same proof twice. A proof the inventory does not find was
 * either never written, or written, spent and its slot cleared since, which
 * only the mint can tell apart (`mintStates`): only an UNSPENT one is
 * written, a SPENT one never is, and a PENDING one (being spent right now)
 * waits for a later load, the record staying unfinished.
 *
 * Only empty slots are written to. Spent slots are never cleared: a spent
 * slot is owed until it settles at the mint (cashu-javacard
 * spec/CARD-FILE.md), and a burn whose signature never left the card can be
 * recovered only from its slot (flash-pos `hasUnsettledForCard`). A card
 * without the empty slots is refused before anything is written.
 */
export type LoadArgs = {
  id: string
  /** An open card session; VERIFY_PIN already done when the card has a PIN. */
  transceive: Transceiver
  card: Pick<CardInfo, "maxSlots">
  /** Required for a resumed load: `proofStatesForLoad`, asked before the tap. */
  mintStates?: ReadonlyMap<string, ProofState>
}

export async function loadTopUp(
  deps: Pick<TopUpDeps, "store">,
  { id, transceive, card, mintStates }: LoadArgs,
): Promise<TopUpRecord> {
  const record = await load(deps, id)
  if (record.state === "loaded") return record
  const { proofs } = record
  if (record.state !== "minted" || !proofs) {
    throw new TopUpError("state", "the top-up has no proofs to load yet")
  }
  if (record.loadStarted && !mintStates) {
    throw new TopUpError("state", "a resumed load needs the mint's word on each proof")
  }
  const statuses = await getSlotStatuses(transceive, card.maxSlots)
  let pending = proofs
  let held = 0
  if (record.loadStarted && mintStates) {
    const onCard = new Set<string>()
    for (let slot = 0; slot < statuses.length; slot += 1) {
      if (statuses[slot] !== "empty") onCard.add((await getProof(transceive, slot)).nonce)
    }
    const missing = proofs.filter((proof) => !onCard.has(proof.nonce))
    const stateOf = (nonce: string): ProofState => {
      const state = mintStates.get(nonce)
      if (!state) throw new TopUpError("state", "the mint's word on a proof is missing")
      return state
    }
    pending = missing.filter((proof) => stateOf(proof.nonce) === "UNSPENT")
    held = missing.filter((proof) => stateOf(proof.nonce) === "PENDING").length
  }

  const empty = statuses.filter((status) => status === "empty").length
  if (empty < pending.length) {
    throw new TopUpError(
      "slots",
      `${pending.length} proofs to load and ${empty} empty slots on the card`,
    )
  }
  if (!record.loadStarted) {
    await deps.store.update(id, (r) => ({ ...r, loadStarted: true }))
  }
  for (const proof of pending) await loadProof(transceive, proof)
  if (held > 0) return load(deps, id)
  return deps.store.update(id, (r) => ({ ...r, state: "loaded" }))
}

/**
 * Drop a top-up that can no longer take money: one never sent for payment,
 * or one whose invoice the mint still holds as unpaid well after it expired
 * (`quoteIsDead`). Anything else may be paid, or may still become paid,
 * even when the wallet's answer read as a refusal, and stays.
 */
export async function cancelTopUp(deps: CardFreeDeps, id: string): Promise<void> {
  const record = await load(deps, id)
  if (record.state !== "quoted") {
    throw new TopUpError("state", "a paid top-up cannot be cancelled")
  }
  if (everSent(record)) {
    if (
      !quoteIsDead(record, deps.now()) ||
      (await deps.mint.quoteState(record.quote.id)) !== "UNPAID"
    ) {
      throw new TopUpError("state", "this payment may still land")
    }
  }
  const removed = await deps.store.removeIf(
    id,
    (r) =>
      r.state === "quoted" &&
      r.quote.id === record.quote.id &&
      everSent(r) === everSent(record),
  )
  if (!removed) throw new TopUpError("state", "the top-up changed before it was dropped")
}

/** A card's top-ups that still need a payment, a mint or a tap. */
export const unfinishedTopUps = async (
  deps: Pick<TopUpDeps, "store">,
  cardPubkey: string,
): Promise<TopUpRecord[]> =>
  (await deps.store.list())
    .filter(
      (record) =>
        record.cardPubkey === cardPubkey.toLowerCase() && record.state !== "loaded",
    )
    .sort((a, b) => a.createdAt - b.createdAt)
