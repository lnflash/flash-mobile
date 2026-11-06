/* eslint-disable no-bitwise -- the packet's big-endian fields */
/**
 * ENG-820 test doubles for the assisted-settlement relay:
 * - `RECORDED_PACKET`: ENG-819's recording of a real 2-in/2-out packet from
 *   the applet in cardsim (`__tests__/fixtures/relay-packet-494.hex`), never
 *   invented here. Its card key is the simulator's, whose private key no one
 *   holds, so it is relayed but never re-signed.
 * - `buildRelayPacket`: the same layout (cashucard spec/APDU.md, The packet)
 *   signed by a key a spec holds, for a fake card whose AUTH a read tap
 *   checks, or a second record on the same card. Its body is held to the
 *   recording's byte for byte (`cashu-card-relay.spec.ts`).
 * - `relayMintFor`: the fake mint (`fake-cashu.ts`) behind the five routes
 *   the relay calls, as raw JSON, counting every call per route.
 */
import * as fs from "fs"
import * as path from "path"
import { Proof, SerializedBlindedMessage, hashToCurve } from "@cashu/cashu-ts"
import { schnorr, secp256k1 } from "@noble/curves/secp256k1"
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import { toHex } from "../../app/utils/cashu-card"
import type { FakeMint } from "./fake-cashu"

const fromHex = (hex: string): number[] =>
  (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))
const u = (n: number, bytes: number) =>
  Array.from({ length: bytes }, (_, i) => Math.floor(n / 256 ** (bytes - 1 - i)) % 256)

/** The ENG-819 recording, its header comment dropped. */
export const RECORDED_PACKET: number[] = fromHex(
  fs
    .readFileSync(path.join(__dirname, "..", "fixtures", "relay-packet-494.hex"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .join("")
    .trim(),
)

export type PacketInput = {
  slot: number
  generation: number
  amount: number
  keysetId: string
  nonce: string
  C: string
}
export type PacketOutput = { amount: number; keysetId: string; B_: string }

export type PacketFields = {
  cardKey: string
  installation: string
  paymentId: number
  index: number
  generation: number
  mint: string
  inputs: PacketInput[]
  outputs: PacketOutput[]
}

/** The packet's fields, read by the layout (not by the engine), for building another like it. */
export const packetFields = (packet: number[]): PacketFields & { witness: string } => {
  let at = 0
  const take = (n: number) => {
    const v = packet.slice(at, at + n)
    at += n
    return v
  }
  const num = (n: number) => take(n).reduce((v, b) => v * 256 + b, 0)
  take(7)
  const cardKey = toHex(take(33))
  const installation = toHex(take(32))
  const paymentId = num(8)
  const index = num(1)
  const generation = num(4)
  take(1)
  const mint = String.fromCharCode(...take(num(2)))
  take(1)
  const inputs = Array.from({ length: num(1) }, () => ({
    slot: num(1),
    generation: num(4),
    amount: num(4),
    keysetId: toHex(take(num(1))),
    nonce: toHex(take(32)),
    C: toHex(take(33)),
  }))
  const outputs = Array.from({ length: num(1) }, () => ({
    amount: num(4),
    keysetId: toHex(take(num(1))),
    B_: toHex(take(33)),
  }))
  const witness = toHex(take(64))
  return {
    cardKey,
    installation,
    paymentId,
    index,
    generation,
    mint,
    inputs,
    outputs,
    witness,
  }
}

/** The card's undated P2PK SIG_ALL secret (NUT-CCP), as the engine rebuilds it. */
export const cardSecret = (nonce: string, cardKey: string) =>
  JSON.stringify(["P2PK", { nonce, data: cardKey, tags: [["sigflag", "SIG_ALL"]] }])

const sigAllMessage = (fields: PacketFields) =>
  sha256(
    Uint8Array.from(
      ascii(
        fields.inputs.map((i) => cardSecret(i.nonce, fields.cardKey) + i.C).join("") +
          fields.outputs.map((o) => String(o.amount) + o.B_).join(""),
      ),
    ),
  )

/** The body up to the witness, from `fields`. */
const bodyHead = (fields: PacketFields): number[] => [
  ...ascii("CCP-AS"),
  0x01,
  ...fromHex(fields.cardKey),
  ...fromHex(fields.installation),
  ...u(fields.paymentId, 8),
  fields.index,
  ...u(fields.generation, 4),
  0x01,
  ...u(fields.mint.length, 2),
  ...ascii(fields.mint),
  0x00,
  fields.inputs.length,
  ...fields.inputs.flatMap((i) => [
    i.slot,
    ...u(i.generation, 4),
    ...u(i.amount, 4),
    i.keysetId.length / 2,
    ...fromHex(i.keysetId),
    ...fromHex(i.nonce),
    ...fromHex(i.C),
  ]),
  fields.outputs.length,
  ...fields.outputs.flatMap((o) => [
    ...u(o.amount, 4),
    o.keysetId.length / 2,
    ...fromHex(o.keysetId),
    ...fromHex(o.B_),
  ]),
]

/** `fields`' body less its witness: the bytes a recorded packet and a built one share. */
export const unsignedBody = (fields: PacketFields): number[] => bodyHead(fields)

/** A packet as a 2.2 card serves it, both signatures by `cardPrivateKey`. */
export const buildRelayPacket = (
  cardPrivateKey: string,
  fields: Omit<PacketFields, "cardKey">,
): number[] => {
  const cardKey = toHex(secp256k1.getPublicKey(cardPrivateKey, true))
  const all = { ...fields, cardKey }
  const witness = Array.from(schnorr.sign(sigAllMessage(all), cardPrivateKey))
  const body = [...bodyHead(all), ...witness]
  const tag = sha256(Uint8Array.from(ascii("CashuCard/assisted-settlement/v1")))
  const descriptor = Array.from(
    schnorr.sign(sha256(Uint8Array.from([...tag, ...tag, ...body])), cardPrivateKey),
  )
  return [...body, ...descriptor]
}

/** A real compressed point: k·G. */
export const pointOf = (k: bigint) =>
  toHex(secp256k1.ProjectivePoint.BASE.multiply(k).toRawBytes(true))

/** A 2-in/2-out payment like the recording's, under `keysetId`, at `mint`. */
export const samplePayment = (
  keysetId: string,
  mint: string,
  { paymentId = 1, seed = 1 }: { paymentId?: number; seed?: number } = {},
): Omit<PacketFields, "cardKey"> => ({
  installation: "5a".repeat(32),
  paymentId,
  index: 0,
  generation: 1,
  mint,
  inputs: [
    {
      slot: 0,
      generation: 1,
      amount: 8,
      keysetId,
      nonce: toHex(u(seed, 32)),
      C: pointOf(BigInt(11 + seed)),
    },
    {
      slot: 1,
      generation: 1,
      amount: 4,
      keysetId,
      nonce: toHex(u(seed + 1000, 32)),
      C: pointOf(BigInt(13 + seed)),
    },
  ],
  outputs: [
    { amount: 8, keysetId, B_: pointOf(BigInt(17 + seed)) },
    { amount: 4, keysetId, B_: pointOf(BigInt(19 + seed)) },
  ],
})

export type RelayMintDouble = {
  request: (route: string, body?: unknown) => Promise<unknown>
  /** Calls per route, `/v1/keys/{id}` counted as `/v1/keys`. */
  calls: Record<string, number>
  /** Every route asked, in order. */
  log: string[]
  /** Makes every call throw, as an offline mint. */
  offline: (on: boolean) => void
}

/** The fake mint behind the relay's five routes, as Nutshell's JSON. */
export const relayMintFor = (mint: FakeMint): RelayMintDouble => {
  const calls: Record<string, number> = {}
  const log: string[] = []
  let down = false
  const keysets = async () => {
    const sat = await mint.keyset(mint.keysetId)
    return [sat]
  }
  const request = async (route: string, body?: unknown): Promise<unknown> => {
    const name = route.startsWith("/v1/keys/") ? "/v1/keys" : route
    calls[name] = (calls[name] ?? 0) + 1
    log.push(route)
    if (down) throw new Error("the mint is offline")
    const b = body as Record<string, unknown>
    switch (name) {
      case "/v1/keysets":
        return {
          keysets: (await keysets()).map((k) => ({
            id: k.id,
            unit: k.unit,
            active: true,
            // The mint API's own field name.
            // eslint-disable-next-line camelcase
            input_fee_ppk: mint.inputFeePpk.get(k.id) ?? 0,
          })),
        }
      case "/v1/keys": {
        const id = route.slice("/v1/keys/".length)
        const found = (await keysets()).filter((k) => k.id === id)
        return { keysets: found.map((k) => ({ id: k.id, unit: k.unit, keys: k.keys })) }
      }
      case "/v1/restore":
        return mint.restore(b.outputs as SerializedBlindedMessage[])
      case "/v1/checkstate": {
        const Ys = b.Ys as string[]
        const states = await mint.proofStates(Ys)
        return { states: Ys.map((Y, i) => ({ Y, state: states[i] })) }
      }
      case "/v1/swap":
        return {
          signatures: await mint.swap(
            b.inputs as Proof[],
            b.outputs as SerializedBlindedMessage[],
          ),
        }
      default:
        throw new Error(`no such route ${route}`)
    }
  }
  return { request, calls, log, offline: (on) => (down = on) }
}

/** The Ys of a packet's inputs, as the mint knows them (NUT-07). */
export const inputYs = (fields: Pick<PacketFields, "cardKey" | "inputs">): string[] =>
  fields.inputs.map((i) =>
    toHex(
      hashToCurve(new TextEncoder().encode(cardSecret(i.nonce, fields.cardKey))).toBytes(
        true,
      ),
    ),
  )

/** The till's own swap of the packet's payment, before any relay: what makes it `already`. */
export const tillSwaps = async (
  mint: FakeMint,
  fields: PacketFields & { witness: string },
) =>
  mint.swap(
    fields.inputs.map((i, n) => ({
      id: i.keysetId,
      amount: i.amount,
      secret: cardSecret(i.nonce, fields.cardKey),
      C: i.C,
      ...(n === 0 ? { witness: JSON.stringify({ signatures: [fields.witness] }) } : {}),
    })) as unknown as Proof[],
    fields.outputs.map((o) => ({
      id: o.keysetId,
      amount: o.amount,
      B_: o.B_,
    })) as unknown as SerializedBlindedMessage[],
  )
