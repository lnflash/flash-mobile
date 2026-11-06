/**
 * Types for the vendored engine beside this file (relay.js, cashucard's
 * tools/assisted-relay/relay.js at the commit RELAY_PIN.json names). The
 * engine is plain JavaScript and `tsconfig.json` sets `allowJs: false`, so
 * these declarations are what the app type-checks against. They describe the
 * engine at the pinned commit; vendoring a new commit means reading it again.
 */

/** Bytes as the engine takes them: an array of 0-255 or a Uint8Array. */
export type RelayBytes = number[] | Uint8Array

/** Cryptography the caller injects (relay.js README, Portable engine). */
export type RelayCrypto = {
  /** SHA-256 of `bytes`. */
  hash: (bytes: number[]) => number[] | Uint8Array
  /** BIP-340 verification of `signature` over `message` by the compressed `key`. */
  verify: (signature: number[], message: RelayBytes, key: number[]) => boolean
  /** Whether `bytes` is a valid compressed secp256k1 point: strictly `true` or `false`. */
  point: (bytes: number[]) => boolean
  /** hash_to_curve(secret), compressed, as hex (NUT-00). */
  proofY: (secret: string) => string
  /** The blinded DLEQ of `signature` on `output` by the amount key `key` (NUT-12). */
  dleq: (
    output: { amount: number; id: string; B_: string },
    signature: {
      id: string
      amount: number
      C_: string
      dleq: { e: string; s: string }
    },
    key: string,
  ) => boolean
}

/** What a packet must be bound to: decodePacket refuses any other (`context`). */
export type RelayPolicy = {
  /** The packet's mint, exactly as the packet spells it (compared with `===`). */
  mint: string
  /** The card key, 33 bytes compressed, as hex. */
  cardKey: string
  /** The card's installation, 32 bytes, as hex. */
  installation: string
}

export type RelayJournalState =
  | "capturing"
  | "captured"
  | "submitted"
  | "pending"
  | "outputs-confirmed"

export type RelayJournal = {
  format: "private-assisted-relay-v1"
  state: RelayJournalState
  /** The 45-byte scope, as hex. */
  scope: string
  pages?: { offset: number; data: string; receivedBytes?: number }[]
  pending?: { offset: number; count: number }
  /** The whole packet, as hex, once captured. */
  packet?: string
  evidence?: {
    packetId: string
    outputs: { amount: number; id: string; B_: string }[]
    signatures: unknown[]
    inputsSpent: true
  }
}

export type RelayOutput = { amount: number; id: string; B_: string }

export type RelayInput = {
  slot: number
  generation: number
  amount: number
  id: string
  nonce: string
  secret: string
  C: string
}

export type DecodedPacket = {
  cardKey: string
  installation: string
  paymentId: string
  index: number
  generation: number
  mint: string
  unit: "sat"
  inputs: RelayInput[]
  outputs: RelayOutput[]
  witness: string
  packetId: string
  paymentMessage: string
  scope: string
}

/** An approved mint call: a route under the caller's mint and an optional JSON body. */
export type RelayRequest = (route: string, body?: unknown) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any

export class RelayFailure extends Error {
  code: string
}

export function decodePacket(
  raw: RelayBytes,
  policy: RelayPolicy,
  crypto: RelayCrypto,
): DecodedPacket

export function capturePacket(args: {
  policy: RelayPolicy
  crypto: RelayCrypto
  readScope: () => Promise<RelayBytes>
  readPage: (offset: number, count: number) => Promise<RelayBytes>
  save: (journal: RelayJournal) => Promise<unknown>
  journal?: RelayJournal
}): Promise<RelayJournal>

export function reconcilePayment(args: {
  journal: RelayJournal
  policy: RelayPolicy
  crypto: RelayCrypto
  request: RelayRequest
  save: (journal: RelayJournal) => Promise<unknown>
}): Promise<RelayJournal>
