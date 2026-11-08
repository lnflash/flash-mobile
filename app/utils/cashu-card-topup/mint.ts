import {
  Amount,
  Mint,
  MintKeys,
  Proof,
  SerializedBlindedMessage,
  SerializedBlindedSignature,
} from "@cashu/cashu-ts"

import { KeysetIdError, cardPrefix, resolveCardKeyset } from "./keyset-id"
import type { CardUnit } from "./types"

/**
 * NUT-04 quote states: the mint's word on whether its invoice was paid.
 * Nutshell also answers PENDING while a mint call for the quote is running
 * (its MintQuoteState), which ends ISSUED, or PAID again if the call failed.
 */
export type QuoteState = "UNPAID" | "PAID" | "PENDING" | "ISSUED"

const QUOTE_STATES: readonly string[] = ["UNPAID", "PAID", "PENDING", "ISSUED"]

/** NUT-07 proof states: whether the mint has seen a proof spent. */
export type ProofState = "UNSPENT" | "PENDING" | "SPENT"

const PROOF_STATES: readonly string[] = ["UNSPENT", "PENDING", "SPENT"]

export type TopUpQuote = {
  quote: string
  request: string
  unit: string
  amount: number
  state: QuoteState
  expiry: number | null
  pubkey?: string
}

/** The mint calls a top-up makes, over the mint the app is connected to. */
export type TopUpMint = {
  url: string
  /**
   * The active keyset for `unit`, with its keys, under the mint's full id (a
   * v1 or a v2 id). Refused when a card could not tell it from another of the
   * mint's keysets: one whose first 8 bytes, all a card slot holds, are
   * another listed keyset's too.
   */
  activeKeyset: (unit: CardUnit) => Promise<MintKeys>
  /** Keyset `id`, the mint's full id exactly (never a card's prefix), with its keys. */
  keyset: (id: string) => Promise<MintKeys>
  createQuote: (args: {
    unit: CardUnit
    amount: number
    /** NUT-20: only a signature from this key can mint the quote. */
    pubkey: string
  }) => Promise<TopUpQuote>
  quoteState: (quote: string) => Promise<QuoteState>
  mint: (args: {
    quote: string
    outputs: SerializedBlindedMessage[]
    signature: string
  }) => Promise<SerializedBlindedSignature[]>
  /** NUT-09: the signatures the mint already made on these outputs. */
  restore: (outputs: SerializedBlindedMessage[]) => Promise<{
    outputs: SerializedBlindedMessage[]
    signatures: SerializedBlindedSignature[]
  }>
  /**
   * NUT-07: the state of each proof, by its Y = hash_to_curve(secret), in the
   * order asked. Every Y must come back with a known state, or this throws.
   */
  proofStates: (Ys: string[]) => Promise<ProofState[]>
  /**
   * NUT-03: swap `inputs` for signatures on `outputs`, in order (a card tidy,
   * ENG-702). The inputs carry their witness as the card signed them.
   */
  swap: (
    inputs: Proof[],
    outputs: SerializedBlindedMessage[],
  ) => Promise<SerializedBlindedSignature[]>
  /**
   * NUT-02: the `input_fee_ppk` of the keyset card id `id` names (a v1 id, or
   * a v2 id's 8-byte prefix: `resolveCardKeyset`), 0 when the mint states
   * none. Throws when it names no single keyset, or one the mint does not
   * list as active: a swap's outputs must be in an active keyset.
   */
  feePpk: (id: string) => Promise<number>
  /**
   * The mint's full id for card id `cardId`, and its fee, as `feePpk`
   * resolves and checks it. A tidy resolves once and keeps the full id: a
   * resumed one never asks again (the catalogue may have changed since).
   */
  resolveCardKeyset: (cardId: string) => Promise<{ id: string; feePpk: number }>
}

/**
 * A keyset id a card slot can name: a v1 id (8 bytes) whole, or a v2 id (33
 * bytes) by its first 8. Anything else is refused before anything is minted.
 */
const MINT_KEYSET_ID = /^([0-9a-f]{16}|[0-9a-f]{66})$/

export class TopUpMintError extends Error {
  /** Set when a card's keyset id named no single keyset (`resolveCardKeyset`). */
  readonly reason?: KeysetIdError["reason"]

  constructor(message: string, reason?: KeysetIdError["reason"]) {
    super(message)
    this.name = "TopUpMintError"
    this.reason = reason
  }
}

export const createTopUpMint = (url: string): TopUpMint => {
  const mint = new Mint(url)
  const keysets = new Map<string, Promise<MintKeys>>()

  const keyset = (id: string): Promise<MintKeys> => {
    let cached = keysets.get(id)
    if (!cached) {
      cached = mint.getKeys(id).then(({ keysets: found }) => {
        const match = found.find((k) => k.id === id)
        if (!match) throw new TopUpMintError(`the mint does not publish keyset ${id}`)
        return match
      })
      keysets.set(id, cached)
      // A failed fetch is not cached: the next call asks again.
      cached.catch(() => keysets.delete(id))
    }
    return cached
  }

  const resolveActive = async (
    cardId: string,
  ): Promise<{ id: string; feePpk: number }> => {
    const { keysets: all } = await mint.getKeySets()
    let id: string
    try {
      id = resolveCardKeyset(
        cardId,
        all.map((k) => k.id),
      )
    } catch (err) {
      if (err instanceof KeysetIdError) throw new TopUpMintError(err.message, err.reason)
      throw err
    }
    const found = all.find((k) => k.id === id)
    if (!found?.active) {
      throw new TopUpMintError(`the mint does not list keyset ${id} as active`)
    }
    return { id, feePpk: found.input_fee_ppk ?? 0 }
  }

  return {
    url,
    keyset,
    activeKeyset: async (unit) => {
      const { keysets: all } = await mint.getKeySets()
      const active = all
        .filter((k) => k.unit === unit && k.active)
        .sort((a, b) => (a.input_fee_ppk ?? 0) - (b.input_fee_ppk ?? 0))
      if (active.length === 0) {
        throw new TopUpMintError(`the mint has no active ${unit} keyset`)
      }
      const [chosen] = active
      if (!MINT_KEYSET_ID.test(chosen.id)) {
        throw new TopUpMintError(`keyset ${chosen.id} is not a NUT-02 v1 or v2 id`)
      }
      // A card names the keyset by its first 8 bytes: another keyset with the
      // same ones (active or not) would make the pieces minted here ambiguous.
      const prefix = cardPrefix(chosen.id)
      if (all.some((k) => k.id !== chosen.id && cardPrefix(k.id) === prefix)) {
        throw new TopUpMintError(
          `keyset ${chosen.id} shares its card id ${prefix} with another of the mint's keysets`,
          "keyset-ambiguous",
        )
      }
      return keyset(chosen.id)
    },
    createQuote: async ({ unit, amount, pubkey }) => {
      const quote = await mint.createMintQuoteBolt11({ unit, amount, pubkey })
      return {
        quote: quote.quote,
        request: quote.request,
        unit: quote.unit,
        amount: Amount.from(quote.amount).toNumber(),
        state: quote.state,
        expiry: quote.expiry ?? null,
        pubkey: quote.pubkey,
      }
    },
    quoteState: async (quote) => {
      // Typed as three states; Nutshell can also answer PENDING. Anything
      // else is refused rather than read as "not unpaid", which is "paid".
      const { state } = await mint.checkMintQuoteBolt11(quote)
      if (!QUOTE_STATES.includes(state)) {
        throw new TopUpMintError(`the mint answered an unknown quote state (${state})`)
      }
      return state as QuoteState
    },
    mint: async (payload) => (await mint.mintBolt11(payload)).signatures,
    swap: async (inputs, outputs) => (await mint.swap({ inputs, outputs })).signatures,
    feePpk: async (id) => (await resolveActive(id)).feePpk,
    resolveCardKeyset: resolveActive,
    restore: (outputs) => mint.restore({ outputs }),
    proofStates: async (Ys) => {
      const { states } = await mint.check({ Ys })
      // Paired by Y, not by position, as cashu-client's checkProofStates
      // does: a verdict read against the wrong proof is worse than none.
      const byY = new Map(states.map((entry) => [entry.Y.toLowerCase(), entry.state]))
      return Ys.map((Y) => {
        const state = byY.get(Y.toLowerCase())
        if (state === undefined || !PROOF_STATES.includes(state)) {
          throw new TopUpMintError(`the mint gave no known state for proof ${Y}`)
        }
        return state as ProofState
      })
    },
  }
}

/**
 * A mint call the assisted-settlement relay makes (ENG-820): a route under
 * the approved mint and an optional JSON body. Resolves the mint's JSON as it
 * came, snake_case fields and all, which the vendored engine reads directly.
 */
export type RelayMintRequest = (route: string, body?: unknown) => Promise<unknown>

/**
 * The keyset ids a relay may ask keys for: NUT-02 v1 (8 bytes, `00` ‖ 14
 * hex) and v2 (33 bytes, `01` ‖ 64 hex), by the version byte. Narrower
 * than a top-up's `activeKeyset`, which takes any 16- or 66-hex id the mint
 * lists: the relay asks keys by an id a packet names.
 */
export const RELAY_KEYSET_ID = /^(00[0-9a-f]{14}|01[0-9a-f]{64})$/

/** The longest a relay's mint call waits, and the most it reads back. */
export const RELAY_TIMEOUT_MS = 15000
export const RELAY_MAX_RESPONSE_BYTES = 1024 * 1024

const RELAY_GET = /^\/v1\/(keysets|keys\/([0-9a-f]+))$/
const RELAY_POST = ["/v1/restore", "/v1/checkstate", "/v1/swap"]

/**
 * A relay's mint call that did not come back as JSON from a 2xx. `status` is
 * the mint's HTTP status when it answered (a non-2xx); absent when it could
 * not be reached, timed out, or its answer could not be read.
 */
export class RelayNetworkError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "RelayNetworkError"
  }
}

/** A relay's mint call refused before anything was sent: a route, id or URL not allowed. */
export class RelayRouteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RelayRouteError"
  }
}

/** Which call `route` (with or without a body) is, or a `RelayRouteError`. */
const relayMethod = (route: string, body: unknown): "GET" | "POST" => {
  if (typeof route !== "string") throw new RelayRouteError("the route is not a string")
  const get = RELAY_GET.exec(route)
  if (get) {
    if (body !== undefined) throw new RelayRouteError(`${route} takes no body`)
    if (get[2] !== undefined && !RELAY_KEYSET_ID.test(get[2])) {
      throw new RelayRouteError(`keyset id ${get[2]} is not a NUT-02 id`)
    }
    return "GET"
  }
  if (RELAY_POST.includes(route)) {
    if (body === undefined || body === null || typeof body !== "object") {
      throw new RelayRouteError(`${route} needs a JSON body`)
    }
    return "POST"
  }
  throw new RelayRouteError(`${route} is not a route the relay may call`)
}

/**
 * The relay's mint transport: a raw-JSON fetch client bound to `url`, an
 * approved mint (`knownRelayMint`), never one a packet names. Raw JSON, not
 * cashu-ts: the engine reads the mint's own field names and `Y`, and cashu-ts
 * may rewrite a 33-byte keyset id.
 *
 * Only `GET /v1/keysets`, `GET /v1/keys/{id}` (a NUT-02 id) and `POST
 * /v1/restore`, `/v1/checkstate`, `/v1/swap`: any other route or id throws
 * before a request is made. https only; `allowInsecure` admits http for the
 * dev bridge's local mint. Every call has a `RELAY_TIMEOUT_MS` timeout and a
 * `RELAY_MAX_RESPONSE_BYTES` cap, and a non-2xx or non-JSON answer is a
 * `RelayNetworkError`. `createTopUpMint` is not touched by any of this.
 */
export const createRelayRequest = (
  url: string,
  {
    allowInsecure = false,
    fetchImpl = (input: string, init: RequestInit) => fetch(input, init),
    timeoutMs = RELAY_TIMEOUT_MS,
  }: {
    allowInsecure?: boolean
    fetchImpl?: (input: string, init: RequestInit) => Promise<Response>
    timeoutMs?: number
  } = {},
): RelayMintRequest => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new RelayRouteError(`${url} is not a URL`)
  }
  const schemeOk =
    parsed.protocol === "https:" || (allowInsecure && parsed.protocol === "http:")
  if (!schemeOk || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new RelayRouteError(`${url} is not a mint URL the relay may call`)
  }
  const base = url.replace(/\/+$/, "")
  return async (route, body) => {
    const method = relayMethod(route, body)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let text: string
    try {
      let response: Response
      try {
        response = await fetchImpl(base + route, {
          method,
          headers:
            method === "POST"
              ? { "Accept": "application/json", "Content-Type": "application/json" }
              : { Accept: "application/json" },
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        })
      } catch (err) {
        throw new RelayNetworkError(
          `${route}: the mint could not be reached (${
            err instanceof Error ? err.message : err
          })`,
        )
      }
      if (!response.ok) {
        throw new RelayNetworkError(
          `${route}: the mint answered ${response.status}`,
          response.status,
        )
      }
      const declared = Number(response.headers?.get?.("content-length") ?? NaN)
      if (Number.isFinite(declared) && declared > RELAY_MAX_RESPONSE_BYTES) {
        throw new RelayNetworkError(`${route}: the mint's answer is too large`)
      }
      try {
        text = await response.text()
      } catch (err) {
        throw new RelayNetworkError(
          `${route}: the mint's answer was cut off (${
            err instanceof Error ? err.message : err
          })`,
        )
      }
    } finally {
      clearTimeout(timer)
    }
    if (text.length > RELAY_MAX_RESPONSE_BYTES) {
      throw new RelayNetworkError(`${route}: the mint's answer is too large`)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new RelayNetworkError(`${route}: the mint's answer is not JSON`)
    }
  }
}
