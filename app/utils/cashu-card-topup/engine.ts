import {
  Amount,
  MintOperationError,
  OutputData,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  getPubKeyFromPrivKey,
  hasValidDleq,
  hashToCurve,
  isMintOperationError,
  signMintQuote,
} from "@cashu/cashu-ts"
import { Network as NetworkLibGaloy, decodeInvoiceString } from "@galoymoney/client"

import { networkForPaymentRequest } from "../../screens/send-bitcoin-screen/invoice-expiry"
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
import type { CardUnit, TopUpFailure, TopUpOutput, TopUpRecord } from "./types"

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
 * - how old a quote is comes from the phone's clock read against itself (the
 *   time since the quote arrived), never from the phone's clock read against
 *   the mint's (`quoteAge`), so a phone running fast or slow neither drops a
 *   payment in flight nor pays late;
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
 * A payment is sent only while enough of its quote's life is left for it to
 * be paid and minted (`payWindowMs`). The mint issues a paid quote only until
 * the quote's `expiry` (Nutshell mint(): "quote expired"), and with
 * MINT_QUOTE_TTL unset that is the invoice's own expiry: phoenixd's for a sat
 * quote, and 60 s for a usd one. Forge's usd invoice is a Flash invoice, and
 * IBEX caps every non-sat receive invoice at 60 s (flash
 * src/domain/bitcoin/lightning/invoice-expiration.ts and
 * src/services/ibex/client.ts; the ENG-555 invoice in the send flow's
 * invoice-expiry.ts is one). A sat payment crosses Lightning to phoenixd. A
 * usd one has no Lightning hop, but it is still two IBEX calls before the
 * quote can be minted, and flash's IBEX client sets no timeout on either: the
 * payment itself (lnInvoicePaymentSend pays through IBEX), then the mint's
 * check of the invoice (Flash's lnInvoicePaymentStatus asks IBEX). So the
 * window is a quarter of the quote's life, at most this and at least
 * MIN_PAY_WINDOW_MS: two minutes for a sat quote, and 40 s for a usd one,
 * which is paid only in its first 20 s. A payment sent later could land with
 * no time left to mint it. A quote never sent for payment is quoted again
 * instead. Counted from before the quote was asked for (`pastPayWindow`).
 */
export const PAY_WINDOW_MS = 2 * 60_000

/** The least time a quote must have left to be paid: see PAY_WINDOW_MS. */
export const MIN_PAY_WINDOW_MS = 40_000

/** How much of a quote's life must be left to pay it, for a quote living `lifeMs`. */
export const payWindowMs = (lifeMs: number): number =>
  Math.max(MIN_PAY_WINDOW_MS, Math.min(PAY_WINDOW_MS, lifeMs / 4))

/**
 * How long past the end of its life a quote the mint still holds unpaid is
 * kept before it is dropped: a payment sent just before the invoice expired
 * can reach the mint after it. Both of `quoteIsDead`'s readings must be this
 * far past the quote's life.
 */
export const EXPIRY_GRACE_MS = 10 * 60_000

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
const isFinal = (err: unknown): err is TopUpError =>
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
   *
   * `definitive`: IBEX's own verdict that the payment under this key ran and
   * failed. The server caches it under the key and replays it to every retry
   * (flash src/app/payments/idempotency.ts), so the key can never pay, and a
   * retry answered this way retires it too. A refusal made before anything
   * ran is not cached, and on a retry says nothing about the dispatch before.
   */
  | { kind: "failed"; message?: string; definitive?: boolean }
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

/*
 * How old a quote is. The quote's `expiry` is on the mint's clock, and a
 * phone's clock can be minutes or hours from it, either way. Read against
 * the phone's clock, a fresh quote on a phone two hours fast looks long dead,
 * and on a phone half an hour slow a quote about to expire looks half an hour
 * younger. So the engine judges a quote by its age on the phone's own clock:
 * the time since the quote arrived (`quoteAge`), against the quote's life as
 * the mint states it (`lifeMs`). The mint issued the invoice before the quote
 * arrived, so the age never overstates, whatever the offset, as long as the
 * clock does not move between the two readings (the send flow's
 * `isInvoiceExpired` reasons the same way). The mint's `expiry` read on the
 * phone's clock (`pastMintExpiry`) decides nothing alone; it only holds back
 * a verdict the age alone must not give, as `isInvoiceExpired` does. The pay
 * window, whose harmful verdict is "there is time", counts from just before
 * the quote was asked for instead (`requestedAt`): the invoice is never older
 * than that, so the time the quote took to arrive counts against paying it.
 */

/** The time since the record's quote arrived, in ms, on the phone's clock alone. */
const quoteAge = (record: TopUpRecord, now: number): number => now - record.quote.quotedAt

/**
 * The phone's clock past the mint's `expiry` and `marginMs`. Right only while
 * the phone's clock agrees with the mint's. It holds back a verdict the age
 * alone would give after a clock correction: a phone slow when the quote
 * arrived and set right since reads the quote as older than it is.
 */
const pastMintExpiry = (record: TopUpRecord, now: number, marginMs: number): boolean =>
  record.quote.expiry !== null && now > record.quote.expiry * 1000 + marginMs

/**
 * Too little of the quote's life is left to send a payment for it: judged by
 * the time since the quote was asked for alone, which the invoice's age never
 * exceeds. Here the harmful verdict is "there is time", so the mint's
 * `expiry` read on the phone's clock may neither hold this back (a phone
 * running slow would pay late) nor fire it alone (a phone running fast could
 * never pay). A clock that went back since the quote was asked for hides how
 * old the quote is, so such a quote is not paid either.
 */
const pastPayWindow = (record: TopUpRecord, now: number): boolean => {
  const { lifeMs, requestedAt } = record.quote
  if (lifeMs === null) return false
  const age = now - requestedAt
  return !(age >= 0 && age <= lifeMs - payWindowMs(lifeMs))
}

/**
 * The quote's expiry has passed, so the mint refuses to issue it now, paid or
 * not: read from the clocks, for a mint call that got no answer. A refusal
 * the mint gave decides alone (`refusedAsExpired`). The harmful verdict is
 * yes (the top-up stops being minted), so both readings must agree, as in
 * `quoteIsDead`.
 */
const quoteExpired = (record: TopUpRecord, now: number): boolean =>
  record.quote.lifeMs !== null &&
  quoteAge(record, now) > record.quote.lifeMs &&
  pastMintExpiry(record, now, 0)

/** NUT error code 20007: "Quote is expired". */
const QUOTE_EXPIRED_CODE = 20007

/**
 * The mint's own refusal to issue a paid quote past its expiry, which it will
 * repeat, whatever either clock reads. Nutshell main raises it as
 * QuoteExpiredError, code 20007; 0.20.3 raised a TransactionError with the
 * same "quote expired" detail and code 11000 (cashu/mint/ledger.py mint() at
 * either). Both are read as this, whichever one forge's private 0.20.3.1
 * build carries.
 */
const refusedAsExpired = (err: MintOperationError): boolean =>
  err.code === QUOTE_EXPIRED_CODE || /quote (is )?expired/i.test(err.message)

/**
 * Nothing can pay the quote's invoice any more, not even a payment sent just
 * before it expired. A record is dropped on this, so both readings must
 * agree: the quote's age past its life and the grace, and the phone's clock
 * past the mint's `expiry` and the grace. A phone running fast or slow is
 * judged by the age; a slow one drops the quote only once its own clock
 * passes the expiry too. A quote with no expiry never dies.
 */
export const quoteIsDead = (record: TopUpRecord, now: number): boolean =>
  record.quote.lifeMs !== null &&
  quoteAge(record, now) > record.quote.lifeMs + EXPIRY_GRACE_MS &&
  pastMintExpiry(record, now, EXPIRY_GRACE_MS)

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
 * How long a quote lives, in ms: from its invoice's bolt11 timestamp to the
 * quote's `expiry`, both from the mint's side. Undefined when the invoice
 * cannot be read, or states no issue time before the expiry.
 */
const quoteLifeMs = (request: string, expiry: number): number | undefined => {
  const network = networkForPaymentRequest(request)
  if (!network) return undefined
  try {
    const { timestamp } = decodeInvoiceString(request, network as NetworkLibGaloy)
    if (typeof timestamp !== "number" || !(timestamp < expiry)) return undefined
    return (expiry - timestamp) * 1000
  } catch {
    return undefined
  }
}

/**
 * A NUT-04 quote locked (NUT-20) to a fresh key only this app holds, checked
 * to be the quote that was asked for, with the phone's clock just before it
 * was asked for and at its arrival, and its life, so its age can be told
 * later (`pastPayWindow`, `quoteAge`).
 */
const lockedQuote = async (
  deps: Pick<TopUpDeps, "mint" | "now">,
  unit: CardUnit,
  amount: number,
): Promise<Pick<TopUpRecord, "quote" | "lockKey">> => {
  const lockKey = randomBytes(32)
  const lockPubkey = toHex(getPubKeyFromPrivKey(lockKey))
  const requestedAt = deps.now()
  const quote = await deps.mint.createQuote({ unit, amount, pubkey: lockPubkey })
  const quotedAt = deps.now()
  if (
    quote.unit !== unit ||
    quote.amount !== amount ||
    quote.state !== "UNPAID" ||
    (quote.pubkey !== undefined && quote.pubkey !== lockPubkey)
  ) {
    throw new TopUpError("quote", "the mint quoted something other than what was asked")
  }
  const lifeMs = quote.expiry === null ? null : quoteLifeMs(quote.request, quote.expiry)
  if (lifeMs === undefined) {
    // Without it the quote's age could be told only by comparing the
    // phone's clock with the mint's, which is what `quoteAge` avoids.
    throw new TopUpError("quote", "the mint's invoice does not say when it was issued")
  }
  return {
    quote: {
      id: quote.quote,
      request: quote.request,
      expiry: quote.expiry,
      requestedAt,
      quotedAt,
      lifeMs,
    },
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
   * either an earlier dispatch rules out quoting again (the record stays
   * until the mint says whether that dispatch landed), or a fresh quote has
   * too little life too.
   */
  | { status: "expired" }

/**
 * The mint holds the quote's invoice as paid (any state but UNPAID): saved at
 * once, so nothing reads this top-up as unpaid again (a Dismiss, a card-free
 * pass). Only a record still quoted on that same quote changes.
 */
const markPaid = (
  deps: Pick<TopUpDeps, "store">,
  record: TopUpRecord,
): Promise<TopUpRecord> =>
  deps.store.update(record.id, (r) =>
    r.state === "quoted" && r.quote.id === record.quote.id ? { ...r, state: "paid" } : r,
  )

/**
 * Pay the quote's invoice from the record's wallet. The mint is asked first:
 * an invoice it already holds as paid is never paid again, whatever the
 * wallet said last time. A quote near its expiry is never paid: a first
 * payment gets a new quote, checked again before it is paid, and a retry is
 * refused.
 */
export async function payTopUp(
  deps: TopUpDeps,
  id: string,
): Promise<{ record: TopUpRecord; result: PayResult }> {
  let record = await load(deps, id)
  if (record.state !== "quoted") return { record, result: { status: "paid" } }

  if ((await deps.mint.quoteState(record.quote.id)) !== "UNPAID") {
    record = await markPaid(deps, record)
    return { record, result: { status: "paid" } }
  }

  if (pastPayWindow(record, deps.now())) {
    if (everSent(record)) return { record, result: { status: "expired" } }
    record = await requote(deps, record)
    // A quote whose whole life is shorter than MIN_PAY_WINDOW_MS, one that
    // took too long to arrive, or a clock that moved while it was quoted, is
    // not paid either.
    if (pastPayWindow(record, deps.now())) {
      return { record, result: { status: "expired" } }
    }
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
      if (isRetry && !outcome.definitive) {
        // This dispatch was refused before it ran, and says nothing about the
        // earlier one whose answer was lost: it may still land. The server's
        // contract is that such an answer is retried under the SAME key
        // (flash src/app/payments/idempotency.ts), so this stays a retry of it.
        return { record, result: { status: "unknown", message: outcome.message } }
      }
      // Nothing is out under this key: its only dispatch was refused before
      // it ran, or IBEX's verdict on the key is that the payment failed (the
      // server caches that verdict and replays it to every retry under the
      // key, so the key can never pay). A fresh key for the next attempt.
      // `everDispatched` stays: see `cancelTopUp`.
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

const mintAttempt = async (deps: CardFreeDeps, id: string): Promise<MintResult> => {
  const read = await load(deps, id)
  if (read.state === "minted" || read.state === "loaded") {
    return { record: read, status: "minted" }
  }
  const quoteState = await deps.mint.quoteState(read.quote.id)
  // UNPAID: the payment has not reached the mint.
  if (quoteState === "UNPAID") return { record: read, status: "waiting" }
  // Any other state means the invoice was paid: saved before anything else.
  const record = read.state === "quoted" ? await markPaid(deps, read) : read
  // Still quoted: quoted again since it was read, and the next ask is about
  // its new quote.
  if (record.state === "quoted") return { record, status: "waiting" }
  // PENDING: a mint call for this quote is running right now, and ends
  // ISSUED or PAID again.
  if (quoteState === "PENDING") return { record, status: "waiting" }

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
        // Only a call that got no answer from the mint is judged by the clocks.
        const expired = isMintOperationError(err)
          ? refusedAsExpired(err)
          : quoteExpired(record, deps.now())
        if (after === "PAID" && expired) {
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
    mintRefused: undefined,
    state: "minted",
  }))
  return { record: saved, status: "minted" }
}

/**
 * One mint of a top-up. A refusal the mint will repeat is saved on the paid
 * record (`mintRefused`), so the card-free pass stops asking the mint about
 * it; only the user asks again.
 */
const mintOnce = async (deps: CardFreeDeps, id: string): Promise<MintResult> => {
  try {
    return await mintAttempt(deps, id)
  } catch (err) {
    if (isFinal(err) && err.reason !== "not-found") {
      const { reason } = err
      await deps.store
        .update(id, (r) => (r.state === "paid" ? { ...r, mintRefused: reason } : r))
        // Unsaved, the next pass asks the mint once more: no harm.
        .catch(() => undefined)
    }
    throw err
  }
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
  // A refusal the mint will repeat: asked again only when the user asks
  // (Finish), never by a pass.
  if (record.mintRefused) return false
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
      // Any other state: the mint holds it paid. `mintTopUp` saves it as
      // paid before it mints (`markPaid`), so a mint that fails, a quote past
      // its expiry say, leaves a paid top-up, never a quote read as unpaid.
    }
    const { status } = await mintTopUp(deps, record.id)
    return status === "waiting" && !quoteIsDead(record, deps.now())
  } catch (err) {
    // A refusal the mint will repeat is saved (`mintRefused`) and waits for
    // the user; anything else is asked again while the quote can still be
    // minted.
    return !isFinal(err) && !quoteIsDead(record, deps.now())
  }
}

/**
 * Move every saved top-up forward that needs no card, and drop the quotes
 * nobody can pay any more. Run on launch, on foreground, while a payment may
 * still land, and when the card screen is focused:
 * - a paid top-up (or a sent quote the mint now holds as paid, saved as paid
 *   first) is minted at once, so its proofs are saved while the mint still
 *   issues the quote;
 * - a quote the mint still holds unpaid past its life and `EXPIRY_GRACE_MS`
 *   (`quoteIsDead`) is dropped, lock key and all: nothing can pay it now;
 * - a paid top-up the mint refused in a way it will repeat (`mintRefused`)
 *   is left for the user, and never asked about again by a pass.
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
 * Only empty slots are written to, and CLEAR_SPENT is never sent. That
 * departs on purpose from the cashu-javacard spec, whose top-up flow sends
 * CLEAR_SPENT before the loads: spec/NUT-XX.md:193, and spec/APDU.md:278
 * ("Called after a top-up cycle to reclaim slot space") and :453, at v0.2.0,
 * unchanged on the 0.3 branches (the spec fix: lnflash/cashu-javacard#27).
 * flash-pos and cashu-client never send it either. A spent slot is owed
 * until it settles at the mint (spec/CARD-FILE.md, "Why `spent` is
 * required"), and a burn whose signature never left the card can be
 * recovered only from its slot (flash-pos `hasUnsettledForCard`), so
 * clearing it can destroy value. A card without the empty slots is refused
 * before anything is written.
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
 * even when the wallet's answer read as a refusal, and stays. One the mint
 * holds as paid is saved as paid on the way, so it is minted, not offered
 * for dropping again.
 */
export async function cancelTopUp(deps: CardFreeDeps, id: string): Promise<void> {
  const record = await load(deps, id)
  if (record.state !== "quoted") {
    throw new TopUpError("state", "a paid top-up cannot be cancelled")
  }
  if (everSent(record)) {
    if (!quoteIsDead(record, deps.now())) {
      throw new TopUpError("state", "this payment may still land")
    }
    if ((await deps.mint.quoteState(record.quote.id)) !== "UNPAID") {
      await markPaid(deps, record)
      throw new TopUpError("state", "the mint holds this top-up's payment")
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
