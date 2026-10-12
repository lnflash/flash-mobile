/**
 * Card fixtures for the Flashcard e2e flows (ENG-634): a simulated card
 * (cardsim, lnflash/cashu-javacard tools/cardsim) provisioned through the
 * applet's own APDUs, with proofs minted at a real mint (a local Nutshell on
 * FakeWallet in CI).
 *
 * Nothing here writes a slot behind the applet's back: proofs go on with
 * LOAD_PROOF, the PIN with SET_PIN, the PUK with SET_PUK, and a spent slot is
 * spent with SPEND_PROOF over the proof's real NUT-11 message and then
 * redeemed at the mint (a NUT-03 swap carrying the card's signature), so the
 * mint's NUT-07 answer for it is SPENT, as a settled payment's would be. The
 * top-up's reclaim (ENG-631) frees only such slots.
 *
 * Kept free of React Native so `card-fixtures.ts` runs it under tsx and the
 * spec runs it against the fake mint and card (`__tests__/helpers/fake-cashu.ts`).
 */
import {
  Amount,
  MintKeys,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
  hashToCurve,
} from "@cashu/cashu-ts"
import { secp256k1 } from "@noble/curves/secp256k1"
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import {
  CardError,
  CardInfo,
  Transceiver,
  buildApdu,
  getBalance,
  getInfo,
  getProof,
  getPubkey,
  loadProof,
  parseResponse,
  selectApplet,
  setCardPin,
  spendProof,
  toHex,
  verifyCardPin,
} from "../../app/utils/cashu-card"
import {
  CardSlotProof,
  cardSlotFromProof,
  makeCanonicalCardOutput,
  randomBytes,
  splitPow2,
} from "../../app/utils/cashu-card-outputs"
import type { TopUpMint } from "../../app/utils/cashu-card-topup/mint"
import { signMintQuote } from "../../app/utils/cashu-card-topup/nut20"

export const FIXTURE_NAMES = [
  "fresh",
  "loaded",
  "spent",
  "full",
  "blocked",
  "loaded-0.4",
] as const
export type FixtureName = (typeof FIXTURE_NAMES)[number]

export const isFixtureName = (name: string): name is FixtureName =>
  (FIXTURE_NAMES as readonly string[]).includes(name)

/**
 * The production mint's host (`CASHU_MINT_URL` in app/config/appinfo.ts, which
 * cannot be imported here: it pulls in React Native). Its quotes are paid only
 * by real payments, so it is never a fixture mint; the spec pins the two equal.
 */
export const PRODUCTION_MINT_HOST = "forge.flashapp.me"

/** The PIN every PIN fixture holds; the flows type it. */
export const FIXTURE_PIN = "1234"
/** The PUK every PIN fixture holds: the pin-blocked flow unblocks with it. */
export const FIXTURE_PUK = "12345678"
/** A PIN no fixture holds: three of these block a card. */
export const WRONG_PIN = "9999"

/** `loaded` and `spent`: 21 sat as 16 + 4 + 1, three slots. */
export const LOADED_AMOUNTS = [16, 4, 1]
/** `spent`: the slots spent on the card and redeemed at the mint (the 4 and the 1). */
export const SPENT_SLOTS = [1, 2]
/** `full`: every one of the card's 32 slots holds 1 sat. */
export const FULL_SLOTS = 32

/** INS the app never sends, so `cashu-card.ts` has no constant for them (applet 0.6). */
export const INS_SET_PUK = 0x44
export const INS_UNBLOCK_PIN = 0x45

/**
 * An older applet build cardsim can answer as (CardSim.java, Version masks):
 * 0.4 has no CLEAR_PIN and no PUK, 0.5 no PUK.
 */
export type MaskedVersion = "0.4" | "0.5"

/** The card: a fresh one on `reset`, and its APDU channel. */
export type FixtureCard = {
  /** A brand-new card, applet as installed: no PIN, no PUK, no proofs. */
  reset: () => Promise<void>
  /**
   * From here on, the card answers every APDU as `version` would: SELECT and
   * GET_INFO rewritten, the instructions it lacked answered 6D00. Until the
   * next `reset`.
   */
  mask: (version: MaskedVersion) => Promise<void>
  transceive: Transceiver
}

/** The mint calls a fixture makes: a top-up's, plus a swap to redeem a spent slot. */
export type FixtureMint = Pick<
  TopUpMint,
  "activeKeyset" | "createQuote" | "quoteState" | "mint" | "proofStates"
> & {
  /** NUT-03: the mint's signatures on `outputs`, for `inputs` it then holds SPENT. */
  swap: (
    inputs: Proof[],
    outputs: SerializedBlindedMessage[],
  ) => Promise<SerializedBlindedSignature[]>
}

export type FixtureDeps = {
  card: FixtureCard
  mint: FixtureMint
  /** Between asks while a FakeWallet quote turns PAID. */
  sleep?: (ms: number) => Promise<void>
  /** How long a quote may take to turn PAID before the fixture gives up. */
  quoteTimeoutMs?: number
  log?: (line: string) => void
}

/** What a fixture left on the card, as GET_INFO and GET_BALANCE read it afterwards. */
export type FixtureSummary = {
  name: FixtureName
  pubkey: string
  /** SELECT's version, through any mask: "0.4" for `loaded-0.4`. */
  version: string
  /** GET_INFO capability bit 3: the card answers CLEAR_PIN (Remove PIN). */
  clearPin: boolean
  balance: number
  pinState: CardInfo["pinState"]
  unspent: number
  spent: number
  empty: number
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const QUOTE_POLL_MS = 250

/** SET_PUK: `len ‖ puk` (spec/APDU.md, applet 0.6). */
export const setPukApdu = (puk: string): number[] => {
  const bytes = Array.from(puk, (c) => c.charCodeAt(0))
  return buildApdu(INS_SET_PUK, { data: [bytes.length, ...bytes] })
}

/** UNBLOCK_PIN: `len ‖ puk ‖ len ‖ new PIN` (spec/APDU.md, applet 0.6). */
export const unblockPinApdu = (puk: string, newPin: string): number[] => {
  const pukBytes = Array.from(puk, (c) => c.charCodeAt(0))
  const pinBytes = Array.from(newPin, (c) => c.charCodeAt(0))
  return buildApdu(INS_UNBLOCK_PIN, {
    data: [pukBytes.length, ...pukBytes, pinBytes.length, ...pinBytes],
  })
}

const setPuk = async (transceive: Transceiver, puk: string) => {
  parseResponse(await transceive(setPukApdu(puk)), "SET_PUK")
}

/**
 * Proofs for `amounts`, minted to the card through a NUT-20 locked sat
 * quote, as the top-up mints them: canonical card outputs, the mint's
 * signatures unblinded and checked (`toProof`), and each one checked to
 * rebuild on this card (`cardSlotFromProof`) before it goes anywhere.
 */
export const mintToCard = async (
  deps: FixtureDeps,
  cardPubkey: string,
  amounts: number[],
): Promise<{ proofs: Proof[]; slots: CardSlotProof[]; keyset: MintKeys }> => {
  const { mint, sleep = defaultSleep, quoteTimeoutMs = 30_000 } = deps
  const keyset = await mint.activeKeyset("sat")
  const total = amounts.reduce((sum, amount) => sum + amount, 0)
  const lockKey = randomBytes(32)
  const quote = await mint.createQuote({
    unit: "sat",
    amount: total,
    pubkey: toHex(secp256k1.getPublicKey(lockKey, true)),
  })
  // FakeWallet settles its own invoices; a real mint would wait for a payment.
  const deadline = Date.now() + quoteTimeoutMs
  for (;;) {
    const state = await mint.quoteState(quote.quote)
    if (state === "PAID") break
    if (state !== "UNPAID" && state !== "PENDING") {
      throw new Error(`fixture quote ${quote.quote} is ${state}, not PAID`)
    }
    if (Date.now() > deadline) {
      throw new Error(`fixture quote ${quote.quote} was not paid in ${quoteTimeoutMs} ms`)
    }
    await sleep(QUOTE_POLL_MS)
  }
  const outputs = amounts.map((amount) =>
    makeCanonicalCardOutput(amount, keyset.id, cardPubkey),
  )
  const messages = outputs.map((output) => output.blindedMessage)
  const signatures = await mint.mint({
    quote: quote.quote,
    outputs: messages,
    signature: signMintQuote(toHex(lockKey), quote.quote, messages),
  })
  const proofs = outputs.map((output, i) => output.toProof(signatures[i], keyset))
  return {
    proofs,
    slots: proofs.map((proof) => cardSlotFromProof(proof, cardPubkey)),
    keyset,
  }
}

const loadSlots = async (transceive: Transceiver, slots: CardSlotProof[]) => {
  for (const slot of slots) await loadProof(transceive, slot)
}

/** Y = hash_to_curve(secret): how the mint knows a proof (NUT-07). */
const proofYOf = (secret: string): string =>
  toHex(hashToCurve(new TextEncoder().encode(secret)).toBytes(true))

/**
 * Spends `slot` on the card over its real NUT-11 message (SHA-256 of the
 * secret) and redeems the proof at the mint with the card's signature, then
 * checks the mint holds it SPENT. The change goes to fresh outputs locked to
 * the card and is dropped: the fixture needs the spent slot, not its value.
 */
const spendAndRedeem = async (
  deps: FixtureDeps,
  transceive: Transceiver,
  {
    slot,
    proof,
    keyset,
    cardPubkey,
  }: { slot: number; proof: Proof; keyset: MintKeys; cardPubkey: string },
) => {
  const onCard = await getProof(transceive, slot)
  const amount = Amount.from(proof.amount).toNumber()
  if (onCard.C !== proof.C || onCard.amount !== amount) {
    throw new Error(`fixture slot ${slot} does not hold the proof it was given`)
  }
  const message = Array.from(sha256(new TextEncoder().encode(proof.secret)))
  const signature = toHex(await spendProof(transceive, slot, message))
  // NUT-02: the input fee, in ppk of each input, rounded up.
  const fee = Math.ceil((keyset.input_fee_ppk ?? 0) / 1000)
  if (amount <= fee) throw new Error(`fixture slot ${slot} cannot pay its own fee`)
  const outputs = splitPow2(amount - fee).map((piece) =>
    makeCanonicalCardOutput(piece, keyset.id, cardPubkey),
  )
  await deps.mint.swap(
    [{ ...proof, witness: JSON.stringify({ signatures: [signature] }) }],
    outputs.map((output) => output.blindedMessage),
  )
  const [state] = await deps.mint.proofStates([proofYOf(proof.secret)])
  if (state !== "SPENT") {
    throw new Error(`fixture slot ${slot} is ${state} at the mint after its swap`)
  }
}

/** Three wrong VERIFY_PINs: 63C2, 63C1, then 6983 and the PIN is blocked. */
const blockPin = async (transceive: Transceiver) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await verifyCardPin(transceive, WRONG_PIN)
      throw new Error("fixture: the card took a wrong PIN")
    } catch (err) {
      if (!(err instanceof CardError)) throw err
    }
  }
}

/**
 * Provisions `name` on a brand-new card and reads back what it holds:
 *
 * - `fresh`: no PIN, no PUK, no proofs.
 * - `loaded`: 21 sat in three slots, PUK `FIXTURE_PUK`, PIN `FIXTURE_PIN`.
 * - `spent`: `loaded`, with slots 1 and 2 spent and redeemed at the mint.
 * - `full`: 32 slots of 1 sat, no PIN.
 * - `blocked`: `loaded`, with the PIN blocked by three wrong tries.
 * - `loaded-0.4`: an applet 0.4 card (no CLEAR_PIN, no PUK) holding the
 *   `loaded` proofs and PIN, and no PUK: no 0.4 build could hold one.
 *
 * Every fixture starts from `reset` and ends with a SELECT, so the app's
 * first command finds an unverified session, as a fresh tap does.
 */
export const loadFixture = async (
  name: FixtureName,
  deps: FixtureDeps,
): Promise<FixtureSummary> => {
  const { card, log = () => undefined } = deps
  const { transceive } = card
  await card.reset()
  // Masked before the first APDU, on a brand-new card: a mask over a card
  // that already holds a PUK would be a card no 0.4 build could be
  // (CardSim.java, Version masks). Everything after goes through the mask, as
  // the app's own APDUs will.
  if (name === "loaded-0.4") await card.mask("0.4")
  await selectApplet(transceive)
  const pubkey = toHex(await getPubkey(transceive))
  log(`card ${pubkey}: ${name}`)

  if (name === "full") {
    const { slots } = await mintToCard(deps, pubkey, new Array(FULL_SLOTS).fill(1))
    await loadSlots(transceive, slots)
  }

  if (name === "loaded-0.4") {
    const { slots } = await mintToCard(deps, pubkey, LOADED_AMOUNTS)
    // Proofs while the card has no PIN, then the PIN. No SET_PUK: a 0.4 card
    // answers it 6D00.
    await loadSlots(transceive, slots)
    await setCardPin(transceive, FIXTURE_PIN)
  }

  if (name === "loaded" || name === "spent" || name === "blocked") {
    const { proofs, slots, keyset } = await mintToCard(deps, pubkey, LOADED_AMOUNTS)
    // The personalisation order (spec/APDU.md, SET_PUK): proofs and PUK
    // while the card has no PIN, then the PIN.
    await loadSlots(transceive, slots)
    await setPuk(transceive, FIXTURE_PUK)
    await setCardPin(transceive, FIXTURE_PIN)
    if (name === "spent") {
      // A new session: the PIN gates SPEND_PROOF, as at a till.
      await selectApplet(transceive)
      await verifyCardPin(transceive, FIXTURE_PIN)
      for (const slot of SPENT_SLOTS) {
        await spendAndRedeem(deps, transceive, {
          slot,
          proof: proofs[slot],
          keyset,
          cardPubkey: pubkey,
        })
      }
    }
    if (name === "blocked") {
      await selectApplet(transceive)
      await blockPin(transceive)
    }
  }

  await selectApplet(transceive)
  const info = await getInfo(transceive)
  const balance = await getBalance(transceive)
  await selectApplet(transceive)
  const summary: FixtureSummary = {
    name,
    pubkey,
    version: info.version,
    clearPin: info.clearPin,
    balance,
    pinState: info.pinState,
    unspent: info.unspent,
    spent: info.spent,
    empty: info.empty,
  }
  log(JSON.stringify(summary))
  return summary
}
