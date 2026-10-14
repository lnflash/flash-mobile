/* eslint-disable max-lines -- one money path, kept together with its recovery. */
import {
  Amount,
  OutputData,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  blindMessage,
  hasValidDleq,
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
  sigAllMessage,
  spendAllAgain,
  spendAllBegin,
  spendAllChange,
  spendAllSign,
  verifyCardSignature,
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
 * - `signed` with the signature as soon as SIGN answers;
 * - `swapped` with the mint's signatures as soon as it answers;
 * - `loaded` (dropped) once every piece is back on the card.
 * A tidy cut anywhere resumes on the next tap (`runTidy` finds it first), and
 * a signed one is swapped without the card (`advanceTidies`).
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
  /** The card burned the inputs and has signed another payment since: kept for a human. */
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
  /** The keyset's NUT-02 `input_fee_ppk`, asked before the tap (`TopUpMint.feePpk`). */
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

/** The secret the card rebuilds for one of its pieces (format 4, no date). */
const secretOf = (nonce: string, cardPubkey: string): string =>
  buildCardP2PKSecret(nonce, cardPubkey)

/** The SIG_ALL message the card signs for this tidy: its inputs, then its change. */
const messageOf = (record: TidyRecord): Uint8Array =>
  sigAllMessage(
    record.inputs.map((input) => ({
      secret: secretOf(input.nonce, record.cardPubkey),
      C: input.C,
    })),
    record.outputs.map((output) => ({ amount: output.amount, B_: output.B_ ?? "" })),
  )

const signsThis = (record: TidyRecord, signature: string): boolean =>
  verifyCardSignature(signature, messageOf(record), record.cardPubkey)

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
 */
const swapTidy = async (
  deps: Pick<TidyDeps, "mint" | "store">,
  record: TidyRecord,
  resumed: boolean,
): Promise<TidyRecord> => {
  const { inputs, outputs } = swapPayload(record)
  const recover = async (): Promise<SerializedBlindedSignature[] | "send"> => {
    const found = await restored(deps, outputs)
    if (found) return found
    const states = await deps.mint.proofStates(
      record.inputs.map((input) => proofY(input.nonce, record.cardPubkey)),
    )
    if (states.some((state) => state === "PENDING")) {
      throw new TidyError("waiting", "the mint is still settling the tidy's pieces")
    }
    if (states.every((state) => state === "UNSPENT")) return "send"
    throw new TidyError(
      "restore",
      "the mint spent the tidy's pieces and signs none of its change",
    )
  }
  let signatures = resumed ? await recover() : "send"
  if (signatures === "send") {
    try {
      signatures = await deps.mint.swap(inputs, outputs)
    } catch (err) {
      const after = await recover()
      if (after === "send") throw err
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
    if (!openings) {
      throw new TidyError(
        "state",
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
 * dropped. Otherwise SPEND_ALL_AGAIN gives the card's last signature, which
 * is this tidy's only if it verifies against this tidy's message; another
 * payment's (a till charged in between) leaves the tidy `needs-card`.
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
  if (!signsThis(record, signature)) {
    await update(deps, record, { state: "needs-card" })
    throw new TidyError(
      "needs-card",
      "the card has signed another payment since this tidy: its signature cannot be given again",
    )
  }
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
  const { transceive, card } = args
  const cardPubkey = card.pubkey.toLowerCase()
  const saved = (await deps.store.tidies.list()).filter(
    (r) =>
      r.cardPubkey === cardPubkey && tidyOwed(r) && sameMint(r.mintUrl, deps.mint.url),
  )
  const [unfinished] = saved.sort((a, b) => a.createdAt - b.createdAt)
  if (unfinished?.state === "planned") return recoverPlanned(deps, args, unfinished)
  if (unfinished) return finishSigned(deps, args, { start: unfinished, resumed: true })

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

  let signature: string | undefined
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
  if (!signsThis(record, signature)) {
    // Not this tidy's: the card burned (it signs only in the commit). Ask
    // once more; a card that will not sign this tidy leaves it for a human.
    const again = await spendAllAgain(transceive)
      .then(toHex)
      .catch(() => undefined)
    if (!again || !signsThis(record, again)) {
      await update(deps, record, { state: "needs-card" })
      throw new TidyError("needs-card", "the card's signature does not sign this tidy")
    }
    signature = again
  }
  record = await update(deps, record, { signature, state: "signed" })
  return finishSigned(deps, args, { start: record, resumed: false })
}

/**
 * The card-free step of a card's signed tidies, beside `advanceTopUps`: the
 * swap (restore first, so a swap whose answer was lost is never repeated),
 * and the proofs when the openings are saved. Swapped tidies need the card,
 * and are left. A failure is left for the next pass.
 */
export async function advanceTidies(
  deps: Pick<TidyDeps, "mint" | "store">,
): Promise<void> {
  const signed = (await deps.store.tidies.list()).filter(
    (r) => r.state === "signed" && sameMint(r.mintUrl, deps.mint.url),
  )
  for (const record of signed) {
    try {
      const swapped = await swapTidy(deps, record, true)
      if (swapped.openings) await finishProofs(deps, swapped)
    } catch {
      // Asked again on the next pass.
    }
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
