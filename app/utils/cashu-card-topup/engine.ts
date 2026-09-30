import {
  Amount,
  OutputData,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  getPubKeyFromPrivKey,
  hasValidDleq,
  signMintQuote,
} from "@cashu/cashu-ts"

import {
  CardInfo,
  Transceiver,
  clearSpent,
  getProof,
  getSlotStatuses,
  loadProof,
  toHex,
} from "../cashu-card"
import {
  cardSlotFromProof,
  makeCanonicalCardOutput,
  randomBytes,
  splitPow2,
} from "../cashu-card-outputs"
import type { TopUpMint } from "./mint"
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
 *   invoice was paid;
 * - a mint call whose answer was lost is recovered with NUT-09, never by
 *   minting again;
 * - the proofs are saved, DLEQ-checked, before anything is written to the
 *   card, and a resumed load reads the card's inventory first because the
 *   card itself accepts the same proof twice.
 */

/** forge's NUT-04 limit per quote, for both units. The mint enforces it too. */
export const MAX_TOPUP_AMOUNT = 1_000_000

export type TopUpFailure =
  | "amount"
  | "slots"
  | "quote"
  | "state"
  | "not-found"
  | "restore"
  | "dleq"
  | "mint-mismatch"

export class TopUpError extends Error {
  constructor(readonly reason: TopUpFailure, message: string) {
    super(message)
    this.name = "TopUpError"
  }
}

/** What the wallet said about the payment. */
export type PayOutcome =
  /** SUCCESS or ALREADY_PAID. */
  | { kind: "paid" }
  /** PENDING: the mint's quote turns PAID when it settles. */
  | { kind: "pending" }
  /** FAILURE: nothing left the wallet. */
  | { kind: "failed"; message?: string }
  /** The dispatch may or may not have executed (a lost answer, a key refusal). */
  | { kind: "unknown"; message?: string }

export type PayArgs = {
  walletId: string
  paymentRequest: string
  idempotencyKey: string
  /** An earlier dispatch of this same payment went out; its outcome is unknown. */
  isRetry: boolean
  onKeylessDispatch: () => void
}

export type TopUpDeps = {
  mint: TopUpMint
  store: TopUpStore
  pay: (args: PayArgs) => Promise<PayOutcome>
  now: () => number
  newId: () => string
}

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

const load = async (deps: TopUpDeps, id: string): Promise<TopUpRecord> => {
  const record = await deps.store.get(id)
  if (!record) throw new TopUpError("not-found", `top-up ${id} is not saved`)
  return record
}

/** The slots a top-up of `amount` takes: one per power of two in it. */
export const slotsNeeded = (amount: number): number => splitPow2(amount).length

export type PrepareArgs = {
  cardPubkey: string
  unit: CardUnit
  amount: number
  walletId: string
  /** The card as last read: slots to write into, and spent ones CLEAR_SPENT can free. */
  card: Pick<CardInfo, "empty" | "spent">
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
  const pieces = splitPow2(amount)
  const room = args.card.empty + args.card.spent
  if (pieces.length > room) {
    throw new TopUpError(
      "slots",
      `the top-up needs ${pieces.length} slots and the card has ${room}`,
    )
  }
  const cardPubkey = args.cardPubkey.toLowerCase()
  const keyset = await deps.mint.activeKeyset(unit)
  const outputs = pieces.map((piece) =>
    makeCanonicalCardOutput(piece, keyset.id, cardPubkey),
  )
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
  const at = deps.now()
  return deps.store.put({
    version: 1,
    id: deps.newId(),
    cardPubkey,
    mintUrl: deps.mint.url,
    unit,
    amount,
    keysetId: keyset.id,
    quote: { id: quote.quote, request: quote.request, expiry: quote.expiry },
    lockKey: toHex(lockKey),
    outputs: outputs.map(toSaved),
    payment: {
      walletId: args.walletId,
      idempotencyKey: deps.newId(),
      dispatched: false,
      wentKeyless: false,
    },
    loadStarted: false,
    state: "quoted",
    createdAt: at,
    updatedAt: at,
  })
}

export type PayResult =
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; message?: string }
  | { status: "unknown"; message?: string }

/**
 * Pay the quote's invoice from the record's wallet. The mint is asked first:
 * an invoice it already holds as paid is never paid again, whatever the
 * wallet said last time.
 */
export async function payTopUp(
  deps: TopUpDeps,
  id: string,
): Promise<{ record: TopUpRecord; result: PayResult }> {
  let record = await load(deps, id)
  if (record.state !== "quoted") return { record, result: { status: "paid" } }

  if ((await deps.mint.quoteState(record.quote.id)) !== "UNPAID") {
    record = await deps.store.update(id, (r) => ({ ...r, state: "paid" }))
    return { record, result: { status: "paid" } }
  }

  const isRetry = record.payment.dispatched
  if (!isRetry) {
    record = await deps.store.update(id, (r) => ({
      ...r,
      payment: { ...r.payment, dispatched: true },
    }))
  }
  let wentKeyless = record.payment.wentKeyless
  const saveKeyless = (r: TopUpRecord): TopUpRecord => ({
    ...r,
    payment: { ...r.payment, wentKeyless },
  })

  let outcome: PayOutcome
  try {
    outcome = await deps.pay({
      walletId: record.payment.walletId,
      paymentRequest: record.quote.request,
      idempotencyKey: record.payment.idempotencyKey,
      isRetry,
      onKeylessDispatch: () => {
        wentKeyless = true
      },
    })
  } catch (err) {
    // A thrown dispatch may still have executed: the next attempt asks the
    // mint first and retries with the same key.
    record = await deps.store.update(id, saveKeyless)
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
      record = await deps.store.update(id, (r) => ({ ...saveKeyless(r), state: "paid" }))
      return { record, result: { status: "paid" } }
    case "failed":
      // Nothing left the wallet. A fresh key for the next attempt: the server
      // replays a cached failure to the old one.
      record = await deps.store.update(id, (r) => ({
        ...r,
        payment: {
          ...r.payment,
          idempotencyKey: deps.newId(),
          dispatched: false,
          wentKeyless: false,
        },
      }))
      return { record, result: { status: "failed", message: outcome.message } }
    case "pending":
      record = await deps.store.update(id, saveKeyless)
      return { record, result: { status: "pending" } }
    case "unknown":
      record = await deps.store.update(id, saveKeyless)
      return { record, result: { status: "unknown", message: outcome.message } }
  }
}

const restoreSignatures = async (
  deps: TopUpDeps,
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

/**
 * Get the mint's signatures on the saved outputs and turn them into card
 * proofs. `waiting` while the mint has not seen the payment. Every proof is
 * DLEQ-checked against the mint's published key and checked to rebuild on
 * this card before it is saved; nothing that fails either check is kept.
 */
export async function mintTopUp(
  deps: TopUpDeps,
  id: string,
): Promise<{ record: TopUpRecord; status: "minted" | "waiting" }> {
  const record = await load(deps, id)
  if (record.state === "minted" || record.state === "loaded") {
    return { record, status: "minted" }
  }
  const quoteState = await deps.mint.quoteState(record.quote.id)
  if (quoteState === "UNPAID") return { record, status: "waiting" }

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
      if ((await deps.mint.quoteState(record.quote.id)) !== "ISSUED") throw err
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

/**
 * Write the minted proofs onto the card, inside one card session whose PIN
 * (if the card has one) the caller has already verified.
 *
 * The first load saves `loadStarted` before its first LOAD_PROOF. Any later
 * load reads every occupied slot first and skips proofs already there: a
 * LOAD_PROOF can land on the card and its answer be lost, and the card takes
 * the same proof twice. Spent slots count too, so a proof spent since it was
 * loaded is not loaded again. CLEAR_SPENT runs only when the empty slots
 * cannot take what is left.
 */
export type LoadArgs = {
  id: string
  /** An open card session; VERIFY_PIN already done when the card has a PIN. */
  transceive: Transceiver
  card: Pick<CardInfo, "maxSlots">
}

export async function loadTopUp(
  deps: TopUpDeps,
  { id, transceive, card }: LoadArgs,
): Promise<TopUpRecord> {
  const record = await load(deps, id)
  if (record.state === "loaded") return record
  const { proofs } = record
  if (record.state !== "minted" || !proofs) {
    throw new TopUpError("state", "the top-up has no proofs to load yet")
  }
  const statuses = await getSlotStatuses(transceive, card.maxSlots)
  let pending = proofs
  if (record.loadStarted) {
    const onCard = new Set<string>()
    for (let slot = 0; slot < statuses.length; slot += 1) {
      if (statuses[slot] !== "empty") onCard.add((await getProof(transceive, slot)).nonce)
    }
    pending = proofs.filter((proof) => !onCard.has(proof.nonce))
  } else {
    await deps.store.update(id, (r) => ({ ...r, loadStarted: true }))
  }

  let empty = statuses.filter((status) => status === "empty").length
  if (empty < pending.length) {
    const spent = statuses.filter((status) => status === "spent").length
    if (empty + spent >= pending.length) empty += await clearSpent(transceive)
    if (empty < pending.length) {
      throw new TopUpError(
        "slots",
        `${pending.length} proofs to load and ${empty} free slots on the card`,
      )
    }
  }
  for (const proof of pending) await loadProof(transceive, proof)
  return deps.store.update(id, (r) => ({ ...r, state: "loaded" }))
}

/**
 * Drop a top-up that can no longer take money: one never dispatched, or one
 * whose invoice the mint still holds as unpaid after it expired. Anything
 * else may be paid, or may still become paid, and stays.
 */
export async function cancelTopUp(deps: TopUpDeps, id: string): Promise<void> {
  const record = await load(deps, id)
  if (record.state !== "quoted") {
    throw new TopUpError("state", "a paid top-up cannot be cancelled")
  }
  if (record.payment.dispatched) {
    const expired =
      record.quote.expiry !== null && record.quote.expiry * 1000 < deps.now()
    if (!expired || (await deps.mint.quoteState(record.quote.id)) !== "UNPAID") {
      throw new TopUpError("state", "this payment may still land")
    }
  }
  await deps.store.remove(id)
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
