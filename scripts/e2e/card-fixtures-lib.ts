/**
 * Card fixtures for the Flashcard e2e flows (ENG-634; card protocol 2.0,
 * ENG-675): a simulated card (cardsim, cashucard/javacard tools/cardsim,
 * at the ref the workflow pins) provisioned through the applet's own APDUs,
 * with format-4 SIG_ALL pieces minted at a real mint (a local Nutshell on
 * FakeWallet in CI), each with the mint's DLEQ proof.
 *
 * Nothing here writes a slot behind the applet's back: the owner is set with
 * SET_OWNER (the public TEST owner key, which the dev bridge link hands the
 * app too), the PIN with SET_PIN (sealed, as the card takes it), pieces go on
 * with the owner's ALLOW_LOAD and LOAD_PROOF, and a spent slot is spent by a
 * real payment (SPEND_ALL_BEGIN, the outputs, SPEND_ALL_SIGN) whose one
 * SIG_ALL signature is then redeemed at the mint (a NUT-03 swap), so the
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
  blindMessage,
  hashToCurve,
} from "@cashu/cashu-ts"
import { secp256k1 } from "@noble/curves/secp256k1"

import {
  CardError,
  CardInfo,
  Transceiver,
  readCardSlots,
  getBalance,
  getInfo,
  getPubkey,
  loadProof,
  selectApplet,
  sendCommand,
  setCardPin,
  setOpenCardRecord,
  toHex,
  verifyCardPin,
} from "../../app/utils/cashu-card"
import {
  CardLimits,
  TEST_OWNER_PRIVATE_KEY,
  allowLoad,
  ownerSigner,
  setLimits,
  setOwner,
} from "../../app/utils/cashu-card-owner"
import {
  CardSlotProof,
  buildCardP2PKSecret,
  cardSlotFromProof,
  makeCanonicalCardOutput,
  randomBytes,
  splitPow2,
} from "../../app/utils/cashu-card-outputs"
import type { TopUpMint } from "../../app/utils/cashu-card-topup/mint"
import { signMintQuote } from "../../app/utils/cashu-card-topup/nut20"

export const FIXTURE_NAMES = [
  "fresh",
  "owned",
  "loaded",
  "spent",
  "full",
  "blocked",
  "limited",
  "missing-small",
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
/** A PIN no fixture holds: three of these block a card. */
export const WRONG_PIN = "9999"
/**
 * The owner every fixture but `fresh` has: the public TEST owner key
 * (cashu-javacard cardctl, cardsim and its client hold the same). The flows
 * hand it to the app through the dev bridge link (`ownerKey=`), so the app is
 * this card's owner, and only in a development build.
 */
export const FIXTURE_OWNER_KEY = TEST_OWNER_PRIVATE_KEY

/**
 * The tip the fixture server's header stub answers (`GET /headers/...`, an
 * Esplora shape): a real mainnet header, the newest of cashu-javacard's
 * spec/vectors/headers.json, so the card takes it (SET_HEADER, the setup's
 * anchor) where a header mined for a test would be refused (6A93). The flows
 * hand the app this stub through the dev bridge link (`headers=`), so no flow
 * waits on mempool.space.
 */
export const FIXTURE_TIP_HEADER = {
  height: 971100,
  time: 1791814824,
  hash: "0000000000000000000174b1a4526c2718f9891c2c77945ed930a2f18959fe92",
  header:
    "00c0982393d11d01ce3623e775eb87f8f29d9e607bc98779db0602000000000000000000939a3be21aa361da579fa2578895413d925c780a5667f7b9fcf7a4c279648496a8eccc6af01e021776150c1e",
}

/** `loaded` and `spent`: 21 sat as 16 + 4 + 1, three slots. */
export const LOADED_AMOUNTS = [16, 4, 1]
/** `spent`: the slots spent on the card by one payment and redeemed at the mint (the 4 and the 1). */
export const SPENT_SLOTS = [1, 2]
/**
 * `missing-small` (ENG-702): 12 sat as 8 + 4, the fewest pieces, as a card
 * topped up before ENG-700 holds it: no 1 or 2, so a till offline can take
 * only 4, 8 or 12 exactly. A tidy reshapes it to 1 + 1 + 2 + 2 + 2 + 4.
 */
export const MISSING_SMALL_AMOUNTS = [8, 4]
/** `full`: every one of the card's 128 slots holds 1 sat. */
export const FULL_SLOTS = 128
/** `limited`: the owner's limits, the rollover budget at its default. */
export const FIXTURE_LIMITS: CardLimits = {
  day: 5000,
  payment: 1000,
  allowance: 250,
  rollBudget: 7,
}

/** The card: a fresh one on `reset`, and its APDU channel. */
export type FixtureCard = {
  /** A brand-new card, applet as installed: no owner, no PIN, no record, no pieces. */
  reset: () => Promise<void>
  transceive: Transceiver
}

/** The mint calls a fixture makes: a top-up's, plus a swap to redeem a spent slot. */
export type FixtureMint = Pick<
  TopUpMint,
  "activeKeyset" | "createQuote" | "quoteState" | "mint" | "proofStates"
> & {
  /** The mint's own URL: the card's record names it. */
  url: string
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
  /** SELECT's version: "2.0". */
  version: string
  balance: number
  pinState: CardInfo["pinState"]
  hasOwner: boolean
  recordSet: boolean
  sealed: boolean
  dailyLimit: number
  allowance: number
  unspent: number
  spent: number
  empty: number
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const QUOTE_POLL_MS = 250

/**
 * Proofs for `amounts`, minted to the card through a NUT-20 locked sat
 * quote, as the top-up mints them: canonical format-4 card outputs, the
 * mint's signatures unblinded and checked with their DLEQ (`toProof`), and
 * each one checked to rebuild on this card and to carry its DLEQ
 * (`cardSlotFromProof`) before it goes anywhere.
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

/** The owner's grant, then one LOAD_PROOF per piece with its DLEQ (P1 = 1). */
const loadSlots = async (transceive: Transceiver, slots: CardSlotProof[]) => {
  await allowLoad(transceive, ownerSigner(FIXTURE_OWNER_KEY))
  for (const slot of slots) {
    const result = await loadProof(transceive, slot)
    if (result.alreadyOnCard)
      throw new Error("fixture: a fresh piece was already on the card")
  }
}

/** Y = hash_to_curve(secret): how the mint knows a proof (NUT-07). */
const proofYOf = (secret: string): string =>
  toHex(hashToCurve(new TextEncoder().encode(secret)).toBytes(true))

/** The spend commands: the app never pays from a card, so only the fixtures name them. */
export const INS_SPEND_ALL_BEGIN = 0x22
export const INS_SPEND_ALL_OUTPUTS = 0x23
export const INS_SPEND_ALL_SIGN = 0x24

const u32 = (n: number) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256)

/** SPEND_ALL_SIGN, sent again while the card answers "not yet" (`00 01`). */
const spendAllSign = async (transceive: Transceiver): Promise<number[]> => {
  for (let waits = 0; waits < 1100; waits += 1) {
    const body = await sendCommand(transceive, INS_SPEND_ALL_SIGN, {
      le: 0x40,
      context: "SPEND_ALL_SIGN",
    })
    if (body.length === 64) return body
  }
  throw new Error("fixture: the card made the payment wait too long")
}

/**
 * Spends `slots` on the card in one payment, as a till does (spec/APDU.md,
 * Payment Flow): SPEND_ALL_BEGIN over the slots, the outputs (fresh secrets,
 * as a till's own), SPEND_ALL_SIGN under the PIN verified in this tap. Then
 * redeems the pieces at the mint with the card's one SIG_ALL signature as the
 * first input's witness, and checks the mint holds them SPENT. The outputs'
 * value is dropped: the fixture needs the spent slots, not the change.
 */
export const spendAndRedeem = async (
  deps: FixtureDeps,
  transceive: Transceiver,
  { slots, proofs }: { slots: number[]; proofs: Proof[] },
) => {
  const total = proofs.reduce(
    (sum, proof) => sum + Amount.from(proof.amount).toNumber(),
    0,
  )
  const keyset = await deps.mint.activeKeyset("sat")
  // NUT-02: the input fee, in ppk of each input, rounded up.
  const fee = Math.ceil(((keyset.input_fee_ppk ?? 0) * proofs.length) / 1000)
  if (total <= fee) throw new Error("fixture: the spent slots cannot pay their own fee")
  const outputs = splitPow2(total - fee).map((amount) => {
    const secret = new TextEncoder().encode(toHex(randomBytes(32)))
    const { B_ } = blindMessage(secret)
    return { amount, id: keyset.id, B_: toHex(B_.toBytes(true)) }
  })
  await sendCommand(transceive, INS_SPEND_ALL_BEGIN, {
    data: slots,
    le: 0x04,
    context: "SPEND_ALL_BEGIN",
  })
  for (let at = 0; at < outputs.length; at += 6) {
    await sendCommand(transceive, INS_SPEND_ALL_OUTPUTS, {
      data: outputs
        .slice(at, at + 6)
        .flatMap((o) => [
          ...u32(o.amount),
          ...(o.B_.match(/../g) ?? []).map((h) => parseInt(h, 16)),
        ]),
      context: "SPEND_ALL_OUTPUTS",
    })
  }
  const signature = toHex(await spendAllSign(transceive))
  await deps.mint.swap(
    proofs.map((proof, i) =>
      i === 0
        ? { ...proof, witness: JSON.stringify({ signatures: [signature] }) }
        : proof,
    ),
    outputs.map((o) => ({ ...o, amount: Amount.from(o.amount) })),
  )
  const states = await deps.mint.proofStates(
    proofs.map((proof) => proofYOf(proof.secret)),
  )
  if (states.some((state) => state !== "SPENT")) {
    throw new Error(
      `fixture: the spent pieces are ${states.join(", ")} at the mint after the swap`,
    )
  }
}

/** Three wrong VERIFY_PINs: 63C2, 63C1, then 6983 and the PIN is blocked. */
const blockPin = async (
  transceive: Transceiver,
  form: { sealed: boolean; cardPubkey: string },
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await verifyCardPin(transceive, WRONG_PIN, form)
      throw new Error("fixture: the card took a wrong PIN")
    } catch (err) {
      if (!(err instanceof CardError)) throw err
    }
  }
}

/**
 * Personalisation as the app's setup does it, one tap, owner last: the PIN
 * (when given), the record (the fixture mint), then SET_OWNER with the TEST
 * owner key. No anchor header: CI has no network to fetch one from.
 */
const setUp = async (
  transceive: Transceiver,
  {
    pin,
    mint,
    form,
  }: { pin?: string; mint: string; form: { sealed: boolean; cardPubkey: string } },
) => {
  if (pin) {
    await setCardPin(transceive, pin, form)
    await verifyCardPin(transceive, pin, form)
  }
  await setOpenCardRecord(transceive, { mint })
  await setOwner(transceive, FIXTURE_OWNER_KEY)
}

/**
 * Provisions `name` on a brand-new card and reads back what it holds:
 *
 * - `fresh`: no owner, no PIN, no record, no pieces.
 * - `owned`: set up (record, TEST owner), no PIN, no pieces.
 * - `loaded`: set up with PIN `FIXTURE_PIN`, 21 sat in three slots, each with its DLEQ.
 * - `spent`: `loaded`, with slots 1 and 2 spent by one payment and SPENT at the mint.
 * - `full`: set up, no PIN, 128 slots of 1 sat.
 * - `blocked`: `loaded`, with the PIN blocked by three wrong tries.
 * - `limited`: `loaded`, with the owner's limits `FIXTURE_LIMITS`.
 * - `missing-small`: set up, no PIN, 12 sat as 8 + 4 (`MISSING_SMALL_AMOUNTS`).
 *
 * Every fixture starts from `reset` and ends with a SELECT, so the app's
 * first command finds an unverified session, as a fresh tap does.
 */
export const loadFixture = async (
  name: FixtureName,
  deps: FixtureDeps,
): Promise<FixtureSummary> => {
  const { card, mint, log = () => undefined } = deps
  const { transceive } = card
  await card.reset()
  await selectApplet(transceive)
  const pubkey = toHex(await getPubkey(transceive))
  const { sealed } = await getInfo(transceive)
  const form = { sealed, cardPubkey: pubkey }
  log(`card ${pubkey}: ${name}`)

  if (name === "owned") await setUp(transceive, { mint: mint.url, form })

  if (name === "missing-small") {
    await setUp(transceive, { mint: mint.url, form })
    const { slots } = await mintToCard(deps, pubkey, MISSING_SMALL_AMOUNTS)
    await loadSlots(transceive, slots)
  }

  if (name === "full") {
    await setUp(transceive, { mint: mint.url, form })
    const { slots } = await mintToCard(deps, pubkey, new Array(FULL_SLOTS).fill(1))
    await loadSlots(transceive, slots)
  }

  if (name === "loaded" || name === "spent" || name === "blocked" || name === "limited") {
    await setUp(transceive, { pin: FIXTURE_PIN, mint: mint.url, form })
    const { proofs, slots } = await mintToCard(deps, pubkey, LOADED_AMOUNTS)
    await loadSlots(transceive, slots)
    if (name === "spent") {
      // A new session: the PIN gates the payment, as at a till.
      await selectApplet(transceive)
      await verifyCardPin(transceive, FIXTURE_PIN, form)
      await spendAndRedeem(deps, transceive, {
        slots: SPENT_SLOTS,
        proofs: SPENT_SLOTS.map((slot) => proofs[slot]),
      })
    }
    if (name === "blocked") {
      await selectApplet(transceive)
      await blockPin(transceive, form)
    }
    if (name === "limited") {
      await selectApplet(transceive)
      await setLimits(transceive, ownerSigner(FIXTURE_OWNER_KEY), FIXTURE_LIMITS)
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
    balance,
    pinState: info.pinState,
    hasOwner: info.hasOwner,
    recordSet: info.recordSet,
    sealed: info.sealed,
    dailyLimit: info.dailyLimit,
    allowance: info.allowance,
    unspent: info.unspent,
    spent: info.spent,
    empty: info.empty,
  }
  log(JSON.stringify(summary))
  return summary
}

/** Some of `pieces` adding up to exactly `amount`, the fewest there are; undefined for none. */
export const exactPieces = <P extends { amount: number }>(
  pieces: readonly P[],
  amount: number,
): P[] | undefined => {
  // Subsets by size, smallest first: a fixture card holds a handful of pieces.
  const n = pieces.length
  let best: P[] | undefined
  for (let mask = 1; mask < 2 ** n; mask += 1) {
    const chosen = pieces.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1)
    if (
      chosen.reduce((sum, piece) => sum + piece.amount, 0) === amount &&
      (!best || chosen.length < best.length)
    ) {
      best = chosen
    }
  }
  return best
}

/**
 * A till's offline payment of exactly `amount` from the fixture card, as the
 * tidy flow's second tap is (ENG-702): pieces that add up to it, with no
 * change, spent in one payment and redeemed at the mint (`spendAndRedeem`),
 * the PIN given first on a card that has one. Throws when no pieces add up
 * to it: a till offline would refuse the bill too.
 */
export const spendExactly = async (
  deps: FixtureDeps,
  amount: number,
): Promise<{ balance: number; spent: number[] }> => {
  const { transceive } = deps.card
  await selectApplet(transceive)
  const pubkey = toHex(await getPubkey(transceive))
  const { pinState, sealed } = await getInfo(transceive)
  const { unspent } = await readCardSlots(transceive)
  const chosen = exactPieces(unspent, amount)
  if (!chosen) throw new Error(`fixture: no pieces on the card pay exactly ${amount}`)
  await selectApplet(transceive)
  if (pinState === "set") {
    await verifyCardPin(transceive, FIXTURE_PIN, { sealed, cardPubkey: pubkey })
  }
  await spendAndRedeem(deps, transceive, {
    slots: chosen.map((piece) => piece.slot),
    proofs: chosen.map((piece) => ({
      id: piece.keysetId,
      amount: Amount.from(piece.amount),
      secret: buildCardP2PKSecret(piece.nonce, pubkey),
      C: piece.C,
    })),
  })
  await selectApplet(transceive)
  const balance = await getBalance(transceive)
  await selectApplet(transceive)
  return { balance, spent: chosen.map((piece) => piece.amount) }
}

/** The format-4 secret of a piece on the fixture card (for a spec that rebuilds one). */
export const fixtureSecret = (nonce: string, cardPubkey: string) =>
  buildCardP2PKSecret(nonce, cardPubkey)
