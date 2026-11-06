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
 * Nothing is marked done on a failure: the journal stays captured or
 * submitted, and the next tap observes before it swaps.
 */
import { CASHU_MINT_URL } from "@app/config/appinfo"

import { Transceiver } from "../cashu-card"
import { cardMintUrl, getCardBridge } from "../cashu-card-bridge"
import { RelayMintRequest, createRelayRequest } from "../cashu-card-topup/mint"
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
  RelayPolicy,
  capturePacket,
  decodePacket,
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
 * - `settled`: this phone's swap settled the payment; `sats` is the sum of
 *   the packet's outputs.
 * - `already`: the mint had settled it before (the till, or an earlier tap).
 * - `nothing`: the card holds no record, or answers no GET_OUTBOX.
 * - `unknown-mint`: the packet's mint is not one this app knows; nothing was
 *   sent anywhere.
 * - `pending`: the mint holds the inputs PENDING, or did not answer in time.
 * - `failed`: anything else (offline, a refusal, a bad packet). The journal
 *   keeps what was done, and the next tap goes on from there.
 */
export type RelayOutcome =
  | { kind: "settled"; sats: number }
  | { kind: "already" }
  | { kind: "nothing" }
  | { kind: "unknown-mint" }
  | { kind: "pending" }
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

/** The mints this app speaks to: `CASHU_MINT_URL` and the card mint (a dev bridge's, in development). */
const defaultKnownMints = (): string[] => [CASHU_MINT_URL, cardMintUrl()]

/** http only for the dev bridge's own local mint; https everywhere else. */
const defaultRequest: RelayRequestFactory = (approvedUrl) => {
  const devMint = getCardBridge()?.mintUrl
  return createRelayRequest(approvedUrl, {
    allowInsecure: devMint !== undefined && sameMint(devMint, approvedUrl),
  })
}

const sumOutputs = (journal: RelayJournal, policy: RelayPolicy, crypto: RelayCrypto) =>
  decodePacket(
    (journal.packet?.match(/../g) ?? []).map((h) => parseInt(h, 16)),
    policy,
    crypto,
  ).outputs.reduce((n, output) => n + output.amount, 0)

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
   *
   * A store read failure throws: it never reads as "nothing saved".
   */
  const captureOutbox = async ({
    transceive,
    card,
    onSettling,
  }: {
    transceive: Transceiver
    card: { pubkey: string; recordMint?: string }
    onSettling?: () => void
  }): Promise<CaptureOutcome> => {
    const entries = await deps.store.forCard(card.pubkey)
    const open = entries.find((entry) => !isTerminal(entry))
    if (open && open.journal.state !== "capturing") return { kind: "captured" }
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
      if (entries.some((entry) => isTerminal(entry) && entry.scopeHex === scopeHex)) {
        return { kind: "already" }
      }
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
        return entries.some(isTerminal) ? { kind: "already" } : { kind: "nothing" }
      }
      const approved = knownRelayMint(entry.mintUrl, undefined, deps.knownMints())
      if (!approved) return { kind: "unknown-mint" }
      const policy = policyOf(entry)
      let swaps = entry.swaps
      const save = (journal: RelayJournal) => deps.store.put({ ...entry, journal, swaps })
      try {
        const request = deps.request(approved)
        const counted: RelayMintRequest = (route, body) => {
          if (route === "/v1/swap") swaps += 1
          return request(route, body)
        }
        const result = await reconcilePayment({
          journal: entry.journal,
          policy,
          crypto: deps.crypto,
          request: counted,
          save,
        })
        if (result.state === "outputs-confirmed") {
          return swaps > 0
            ? { kind: "settled", sats: sumOutputs(result, policy, deps.crypto) }
            : { kind: "already" }
        }
        if (result.state === "pending") return { kind: "pending" }
        return {
          kind: "failed",
          error: new Error(`the relay stopped at ${result.state}`),
        }
      } catch (err) {
        return { kind: "failed", error: err }
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
 * the card's last payment could not be settled first (`pending` or `failed`).
 * Not a `CardError`: the card refused nothing, and no re-read follows.
 */
export class RelayUnsettledError extends Error {
  constructor(readonly outcome: RelayOutcome) {
    super(`the card's last payment could not be settled yet (${outcome.kind})`)
    this.name = "RelayUnsettledError"
  }
}
