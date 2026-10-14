/* eslint-disable max-lines -- one money path, kept together with its recovery. */
import {
  Amount,
  OutputData,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  blindMessage,
  hasValidDleq,
  isMintOperationError,
} from "@cashu/cashu-ts"

import {
  CardError,
  CardProofSlot,
  CardProtocolError,
  MAX_SLOTS,
  Transceiver,
  getPieces,
  getProof,
  toHex,
} from "../cashu-card"
import {
  CardSlotProof,
  buildCardP2PKSecret,
  cardSlotFromProof,
} from "../cashu-card-outputs"
import {
  CHANGE_MOST,
  ChangeOpening,
  getChange,
  spendAllAgain,
  spendAllBegin,
  spendAllChange,
  spendAllSign,
} from "../cashu-card-spend"
import {
  ReclaimVerdicts,
  cardCommitments,
  loadPieces,
  proofY,
  reclaimSpentSlots,
  tidyOwed,
} from "./engine"
import { TidySkip, planTidy } from "./ladder"
import { sameMint } from "./mint-url"
import type { TopUpMint } from "./mint"
import type { TopUpStore } from "./store"
import type { TidyOpening, TidyRecord } from "./types"

/**
 * A card tidy (ENG-702): the owner's phone, online, swaps some of the card's
 * largest pieces for change the card makes for itself, shaped back to
 * ENG-700's ladder (`planTidy`). One tap:
 *
 *   GET_PIECES, GET_CHANGE → the plan → [VERIFY_PIN] → SPEND_ALL_BEGIN →
 *   SPEND_ALL_CHANGE per new piece → SPEND_ALL_SIGN → GET_CHANGE (the
 *   openings) → GET_NONCE, ALLOW_LOAD → the swap at the mint → LOAD_PROOF per
 *   new piece → the reclaim of the burned inputs (CLEAR_SPENT).
 *
 * Every output is the card's own change, so only the mint's fee leaves the
 * card: the applet counts the pieces less the change against its daily limit
 * and its no-PIN allowance, and keeps each output's r until the piece is back
 * on it, so the card holds the durable copy of the change.
 *
 * Saved before each outside effect, in the top-up store (one list, so a tidy
 * and a top-up never count the same empty slots twice: `cardCommitments`):
 * - `planned` before BEGIN, and again with the change's blinded messages
 *   before SIGN, the one command that burns;
 * - `signed` with the signature as soon as SIGN answers: the mint is the one
 *   verifier that counts, and a phone that misread a good signature must not
 *   throw it away;
 * - `swapped` with the mint's signatures as soon as it answers;
 * - `loaded` (dropped) once every piece is back on the card.
 * A tidy cut anywhere resumes on the next tap (`runTidy` finds it first), and
 * a signed one is swapped without the card (`advanceTidies`). An outcome no
 * retry can change (the mint refused the swap, or spent the pieces for
 * something else) leaves the tidy `needs-card`, its signature kept, so it
 * never stays owed for good.
 */

export type TidyDeps = {
  mint: TopUpMint
  store: TopUpStore
  now: () => number
  newId: () => string
}

/** Why a tidy stopped. */
export type TidyFailure =
  /** The mint has not finished with the swap (an input PENDING): ask again later. */
  | "waiting"
  /** The swap was made and the mint returned no signature for a piece of change. */
  | "restore"
  /** A signature from the mint failed its DLEQ check, or does not rebuild on the card. */
  | "dleq"
  /**
   * The tidy can never finish: the mint refused its swap, or spent its pieces
   * for something else, or the card holds no openings for its change (it
   * signed another payment since). Kept, with the signature, for a human.
   */
  | "needs-card"
  /** The record is not in a state this step takes, or the card is not the record's. */
  | "state"

export class TidyError extends Error {
  constructor(readonly reason: TidyFailure, message: string) {
    super(message)
    this.name = "TidyError"
  }
}

export type TidyResult =
  /** No tidy, and nothing was written or sent past GET_CHANGE. */
  | { status: "skipped"; reason: TidySkip }
  /** Every piece of the change is on the card. */
  | { status: "tidied"; record: TidyRecord }
  /** Saved and part way: another tap finishes it (a piece the mint still holds pending). */
  | { status: "unfinished"; record: TidyRecord }
  /** A saved tidy the card never signed: dropped, nothing burned. */
  | { status: "abandoned"; record: TidyRecord }

export type RunTidyArgs = {
  /** An open card session on the record's card, the applet selected. */
  transceive: Transceiver
  card: { pubkey: string; maxSlots: number }
  /**
   * The keyset the owner was offered a tidy in (`tidyKeyset` of the read),
   * the one `feePpk` was asked for and checked active in, before the tap. A
   * new tidy plans in it alone, whatever the tap's own read favours, so the
   * record's keyset and its fee are the same keyset's. Undefined (the read
   * had no piece a tidy can spend): no new tidy starts.
   */
  keysetId: string | undefined
  /** `keysetId`'s NUT-02 `input_fee_ppk`, asked before the tap (`TopUpMint.feePpk`). */
  feePpk: number
  /**
   * Decision 1: VERIFY_PIN, sent before SPEND_ALL_BEGIN (any other command
   * between BEGIN and SIGN gives the payment up) on a card whose no-PIN
   * allowance does not cover the tidy, and before SPEND_ALL_AGAIN.
   */
  verifyPin?: (transceive: Transceiver) => Promise<void>
  /**
   * Opens the tap for loading the change: ALLOW_LOAD with the owner's proof
   * (GET_NONCE first). Sent only after SIGN, for the same reason. A PIN
   * verified in this tap opens it too, and this may then do nothing.
   */
  openForLoading: (transceive: Transceiver) => Promise<void>
  /** The mint's word on the card's spent slots as last read (`reclaimVerdicts`), asked before the tap. */
  verdicts?: ReclaimVerdicts
}

const sum = (amounts: readonly number[]): number => amounts.reduce((a, b) => a + b, 0)

/**
 * The tidies a tap is carrying, by id: the card-free pass leaves them alone,
 * so a swap the tap is about to send, or has in flight, is never sent a
 * second time beside it (`advanceTidies`).
 */
const inTap = new Set<string>()

/**
 * The card-free pass's work on a tidy, by id, while it runs: a tap that would
 * take the same tidy waits for it first, for the same reason (`runTidy`).
 */
const advancing = new Map<string, Promise<void>>()

/** The secret the card rebuilds for one of its pieces (format 4, no date). */
const secretOf = (nonce: string, cardPubkey: string): string =>
  buildCardP2PKSecret(nonce, cardPubkey)

/** Every unspent piece and every spent slot, by GET_PIECES pages alone. */
const readPieces = async (
  transceive: Transceiver,
): Promise<{ unspent: CardProofSlot[]; spent: number }> => {
  const unspent: CardProofSlot[] = []
  let spent = 0
  let first = 0
  while (first < MAX_SLOTS) {
    const page = await getPieces(transceive, first)
    unspent.push(...page.unspent)
    spent += page.spent.length
    first = page.next
  }
  return { unspent, spent }
}

const update = (
  deps: Pick<TidyDeps, "store">,
  record: TidyRecord,
  change: Partial<TidyRecord>,
): Promise<TidyRecord> =>
  deps.store.tidies.update(record.id, (r) => ({ ...r, ...change }))

/** The B_ the card's opening blinds to: Y(secret) + r·G, the secret rebuilt from the nonce. */
const blindedBy = (opening: ChangeOpening, cardPubkey: string): string =>
  toHex(
    blindMessage(
      new TextEncoder().encode(secretOf(opening.nonce, cardPubkey)),
      BigInt(`0x${opening.r}`),
    ).B_.toBytes(true),
  )

/**
 * GET_CHANGE's openings matched to the record's outputs by the blinded
 * message each rebuilds to. Undefined unless every output has its own: an
 * opening is let go only once its piece is on the card, and the proofs are
 * saved before any piece goes on.
 */
const openingsFor = (
  record: TidyRecord,
  openings: readonly ChangeOpening[],
): TidyOpening[] | undefined => {
  const byB = new Map(
    openings
      .filter((opening) => opening.date === 0)
      .map((opening) => [blindedBy(opening, record.cardPubkey), opening]),
  )
  const matched = record.outputs.map((output) => {
    const opening = output.B_ ? byB.get(output.B_.toLowerCase()) : undefined
    return opening && { nonce: opening.nonce, r: opening.r, B_: output.B_ as string }
  })
  return matched.every(Boolean) ? (matched as TidyOpening[]) : undefined
}

/** The record dropped as never signed: nothing was burned. */
const abandon = (deps: Pick<TidyDeps, "store">, record: TidyRecord) =>
  update(deps, record, { state: "abandoned" })

/**
 * The record kept for a human, with its signature, as one no retry can
 * finish: no longer owed, its slots no longer committed, and dismissable.
 */
const giveUp = async (
  deps: Pick<TidyDeps, "store">,
  record: TidyRecord,
  why: string,
): Promise<never> => {
  await update(deps, record, { state: "needs-card" })
  throw new TidyError("needs-card", why)
}

/**
 * The mint's refusals that the signed swap itself decides, so the identical
 * swap would be refused again: invalid proofs or witness (10001), unbalanced
 * (11005), over the amount limit (11006), duplicate inputs or outputs
 * (11007, 11008), unit errors (11009, 11010) and keyset errors (12000-12002).
 * Everything else leaves the tidy `signed` for another try: code 0 is
 * Nutshell's catch-all for any server exception (a database lock, a lost
 * connection), 11002 and 11004 are pending inputs or outputs, and Nutshell
 * 0.20.3 gives 11003 and 11004 two meanings each. A tidy retried in vain
 * stays owed; one given up in error loses its pieces.
 */
export const FINAL_MINT_REFUSALS: ReadonlySet<number> = new Set([
  10001, 11005, 11006, 11007, 11008, 11009, 11010, 12000, 12001, 12002,
])

export const isFinalMintRefusal = (
  err: unknown,
): err is Parameters<typeof isMintOperationError>[0] & {
  code: number
  message: string
} => isMintOperationError(err) && FINAL_MINT_REFUSALS.has(Number(err.code))

/** The swap as the card signed it: the witness on the first input, the outputs in order. */
const swapPayload = (
  record: TidyRecord,
): { inputs: Proof[]; outputs: SerializedBlindedMessage[] } => {
  if (!record.signature || record.outputs.some((output) => !output.B_)) {
    throw new TidyError("state", "the tidy has no signature to swap with")
  }
  const witness = JSON.stringify({ signatures: [record.signature] })
  return {
    inputs: record.inputs.map((input, i) => ({
      id: record.keysetId,
      amount: Amount.from(input.amount),
      secret: secretOf(input.nonce, record.cardPubkey),
      C: input.C,
      ...(i === 0 ? { witness } : {}),
    })),
    outputs: record.outputs.map((output) => ({
      id: record.keysetId,
      amount: Amount.from(output.amount),
      B_: output.B_ as string,
    })),
  }
}

const savedSignatures = (
  signatures: readonly SerializedBlindedSignature[],
): NonNullable<TidyRecord["signatures"]> =>
  signatures.map((signature) => ({
    C_: signature.C_,
    e: signature.dleq?.e ?? "",
    s: signature.dleq?.s ?? "",
  }))

/**
 * NUT-09: the mint's signatures on every output, or undefined unless it has
 * all of them.
 */
const restored = async (
  deps: Pick<TidyDeps, "mint">,
  outputs: SerializedBlindedMessage[],
): Promise<SerializedBlindedSignature[] | undefined> => {
  const answer = await deps.mint.restore(outputs)
  const found = outputs.map((output) => {
    const at = answer.outputs.findIndex((o) => o.B_ === output.B_)
    return at < 0 ? undefined : answer.signatures[at]
  })
  return found.every(Boolean) ? (found as SerializedBlindedSignature[]) : undefined
}

/**
 * The swap, once. A tidy whose swap may have been sent before (`resumed`) asks
 * the mint for its signatures first (NUT-09), and sends the identical swap
 * again only while every input is still UNSPENT there; a PENDING input waits.
 * A first swap whose answer is lost is asked about the same way at once.
 *
 * Two outcomes are final, and leave the record `needs-card`, with the
 * signature, for a human:
 * - an input SPENT at the mint and none of the change signed: the pieces
 *   went to another payment (a till), and this swap can never be made;
 * - the mint's own refusal with every input still UNSPENT, for a code the
 *   signed payload decides (`FINAL_MINT_REFUSALS`): the payload is fixed by
 *   the signature (keyset, amounts, outputs), so the identical swap would be
 *   refused again. Any other code (a server exception, pending pieces) is
 *   retried. The phone does
 *   not check the signature itself: the mint is the one verifier.
 * Anything else (the network, a mint that did not answer) leaves the record
 * `signed`, for another try.
 */
const swapTidy = async (
  deps: Pick<TidyDeps, "mint" | "store">,
  record: TidyRecord,
  resumed: boolean,
): Promise<TidyRecord> => {
  const { inputs, outputs } = swapPayload(record)
  // The inputs' states first, then the restore. A swap that commits between
  // two asks would otherwise read as "nothing restored" and then "SPENT", and
  // a tidy the mint signed would be given up. Nutshell marks the inputs SPENT
  // and signs the outputs in one transaction, so SPENT followed by an empty
  // restore is conclusive.
  const recover = async (): Promise<SerializedBlindedSignature[] | "send"> => {
    const states = await deps.mint.proofStates(
      record.inputs.map((input) => proofY(input.nonce, record.cardPubkey)),
    )
    if (states.some((state) => state === "PENDING")) {
      throw new TidyError("waiting", "the mint is still settling the tidy's pieces")
    }
    if (states.every((state) => state === "UNSPENT")) return "send"
    const found = await restored(deps, outputs)
    if (found) return found
    return giveUp(
      deps,
      record,
      "the mint spent the tidy's pieces for something else and signs none of its change",
    )
  }
  let signatures = resumed ? await recover() : "send"
  if (signatures === "send") {
    try {
      signatures = await deps.mint.swap(inputs, outputs)
    } catch (err) {
      const after = await recover()
      if (after === "send") {
        if (isFinalMintRefusal(err)) {
          await giveUp(deps, record, `the mint refused this tidy's swap: ${err.message}`)
        }
        throw err
      }
      signatures = after
    }
  }
  if (signatures.length !== outputs.length) {
    throw new TidyError("restore", "the mint signed a different number of outputs")
  }
  return update(deps, record, {
    signatures: savedSignatures(signatures),
    state: "swapped",
  })
}

/**
 * The change unblinded with the card's openings, each DLEQ-checked against
 * the mint's key and checked to rebuild on the card, and saved before any
 * LOAD_PROOF: what was owed comes to exactly the inputs less the fee.
 */
const finishProofs = async (
  deps: Pick<TidyDeps, "mint" | "store">,
  record: TidyRecord,
): Promise<TidyRecord> => {
  const { openings, signatures } = record
  if (!openings || !signatures) {
    throw new TidyError("state", "the tidy's change cannot be finished yet")
  }
  const keyset = await deps.mint.keyset(record.keysetId)
  let proofs: CardSlotProof[]
  try {
    proofs = record.outputs.map((output, i) => {
      const proof = new OutputData(
        { id: record.keysetId, amount: Amount.from(output.amount), B_: openings[i].B_ },
        BigInt(`0x${openings[i].r}`),
        new TextEncoder().encode(secretOf(openings[i].nonce, record.cardPubkey)),
      ).toProof(
        {
          id: record.keysetId,
          amount: Amount.from(output.amount),
          C_: signatures[i].C_,
          dleq: { e: signatures[i].e, s: signatures[i].s },
        },
        keyset,
      )
      if (!hasValidDleq(proof, keyset, { require: true })) {
        throw new Error("a signature came without a valid DLEQ proof")
      }
      return cardSlotFromProof(proof, record.cardPubkey)
    })
  } catch (err) {
    throw new TidyError(
      "dleq",
      `the mint's signature on the change failed verification: ${
        err instanceof Error ? err.message : err
      }`,
    )
  }
  const owed = sum(record.inputs.map((input) => input.amount)) - record.fee
  if (sum(proofs.map((proof) => proof.amount)) !== owed) {
    throw new TidyError("dleq", "the change does not come to the pieces less the fee")
  }
  return update(deps, record, { proofs })
}

/**
 * From a signature on: the openings (GET_CHANGE), the grant, the swap, the
 * proofs, the load and the reclaim of the burned inputs, as far as the tap
 * and the mint allow.
 */
const finishSigned = async (
  deps: TidyDeps,
  args: RunTidyArgs,
  { start, resumed }: { start: TidyRecord; resumed: boolean },
): Promise<TidyResult> => {
  const { transceive } = args
  const withOpenings = await (async () => {
    if (start.openings || start.proofs) return start
    const openings = openingsFor(start, await getChange(transceive))
    // The card keeps every opening it signed for until its piece is back on
    // it, and no piece goes on before the openings are saved: none held means
    // the card never signed this tidy's change (its last signature, given
    // again, is another payment's). The change can never be unblinded, so the
    // swap is never sent.
    if (!openings) {
      return giveUp(
        deps,
        start,
        "the card does not hold the openings of the tidy's change",
      )
    }
    return update(deps, start, { openings })
  })()
  await args.openForLoading(transceive)
  const swapped =
    withOpenings.state === "signed"
      ? await swapTidy(deps, withOpenings, resumed)
      : withOpenings
  const finished = swapped.proofs ? swapped : await finishProofs(deps, swapped)
  const proofs = finished.proofs as CardSlotProof[]
  // A resumed load asks the mint about each piece, as a top-up's does.
  const mintStates = finished.loadStarted
    ? await deps.mint
        .proofStates(proofs.map((proof) => proofY(proof.nonce, finished.cardPubkey)))
        .then((states) => new Map(proofs.map((proof, i) => [proof.nonce, states[i]])))
    : undefined
  const started: { record?: TidyRecord } = {}
  const { held } = await loadPieces(transceive, proofs, {
    loadStarted: finished.loadStarted,
    onStart: async () => {
      started.record = await update(deps, finished, { loadStarted: true })
    },
    mintStates,
    maxSlots: args.card.maxSlots,
  })
  const loaded = started.record ?? finished
  // The swap spent the inputs at the mint: their slots are settled, and free
  // with every other spent slot the mint has settled (all or none).
  const verdicts = new Map(args.verdicts ?? [])
  loaded.inputs.forEach((input) => verdicts.set(input.nonce, "SPENT"))
  await reclaimSpentSlots(transceive, { maxSlots: args.card.maxSlots, verdicts })
  if (held > 0) return { status: "unfinished", record: loaded }
  return { status: "tidied", record: await update(deps, loaded, { state: "loaded" }) }
}

/**
 * A tidy saved as planned, on its card again: did the card sign it? Its
 * inputs still unspent on the card (and at the mint) say no, and it is
 * dropped. Otherwise SPEND_ALL_AGAIN gives the card's last signature, saved
 * at once and carried on: it is this tidy's only if the card holds the
 * change's openings and the mint takes it. Another payment's (a till charged
 * in between) leaves the tidy `needs-card`, the signature kept
 * (`finishSigned`, `swapTidy`).
 */
const recoverPlanned = async (
  deps: TidyDeps,
  args: RunTidyArgs,
  record: TidyRecord,
): Promise<TidyResult> => {
  const { transceive } = args
  // No change was made: SIGN was never sent.
  if (record.outputs.some((output) => !output.B_)) {
    return { status: "abandoned", record: await abandon(deps, record) }
  }
  // One APDU at a time: an IsoDep channel carries a single exchange. An
  // empty slot (6A88) is a burned piece cleared since: the card signed.
  let slots: CardProofSlot[] | undefined = []
  for (const input of record.inputs) {
    try {
      slots.push(await getProof(transceive, input.slot))
    } catch (err) {
      if (!(err instanceof CardError)) throw err
      slots = undefined
      break
    }
  }
  const untouched =
    slots?.every(
      (slot, i) => slot.status === "unspent" && slot.nonce === record.inputs[i].nonce,
    ) ?? false
  if (untouched) {
    const states = await deps.mint.proofStates(
      record.inputs.map((input) => proofY(input.nonce, record.cardPubkey)),
    )
    if (states.every((state) => state === "UNSPENT")) {
      return { status: "abandoned", record: await abandon(deps, record) }
    }
  }
  if (args.verifyPin) await args.verifyPin(transceive)
  const signature = toHex(await spendAllAgain(transceive))
  const signed = await update(deps, record, { signature, state: "signed" })
  return finishSigned(deps, args, { start: signed, resumed: true })
}

/**
 * One tap's tidy. An unfinished tidy of this card is finished first, and no
 * new one starts in that tap. Otherwise the card's pieces and openings are
 * read, the tidy planned (`planTidy`, with the empty slots less what the
 * card's unfinished top-ups and tidies will take), and carried through.
 *
 * Throws, with nothing burned, for any refusal before or at SIGN (a
 * `CardSpendError`: `pin-needed`, `over-limit`, …), and drops the record. A
 * SIGN whose answer is lost leaves the record for the next tap, which asks
 * the card. A failure after SIGN (the mint, the load) leaves it saved where
 * it got to, for `advanceTidies` and the next tap.
 */
export async function runTidy(deps: TidyDeps, args: RunTidyArgs): Promise<TidyResult> {
  const claimed: string[] = []
  const claim = (id: string) => {
    inTap.add(id)
    claimed.push(id)
  }
  try {
    return await tidyInTap(deps, args, claim)
  } finally {
    claimed.forEach((id) => inTap.delete(id))
  }
}

/**
 * The card's oldest tidy still owed at this mint: the one a tap finishes
 * before any new one, and the one whose fee is in its record already.
 */
export const owedTidy = async (
  deps: { store: Pick<TopUpStore, "tidies">; mint: Pick<TopUpMint, "url"> },
  cardPubkey: string,
): Promise<TidyRecord | undefined> =>
  (await deps.store.tidies.list())
    .filter(
      (r) =>
        r.cardPubkey === cardPubkey.toLowerCase() &&
        tidyOwed(r) &&
        sameMint(r.mintUrl, deps.mint.url),
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0]

const tidyInTap = async (
  deps: TidyDeps,
  args: RunTidyArgs,
  claim: (id: string) => void,
): Promise<TidyResult> => {
  const { transceive, card } = args
  const cardPubkey = card.pubkey.toLowerCase()
  let unfinished = await owedTidy(deps, cardPubkey)
  if (unfinished) {
    // Claimed before anything is asked: the card-free pass now leaves it.
    claim(unfinished.id)
    const pass = advancing.get(unfinished.id)
    if (pass) {
      // The pass may have the swap in flight: its answer, not a second swap.
      await pass
      unfinished = await owedTidy(deps, cardPubkey)
      if (unfinished) claim(unfinished.id)
    }
  }
  if (unfinished?.state === "planned") return recoverPlanned(deps, args, unfinished)
  if (unfinished) return finishSigned(deps, args, { start: unfinished, resumed: true })

  // The read the owner was offered a tidy from had no piece to spend: no fee
  // was asked, so nothing is planned.
  if (args.keysetId === undefined) return { status: "skipped", reason: "at-target" }

  const read = await readPieces(transceive)
  const held = await getChange(transceive)
  const committed = cardCommitments(
    await deps.store.list(),
    cardPubkey,
    await deps.store.tidies.list(),
  )
  const empty = card.maxSlots - read.unspent.length - read.spent
  const plan = planTidy(read.unspent, {
    freeOpenings: CHANGE_MOST - held.length,
    freeSlots: empty - committed.slots,
    feePpk: args.feePpk,
    // The keyset whose fee was asked, not the one this read favours: a till
    // that took pieces since may have tipped the card towards another keyset
    // (rotated out, or at another fee). No piece of it left: at its shape.
    keysetId: args.keysetId,
  })
  if (plan.kind === "skip") return { status: "skipped", reason: plan.reason }

  const at = deps.now()
  let record = await deps.store.tidies.put({
    kind: "tidy",
    version: 1,
    id: deps.newId(),
    cardPubkey,
    mintUrl: deps.mint.url,
    keysetId: plan.keysetId,
    fee: plan.fee,
    inputs: plan.inputs.map(({ slot, nonce, C, amount }) => ({ slot, nonce, C, amount })),
    outputs: plan.outputs.map((amount) => ({ amount })),
    loadStarted: false,
    state: "planned",
    createdAt: at,
    updatedAt: at,
  })
  claim(record.id)

  // Nothing is burned before SIGN: a refusal or a lost card up to it drops the record.
  try {
    if (args.verifyPin) await args.verifyPin(transceive)
    const named = await spendAllBegin(
      transceive,
      record.inputs.map((input) => input.slot),
    )
    if (named !== sum(record.inputs.map((input) => input.amount))) {
      throw new CardProtocolError(
        `SPEND_ALL_BEGIN: the card's places are worth ${named}, the plan ${sum(
          record.inputs.map((input) => input.amount),
        )}`,
      )
    }
    const outputs = []
    for (const output of record.outputs) {
      outputs.push({
        amount: output.amount,
        B_: await spendAllChange(transceive, output.amount),
      })
    }
    // Saved before SIGN: from here the card may burn, and only these say
    // what it signed.
    record = await update(deps, record, { outputs })
  } catch (err) {
    await abandon(deps, record)
    throw err
  }

  let signature: string
  try {
    signature = toHex(await spendAllSign(transceive))
  } catch (err) {
    // The card's own refusal comes before the commit that burns.
    if (err instanceof CardError) {
      await abandon(deps, record)
      throw err
    }
    // A lost answer: the next tap asks the card (`recoverPlanned`).
    throw err
  }
  // The card burned (it signs only in the commit): the signature is saved,
  // and the swap decides. A swap the mint refuses leaves the tidy
  // `needs-card`, still saved.
  record = await update(deps, record, { signature, state: "signed" })
  return finishSigned(deps, args, { start: record, resumed: false })
}

/**
 * The card-free step of a card's signed tidies, beside `advanceTopUps`: the
 * swap (restore first, so a swap whose answer was lost is never repeated),
 * and the proofs when the openings are saved. Swapped tidies need the card,
 * and are left. A failure is left for the next pass.
 *
 * A tidy a tap is carrying is left to the tap: between its `signed` save and
 * the mint's answer, a restore finds nothing and the pieces are still
 * UNSPENT, so this pass would send the same swap again beside the tap's.
 */
export async function advanceTidies(
  deps: Pick<TidyDeps, "mint" | "store">,
): Promise<void> {
  const signed = (await deps.store.tidies.list()).filter(
    (r) => r.state === "signed" && sameMint(r.mintUrl, deps.mint.url),
  )
  for (const { id } of signed) {
    await advanceTidy(deps, id)
  }
}

/** One signed tidy's card-free step, unless a tap or another pass has it. */
const advanceTidy = async (
  deps: Pick<TidyDeps, "mint" | "store">,
  id: string,
): Promise<void> => {
  // Read again: a tap may have taken it, or finished it, since the list.
  const record = (await deps.store.tidies.list()).find((r) => r.id === id)
  if (record?.state !== "signed" || inTap.has(id) || advancing.has(id)) return
  const pass = (async () => {
    const swapped = await swapTidy(deps, record, true)
    if (swapped.openings) await finishProofs(deps, swapped)
  })().catch(() => {
    // Asked again on the next pass.
  })
  advancing.set(id, pass)
  try {
    await pass
  } finally {
    advancing.delete(id)
  }
}

/** A card's tidies still owed, or kept for a human (`needs-card`), oldest first. */
export const unfinishedTidies = async (
  deps: Pick<TidyDeps, "store">,
  cardPubkey: string,
): Promise<TidyRecord[]> =>
  (await deps.store.tidies.list())
    .filter(
      (r) =>
        r.cardPubkey === cardPubkey.toLowerCase() &&
        (tidyOwed(r) || r.state === "needs-card"),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
