/**
 * The assisted-settlement relay (ENG-820): a tap of a 2.2 card that holds a
 * record of its last SIG_ALL payment carries that payment to the mint, so the
 * merchant's till, offline when it took the payment, finds it settled.
 *
 * Two halves, so card I/O and network never share a step:
 * - `captureOutbox` reads the packet off the card (GET_OUTBOX, `outbox.ts`)
 *   with the vendored engine's `capturePacket`, which saves the journal
 *   before every page. Card I/O only: no mint is called.
 * - `settlePending` runs the engine's `reconcilePayment` for the card's
 *   captured packet: the mint is observed (restore, checkstate) before any
 *   swap, the swap's intent is saved before it goes out, and at most one
 *   `/v1/swap` is sent per call, under a per-card lock. Network only.
 *
 * A transient failure (offline, a timeout, PENDING, a card lost mid-read)
 * marks nothing done: the journal stays captured or submitted, and the next
 * tap observes before it swaps. A refusal that would repeat on every attempt
 * (`PERMANENT_REFUSALS`, or a swap the mint answered with a refusal) is
 * stored as a terminal `refused` entry: it is never retried, never blocks a
 * top-up or tidy, and the card's next record is captured as usual.
 */
import { CASHU_MINT_URL } from "@app/config/appinfo"

import { Transceiver } from "../cashu-card"
import { cardMintUrl, getCardBridge } from "../cashu-card-bridge"
import {
  RelayMintRequest,
  RelayNetworkError,
  createRelayRequest,
} from "../cashu-card-topup/mint"
import { knownRelayMint, sameMint } from "../cashu-card-topup/mint-url"
import { relayCrypto } from "./crypto"
import {
  OutboxEmpty,
  OutboxUnsupported,
  OUTBOX_PAGE_MAX,
  parseOutboxHeader,
  readOutboxPage,
  readOutboxScope,
} from "./outbox"
import {
  RelayCrypto,
  RelayFailure,
  RelayJournal,
  capturePacket,
  reconcilePayment,
} from "./relay"
import { RelayEntry, RelayStore, createRelayStore, isTerminal } from "./store"

export {
  OUTBOX_MIN_MINOR,
  OutboxEmpty,
  OutboxUnsupported,
  supportsOutbox,
  versionSupportsOutbox,
} from "./outbox"
export { RelayStoreError, createRelayStore } from "./store"
export type { RelayEntry, RelayStore } from "./store"

/** How long an operation tap waits for the relay's mint calls before it goes on. */
export const RELAY_SESSION_CAP_MS = 15000

/**
 * What a relay came to.
 * - `settled`: this phone's swap settled the payment. No amount: the
 *   packet's outputs include the card's own change, and nothing in the
 *   packet says which outputs are the till's.
 * - `already`: the mint had settled it before (the till, or an earlier tap).
 * - `nothing`: the card holds no record, or answers no GET_OUTBOX.
 * - `unknown-mint`: the packet's mint is not one this app knows; nothing was
 *   sent anywhere.
 * - `pending`: the mint holds the inputs PENDING, or did not answer in time.
 * - `refused`: the relay stopped on a refusal that repeats on every attempt
 *   (`code`, the engine's). Terminal: never retried, never blocks a top-up
 *   or tidy. `seen`: this phone had already stored the refusal (a later tap
 *   of the same record), so nothing new happened.
 * - `failed`: anything else (offline, a card lost mid-read, a bad packet).
 *   The journal keeps what was done, and the next tap goes on from there.
 */
export type RelayOutcome =
  | { kind: "settled" }
  | { kind: "already" }
  | { kind: "nothing" }
  | { kind: "unknown-mint" }
  | { kind: "pending" }
  | { kind: "refused"; code: string; seen?: boolean }
  | { kind: "failed"; error?: unknown }

/** What a capture came to: a packet saved for `settlePending`, or an outcome already. */
export type CaptureOutcome = { kind: "captured" } | RelayOutcome

/** A relay's mint call that resolves a known mint's JSON. */
export type RelayRequestFactory = (approvedUrl: string) => RelayMintRequest

export type RelayDeps = {
  store: RelayStore
  crypto: RelayCrypto
  /** The mints this app already speaks to: the packet's must be one. */
  knownMints: () => string[]
  /** The transport for an approved mint; never built for an unknown one. */
  request: RelayRequestFactory
}

/** The engine's refusal code (`RelayFailure`), if `err` is one. */
const relayFailureCode = (err: unknown): string | undefined =>
  err instanceof RelayFailure ? err.code : undefined

/**
 * The engine's refusals that come out the same on every attempt for the same
 * packet and mint (relay.js): a unit other than sat (`unit`, a packet's
 * header; `input-keyset` and `output-keyset`, a keyset the mint lists in
 * another unit, or not at all), the mint's fees (`fee-policy`), an output
 * keyset the mint has retired (`inactive-output-keyset`), and a packet that
 * does not match the entry it was captured for (`context`).
 * `settlement-unresolved` joins them only after a swap the mint refused
 * (`mintRefused`): sending the same swap again would be refused again.
 */
export const PERMANENT_REFUSALS: ReadonlySet<string> = new Set([
  "unit",
  "input-keyset",
  "output-keyset",
  "fee-policy",
  "inactive-output-keyset",
  "context",
])

/**
 * The mint answered the call with a refusal: a 4xx other than a timeout
 * (408) or a rate limit (429). Not reachable, a 5xx, or a timeout: not a
 * refusal, as the same call may go through later.
 */
const mintRefused = (err: unknown): boolean =>
  err instanceof RelayNetworkError &&
  err.status !== undefined &&
  err.status >= 400 &&
  err.status < 500 &&
  err.status !== 408 &&
  err.status !== 429

/** The refusal code to store as terminal, if `err` is one that would repeat. */
const permanentRefusal = (err: unknown, swapRefused: boolean): string | undefined => {
  const code = relayFailureCode(err)
  if (code === undefined) return undefined
  if (PERMANENT_REFUSALS.has(code)) return code
  if (code === "settlement-unresolved" && swapRefused) return code
  return undefined
}

/** The mints this app speaks to: `CASHU_MINT_URL` and the card mint (a dev bridge's, in development). */
const defaultKnownMints = (): string[] => [CASHU_MINT_URL, cardMintUrl()]

/** http only for the dev bridge's own local mint; https everywhere else. */
const defaultRequest: RelayRequestFactory = (approvedUrl) => {
  const devMint = getCardBridge()?.mintUrl
  return createRelayRequest(approvedUrl, {
    allowInsecure: devMint !== undefined && sameMint(devMint, approvedUrl),
  })
}

const policyOf = (
  entry: Pick<RelayEntry, "mintUrl" | "cardPubkey" | "installation">,
) => ({
  mint: entry.mintUrl,
  cardKey: entry.cardPubkey,
  installation: entry.installation,
})

export const createRelay = (deps: RelayDeps) => {
  const locks = new Map<string, Promise<unknown>>()
  const locked = <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const before = locks.get(key) ?? Promise.resolve()
    const run = before.then(work, work)
    const tail = run.catch(() => undefined)
    locks.set(key, tail)
    tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key)
    })
    return run
  }

  const capture = async (
    transceive: Transceiver,
    base: Omit<RelayEntry, "journal" | "updatedAt">,
    prior?: RelayJournal,
  ): Promise<RelayJournal> =>
    capturePacket({
      policy: policyOf(base),
      crypto: deps.crypto,
      readScope: () => readOutboxScope(transceive),
      readPage: (offset, count) => readOutboxPage(transceive, offset, count),
      save: (journal) => deps.store.put({ ...base, journal }),
      ...(prior ? { journal: prior } : {}),
    })

  /** Stores the entry of `cardPubkey`'s `scopeHex` as refused (`code`): terminal from now on. */
  const refuse = async (
    cardPubkey: string,
    scopeHex: string,
    code: string,
  ): Promise<RelayOutcome> => {
    const saved = (await deps.store.forCard(cardPubkey)).find(
      (entry) => entry.scopeHex === scopeHex,
    )
    if (saved) {
      const { updatedAt: _updatedAt, ...rest } = saved
      await deps.store.put({ ...rest, refused: code })
    }
    return { kind: "refused", code }
  }

  /**
   * Reads the card's payment record into the journal, card I/O only. Call it
   * on a 2.2 card (`supportsOutbox`) whose key this tap read (`card.pubkey`,
   * GET_PUBKEY or a verified read), with the card's record mint when the tap
   * read it. `onSettling` is called once there is a record to capture.
   *
   * - A captured packet not yet settled: the card is not read at all (a
   *   relay killed after its capture resumes from the journal).
   * - A partial capture: resumed where it stopped; a newer record on the
   *   card (`capture-scope`) drops it and starts again.
   * - No record (6A88) or no GET_OUTBOX: `nothing`. The record this phone
   *   already saw settled (same scope): `already`, with no page read.
   * - The packet's mint is checked before anything is captured or sent.
   * - A card whose pieces are in a unit other than sat (`card.unit`, as the
   *   mint named it): `nothing`, with no GET_OUTBOX. The packet's unit is
   *   always sat (spec/APDU.md, GET_OUTBOX), so its keysets would be refused.
   * - A refused record (`refused`, stored): `refused` with `seen`, no page
   *   read. A capture that stops on a repeating refusal stores it so.
   *
   * A store read failure throws: it never reads as "nothing saved".
   */
  const captureOutbox = async ({
    transceive,
    card,
    onSettling,
  }: {
    transceive: Transceiver
    card: { pubkey: string; recordMint?: string; unit?: string }
    onSettling?: () => void
  }): Promise<CaptureOutcome> => {
    if (card.unit !== undefined && card.unit !== "sat") return { kind: "nothing" }
    const entries = await deps.store.forCard(card.pubkey)
    const open = entries.find((entry) => !isTerminal(entry))
    if (open && open.journal.state !== "capturing") return { kind: "captured" }
    // The record this capture is reading, once known: a refusal is stored on it.
    let reading: string | undefined = open?.scopeHex
    try {
      if (open) {
        onSettling?.()
        try {
          const { journal, updatedAt: _updatedAt, ...base } = open
          await capture(transceive, base, journal)
          return { kind: "captured" }
        } catch (err) {
          if (err instanceof OutboxEmpty || err instanceof OutboxUnsupported) {
            await deps.store.remove(open.cardPubkey, open.scopeHex)
            return { kind: "nothing" }
          }
          if (relayFailureCode(err) !== "capture-scope") throw err
          // A newer record replaced the one this capture was reading.
          await deps.store.remove(open.cardPubkey, open.scopeHex)
        }
      }
      let scope: number[]
      try {
        scope = await readOutboxScope(transceive)
      } catch (err) {
        if (err instanceof OutboxEmpty || err instanceof OutboxUnsupported) {
          return { kind: "nothing" }
        }
        throw err
      }
      const scopeHex = scope.map((b) => b.toString(16).padStart(2, "0")).join("")
      const done = entries.find(
        (entry) => isTerminal(entry) && entry.scopeHex === scopeHex,
      )
      if (done?.refused !== undefined) {
        return { kind: "refused", code: done.refused, seen: true }
      }
      if (done) return { kind: "already" }
      reading = scopeHex
      // The header, for the policy: the installation and the mint.
      const header = parseOutboxHeader(
        await readOutboxPage(transceive, 0, OUTBOX_PAGE_MAX),
      )
      if (header.cardKey !== card.pubkey) {
        return {
          kind: "failed",
          error: new Error("the packet names another card key than the tapped card's"),
        }
      }
      if (!knownRelayMint(header.mint, card.recordMint, deps.knownMints())) {
        return { kind: "unknown-mint" }
      }
      onSettling?.()
      await capture(transceive, {
        cardPubkey: card.pubkey,
        scopeHex,
        mintUrl: header.mint,
        installation: header.installation,
        swaps: 0,
      })
      return { kind: "captured" }
    } catch (err) {
      const code = permanentRefusal(err, false)
      if (code !== undefined && reading !== undefined) {
        try {
          return await refuse(card.pubkey, reading, code)
        } catch (storeErr) {
          return { kind: "failed", error: storeErr }
        }
      }
      return { kind: "failed", error: err }
    }
  }

  /**
   * Settles the card's captured packet at its mint, network only, under a
   * per-card lock: two calls at once make one swap between them.
   */
  const settlePending = (cardPubkey: string): Promise<RelayOutcome> =>
    locked(cardPubkey, async () => {
      const entries = await deps.store.forCard(cardPubkey)
      const entry = entries.find((e) => !isTerminal(e) && e.journal.state !== "capturing")
      if (!entry) {
        const last = entries.find(isTerminal)
        if (last?.refused !== undefined) {
          return { kind: "refused", code: last.refused, seen: true }
        }
        return last ? { kind: "already" } : { kind: "nothing" }
      }
      const approved = knownRelayMint(entry.mintUrl, undefined, deps.knownMints())
      if (!approved) return { kind: "unknown-mint" }
      const policy = policyOf(entry)
      let swaps = entry.swaps
      let journal = entry.journal
      // The mint answered this call's swap with a refusal (`mintRefused`).
      let swapRefused = false
      const save = (next: RelayJournal) => {
        journal = next
        return deps.store.put({ ...entry, journal: next, swaps })
      }
      try {
        const request = deps.request(approved)
        const counted: RelayMintRequest = async (route, body) => {
          if (route !== "/v1/swap") return request(route, body)
          swaps += 1
          try {
            return await request(route, body)
          } catch (err) {
            if (mintRefused(err)) swapRefused = true
            throw err
          }
        }
        const result = await reconcilePayment({
          journal: entry.journal,
          policy,
          crypto: deps.crypto,
          request: counted,
          save,
        })
        if (result.state === "outputs-confirmed") {
          return swaps > 0 ? { kind: "settled" } : { kind: "already" }
        }
        if (result.state === "pending") return { kind: "pending" }
        return {
          kind: "failed",
          error: new Error(`the relay stopped at ${result.state}`),
        }
      } catch (err) {
        const code = permanentRefusal(err, swapRefused)
        if (code === undefined) return { kind: "failed", error: err }
        try {
          const { updatedAt: _updatedAt, ...rest } = entry
          await deps.store.put({ ...rest, journal, swaps, refused: code })
        } catch (storeErr) {
          return { kind: "failed", error: storeErr }
        }
        return { kind: "refused", code }
      }
    })

  /** `settlePending`, or `pending` once `ms` has passed: the settle goes on behind it, still locked. */
  const settleWithin = (cardPubkey: string, ms = RELAY_SESSION_CAP_MS) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const capped = new Promise<RelayOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "pending" }), ms)
    })
    return Promise.race([settlePending(cardPubkey), capped]).finally(() =>
      clearTimeout(timer),
    )
  }

  return { captureOutbox, settlePending, settleWithin }
}

export type Relay = ReturnType<typeof createRelay>

let defaultRelay: Relay | undefined

/** The app's relay: the Keychain store, the app's crypto, the known mints and the raw-JSON transport. */
export const appRelay = (): Relay => {
  if (!defaultRelay) {
    defaultRelay = createRelay({
      store: createRelayStore(),
      crypto: relayCrypto,
      knownMints: defaultKnownMints,
      request: defaultRequest,
    })
  }
  return defaultRelay
}

/**
 * An operation that changes the card's slots (a top-up, a tidy) was not run:
 * the card's last payment could not be settled first (`pending` or `failed`;
 * a `refused` payment never blocks, as it would block for good).
 * Not a `CardError`: the card refused nothing, and no re-read follows.
 */
export class RelayUnsettledError extends Error {
  constructor(readonly outcome: RelayOutcome) {
    super(`the card's last payment could not be settled yet (${outcome.kind})`)
    this.name = "RelayUnsettledError"
  }
}
