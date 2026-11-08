/* eslint-disable no-bitwise, no-plusplus -- APDU offsets, and a count of one dropped page */
/**
 * ENG-820: the assisted-settlement relay's orchestrator. A tap of a 2.2 card
 * carries its last payment to the mint, at most once. These pin:
 *   - the settled path makes exactly one `/v1/swap` and reports no amount
 *   - a payment the till settled first makes no swap (`already`)
 *   - a second tap of the same record reads no page and calls no mint
 *   - a relay killed after its capture settles from the journal alone, and one
 *     killed between pages resumes at the saved offset
 *   - a record replaced on the card restarts the capture
 *   - an unknown mint is never called, and nothing is captured for it; it
 *     is said once per record (`seen` after), and relayed once it is known;
 *     a captured entry whose mint is later removed is said once per record
 *     too, and a note the store cannot write degrades to the plain warning
 *   - a packet keyset prefix two v2 keysets share is refused for good
 *   - two settles at once make one swap between them
 *   - a PENDING answer leaves the journal open, never terminal
 *   - a refusal that repeats (a usd keyset, a swap the mint refused) is stored
 *     terminal: never swapped again, and the card's next record is captured;
 *     a swap the mint could not answer (5xx) stays open
 *   - a card whose pieces are in another unit than sat is not relayed
 *   - a store that cannot be read throws, never reads as "nothing saved"
 * Against ENG-819's recorded packet (`__tests__/fixtures/relay-packet-494.hex`)
 * and the fake mint, which checks the packet's SIG_ALL witness as a mint does.
 */
import * as Keychain from "react-native-keychain"

import { relayCrypto } from "@app/utils/cashu-card-relay/crypto"
import {
  RelayStoreError,
  createRelay,
  createRelayStore,
  defaultKnownMints,
} from "@app/utils/cashu-card-relay"
import { setCardFundMints } from "@app/utils/cashu-card-topup/connected"
import { KEEP_TERMINAL } from "@app/utils/cashu-card-relay/store"
import { decodePacket } from "@app/utils/cashu-card-relay/relay"

import {
  FAKE_CARD_KEY,
  createFakeCard,
  createFakeMint,
  outboxScope,
} from "../helpers/fake-cashu"
import {
  RECORDED_PACKET,
  buildRelayPacket,
  inputYs,
  packetFields,
  relayMintFor,
  samplePayment,
  tillSwaps,
  unsignedBody,
} from "../helpers/relay-packet"

const SERVER = "flashcard-v2-relay"
const MINT = "https://mint.test"
const RECORDED = packetFields(RECORDED_PACKET)
const KEYSET = RECORDED.inputs[0].keysetId
const INS_GET_OUTBOX = 0x1b

const setup = ({
  packet = RECORDED_PACKET,
  cardKey,
  known = [MINT],
}: { packet?: number[]; cardKey?: string; known?: string[] } = {}) => {
  const mint = createFakeMint({ satKeysetId: KEYSET })
  const double = relayMintFor(mint)
  const card = createFakeCard(128, { version: [2, 2], outbox: { packet }, cardKey })
  const request = jest.fn((_url: string) => double.request)
  const makeRelay = () =>
    createRelay({
      store: createRelayStore(),
      crypto: relayCrypto,
      knownMints: () => known,
      request,
    })
  const pubkey = packetFields(packet).cardKey
  return { mint, double, card, request, makeRelay, relay: makeRelay(), pubkey }
}

type FakeCardT = ReturnType<typeof createFakeCard>
/** The GET_OUTBOX APDUs the card was sent: `scope`, or the page's offset. */
const outboxReads = (card: FakeCardT) =>
  card.transceive.mock.calls
    .map(([apdu]) => apdu)
    .filter((apdu) => apdu[1] === INS_GET_OUTBOX)
    .map((apdu) => (apdu[2] === 0 ? "scope" : (apdu[5] << 8) | apdu[6]))

const pageReads = (card: FakeCardT) => outboxReads(card).filter((r) => r !== "scope")

const savedEntries = async () => {
  const saved = await Keychain.getInternetCredentials(SERVER)
  return saved ? JSON.parse(saved.password).entries : []
}

beforeEach(async () => {
  await Keychain.resetInternetCredentials({ server: SERVER })
  jest.clearAllMocks()
})

describe("the recorded packet and the test packet builder", () => {
  it("decodes the recording with the vendored engine, bound to its own header's installation", () => {
    const p = decodePacket(
      RECORDED_PACKET,
      { mint: MINT, cardKey: RECORDED.cardKey, installation: RECORDED.installation },
      relayCrypto,
    )
    expect(RECORDED_PACKET).toHaveLength(494)
    expect(p.inputs.map((i) => i.amount)).toEqual([8, 4])
    expect(p.outputs.map((o) => o.amount)).toEqual([8, 4])
    expect(p.scope).toBe(Buffer.from(outboxScope(RECORDED_PACKET)).toString("hex"))
  })

  it("builds the recording's body byte for byte from its fields, and signs packets the engine accepts", () => {
    expect(unsignedBody(RECORDED)).toEqual(RECORDED_PACKET.slice(0, 494 - 128))
    const built = buildRelayPacket(FAKE_CARD_KEY, samplePayment(KEYSET, MINT))
    const fields = packetFields(built)
    expect(() =>
      decodePacket(
        built,
        { mint: MINT, cardKey: fields.cardKey, installation: fields.installation },
        relayCrypto,
      ),
    ).not.toThrow()
  })
})

describe("createRelay", () => {
  it("settles a recorded packet with exactly one swap, and reports no amount", async () => {
    const { card, relay, double, pubkey, mint } = setup()

    const captured = await relay.captureOutbox({
      transceive: card.transceive,
      card: { pubkey },
    })
    expect(captured).toEqual({ kind: "captured" })
    // No mint call in the card half.
    expect(double.log).toEqual([])
    // The scope, the header page, then the engine's scope, pages and final scope.
    expect(outboxReads(card)).toEqual(["scope", 0, "scope", 0, 255, "scope"])

    const outcome = await relay.settlePending(pubkey)
    expect(outcome).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(1)
    // Observed before the swap: restore and checkstate first.
    expect(double.log.indexOf("/v1/restore")).toBeLessThan(double.log.indexOf("/v1/swap"))
    expect(double.log.indexOf("/v1/checkstate")).toBeLessThan(
      double.log.indexOf("/v1/swap"),
    )
    for (const Y of inputYs(RECORDED)) expect(mint.proofStatesByY.get(Y)).toBe("SPENT")
    const [entry] = await savedEntries()
    expect(entry.journal.state).toBe("outputs-confirmed")
    expect(entry.swaps).toBe(1)
  })

  it("makes no swap for a payment the till settled first (inputs spent, outputs restored)", async () => {
    const { card, relay, double, pubkey, mint } = setup()
    await tillSwaps(mint, RECORDED)

    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "already" })
    expect(double.calls["/v1/swap"]).toBeUndefined()
  })

  it("answers a second tap of the same record from the journal: no page read and no mint call", async () => {
    const { card, relay, double, pubkey, request } = setup()
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })
    await relay.settlePending(pubkey)
    card.transceive.mockClear()
    const callsBefore = double.log.length
    const requestsBefore = request.mock.calls.length

    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "already" })
    expect(outboxReads(card)).toEqual(["scope"])
    expect(pageReads(card)).toEqual([])
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "already" })
    expect(double.log).toHaveLength(callsBefore)
    expect(request.mock.calls).toHaveLength(requestsBefore)
    expect(double.calls["/v1/swap"]).toBe(1)
  })

  it("settles from the journal alone after a relay killed after its capture: no GET_OUTBOX at all", async () => {
    const { card, relay, makeRelay, double, pubkey } = setup()
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })
    card.transceive.mockClear()

    // A fresh process: a new relay over the same Keychain.
    const fresh = makeRelay()
    expect(
      await fresh.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "captured" })
    expect(outboxReads(card)).toEqual([])
    expect(await fresh.settlePending(pubkey)).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(1)
  })

  it("resumes a capture killed between pages at the saved offset", async () => {
    const { card, makeRelay, pubkey } = setup()
    const healthy = card.transceive.getMockImplementation() as (
      a: number[],
    ) => Promise<number[]>
    let pageAt255 = 0
    card.transceive.mockImplementation(async (apdu) => {
      if (
        apdu[1] === INS_GET_OUTBOX &&
        apdu[2] === 1 &&
        apdu[6] === 255 &&
        pageAt255++ === 0
      )
        throw new Error("Tag was lost")
      return healthy(apdu)
    })

    const first = await makeRelay().captureOutbox({
      transceive: card.transceive,
      card: { pubkey },
    })
    expect(first.kind).toBe("failed")
    const [partial] = await savedEntries()
    expect(partial.journal.state).toBe("capturing")
    expect(partial.journal.pages.map((p: { offset: number }) => p.offset)).toEqual([0])
    expect(partial.journal.pending).toEqual({ offset: 255, count: 255 })

    card.transceive.mockClear()
    const second = await makeRelay().captureOutbox({
      transceive: card.transceive,
      card: { pubkey },
    })
    expect(second).toEqual({ kind: "captured" })
    expect(pageReads(card)).toEqual([255])
    const [entry] = await savedEntries()
    expect(entry.journal.state).toBe("captured")
    expect(entry.journal.packet).toBe(Buffer.from(RECORDED_PACKET).toString("hex"))
  })

  it("starts again when a newer record replaced the one a partial capture was reading", async () => {
    const first = buildRelayPacket(
      FAKE_CARD_KEY,
      samplePayment(KEYSET, MINT, { paymentId: 1 }),
    )
    const second = buildRelayPacket(
      FAKE_CARD_KEY,
      samplePayment(KEYSET, MINT, { paymentId: 2, seed: 2 }),
    )
    const { card, relay, double, pubkey } = setup({ packet: first })
    const healthy = card.transceive.getMockImplementation() as (
      a: number[],
    ) => Promise<number[]>
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS_GET_OUTBOX && apdu[2] === 1 && apdu[6] === 255)
        throw new Error("Tag was lost")
      return healthy(apdu)
    })
    expect(
      (await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })).kind,
    ).toBe("failed")

    card.setOutbox(second)
    card.transceive.mockImplementation(healthy)
    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "captured" })
    const entries = await savedEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].scopeHex).toBe(Buffer.from(outboxScope(second)).toString("hex"))
    expect(entries[0].journal.packet).toBe(Buffer.from(second).toString("hex"))
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(1)
  })

  it("never calls, or builds a request for, a mint this app does not know", async () => {
    const { card, relay, double, pubkey, request } = setup({
      known: ["https://forge.test"],
    })

    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "unknown-mint" })
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "nothing" })
    expect(request).not.toHaveBeenCalled()
    expect(double.log).toEqual([])
    expect(await savedEntries()).toEqual([])
  })

  it("refuses a packet when the card's own record names another mint", async () => {
    const { card, relay, pubkey, request } = setup({
      known: [MINT, "https://forge.test"],
    })
    expect(
      await relay.captureOutbox({
        transceive: card.transceive,
        card: { pubkey, recordMint: "https://forge.test" },
      }),
    ).toEqual({ kind: "unknown-mint" })
    expect(request).not.toHaveBeenCalled()
  })

  it("says an unknown mint once per record: a later tap is seen, and a mint known later is relayed", async () => {
    let known = ["https://forge.test"]
    const mint = createFakeMint({ satKeysetId: KEYSET })
    const double = relayMintFor(mint)
    const card = createFakeCard(128, {
      version: [2, 2],
      outbox: { packet: RECORDED_PACKET },
    })
    const request = jest.fn((_url: string) => double.request)
    const relay = createRelay({
      store: createRelayStore(),
      crypto: relayCrypto,
      knownMints: () => known,
      request,
    })
    const pubkey = RECORDED.cardKey
    const scopeHex = Buffer.from(outboxScope(RECORDED_PACKET)).toString("hex")
    const tap = () =>
      relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })

    expect(await tap()).toEqual({ kind: "unknown-mint" })
    expect(await tap()).toEqual({ kind: "unknown-mint", seen: true })
    expect(await tap()).toEqual({ kind: "unknown-mint", seen: true })
    // A note, not an entry: nothing captured, nothing refused, no mint called.
    expect(await savedEntries()).toEqual([])
    const saved = await Keychain.getInternetCredentials(SERVER)
    const notes = saved ? JSON.parse(saved.password).unknownMints : undefined
    expect(notes).toEqual([expect.objectContaining({ cardPubkey: pubkey, scopeHex })])
    expect(request).not.toHaveBeenCalled()

    // The card's next record at the unknown mint is said once too.
    const other = buildRelayPacket(
      FAKE_CARD_KEY,
      samplePayment(KEYSET, MINT, { paymentId: 2, seed: 2 }),
    )
    card.setOutbox(other)
    const otherKey = packetFields(other).cardKey
    const tapOther = () =>
      relay.captureOutbox({ transceive: card.transceive, card: { pubkey: otherKey } })
    expect(await tapOther()).toEqual({ kind: "unknown-mint" })
    expect(await tapOther()).toEqual({ kind: "unknown-mint", seen: true })

    // Once the mint is known, the next tap captures and settles the record.
    card.setOutbox(RECORDED_PACKET)
    known = [MINT]
    expect(await tap()).toEqual({ kind: "captured" })
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(1)
    // The record's entry replaced its note.
    const after = await Keychain.getInternetCredentials(SERVER)
    const left = after ? JSON.parse(after.password).unknownMints ?? [] : []
    expect(left.some((n: { scopeHex: string }) => n.scopeHex === scopeHex)).toBe(false)
  })

  it("says a captured entry's mint that is no longer known once too: the next settle is seen", async () => {
    let known = [MINT]
    const mint = createFakeMint({ satKeysetId: KEYSET })
    const double = relayMintFor(mint)
    const card = createFakeCard(128, {
      version: [2, 2],
      outbox: { packet: RECORDED_PACKET },
    })
    const request = jest.fn((_url: string) => double.request)
    const relay = createRelay({
      store: createRelayStore(),
      crypto: relayCrypto,
      knownMints: () => known,
      request,
    })
    const pubkey = RECORDED.cardKey

    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "captured" })
    // The mint is removed from the app's list after the capture.
    known = ["https://forge.test"]
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "unknown-mint" })
    expect(await relay.settlePending(pubkey)).toEqual({
      kind: "unknown-mint",
      seen: true,
    })
    expect(request).not.toHaveBeenCalled()
    // The captured entry is kept, still open, for when the mint is known again.
    const [entry] = await savedEntries()
    expect(entry.journal.state).not.toBe("outputs-confirmed")
    // The settle path's note shares the captured entry's key.
    const noted = await Keychain.getInternetCredentials(SERVER)
    expect(noted ? JSON.parse(noted.password).unknownMints : []).toEqual([
      expect.objectContaining({ cardPubkey: pubkey, scopeHex: entry.scopeHex }),
    ])

    known = [MINT]
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(1)
    // The settle's put of that record replaced the note.
    const settled = await Keychain.getInternetCredentials(SERVER)
    expect(settled ? JSON.parse(settled.password).unknownMints ?? [] : []).toEqual([])
  })

  it("degrades a failed unknown-mint note to the plain warning, never to failed", async () => {
    const { card, relay, pubkey, request } = setup({ known: ["https://forge.test"] })
    ;(Keychain.setInternetCredentials as jest.Mock).mockRejectedValueOnce(
      new Error("keychain write failed"),
    )
    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "unknown-mint" })
    expect(request).not.toHaveBeenCalled()
  })

  it("degrades a failed unknown-mint note on settle to the plain warning, never to failed", async () => {
    let known = [MINT]
    const mint = createFakeMint({ satKeysetId: KEYSET })
    const double = relayMintFor(mint)
    const card = createFakeCard(128, {
      version: [2, 2],
      outbox: { packet: RECORDED_PACKET },
    })
    const request = jest.fn((_url: string) => double.request)
    const relay = createRelay({
      store: createRelayStore(),
      crypto: relayCrypto,
      knownMints: () => known,
      request,
    })
    const pubkey = RECORDED.cardKey
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })
    known = ["https://forge.test"]
    const write = Keychain.setInternetCredentials as jest.Mock
    write.mockRejectedValueOnce(new Error("keychain write failed"))
    const writesBefore = write.mock.calls.length
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "unknown-mint" })
    // The note was attempted, and its rejection consumed.
    expect(write.mock.calls).toHaveLength(writesBefore + 1)
    expect(request).not.toHaveBeenCalled()
  })

  it("stores a packet keyset two of the mint's v2 keysets share as refused (keyset-ambiguous): no swap, not retried", async () => {
    const { card, relay, double, pubkey } = setup()
    const v2 = (tail: string) => `${KEYSET}${tail.repeat(50)}`
    const ambiguous = async (route: string, body?: unknown) => {
      if (route !== "/v1/keysets") return double.request(route, body)
      await double.request(route, body)
      return {
        keysets: [
          { id: v2("a"), unit: "sat", active: true },
          { id: v2("b"), unit: "sat", active: true },
        ],
      }
    }
    const relayAmbiguous = createRelay({
      store: createRelayStore(),
      crypto: relayCrypto,
      knownMints: () => [MINT],
      request: () => ambiguous,
    })
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })

    expect(await relayAmbiguous.settlePending(pubkey)).toEqual({
      kind: "refused",
      code: "keyset-ambiguous",
    })
    expect(double.calls["/v1/swap"]).toBeUndefined()
    const [entry] = await savedEntries()
    expect(entry.refused).toBe("keyset-ambiguous")
    expect(await relayAmbiguous.settlePending(pubkey)).toEqual({
      kind: "refused",
      code: "keyset-ambiguous",
      seen: true,
    })
    expect(double.calls["/v1/keysets"]).toBe(1)
  })

  it("makes one swap between two settles at once", async () => {
    const { card, relay, double, pubkey } = setup()
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })

    const outcomes = await Promise.all([
      relay.settlePending(pubkey),
      relay.settlePending(pubkey),
    ])
    expect(double.calls["/v1/swap"]).toBe(1)
    expect(outcomes).toEqual([{ kind: "settled" }, { kind: "already" }])
  })

  it("leaves the journal open on a PENDING answer: pending, no swap, not terminal", async () => {
    const { card, relay, double, pubkey, mint } = setup()
    for (const Y of inputYs(RECORDED)) mint.proofStatesByY.set(Y, "PENDING")
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })

    expect(await relay.settlePending(pubkey)).toEqual({ kind: "pending" })
    expect(double.calls["/v1/swap"]).toBeUndefined()
    const [entry] = await savedEntries()
    expect(entry.journal.state).toBe("pending")

    // Once the mint lets go of the inputs, the next settle swaps.
    for (const Y of inputYs(RECORDED)) mint.proofStatesByY.delete(Y)
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled" })
  })

  it("keeps the journal submitted when the mint is unreachable, and the next settle observes before it swaps", async () => {
    const { card, relay, double, pubkey } = setup()
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })
    double.offline(true)
    expect((await relay.settlePending(pubkey)).kind).toBe("failed")
    const [entry] = await savedEntries()
    expect(entry.journal.state).toBe("captured")
    double.offline(false)
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(1)
  })

  it("stores a usd-keyset packet as refused: no swap, not retried, and the card's next record is captured", async () => {
    const mint = createFakeMint()
    const double = relayMintFor(mint)
    const usd = buildRelayPacket(FAKE_CARD_KEY, samplePayment(mint.usdKeysetId, MINT))
    const card = createFakeCard(128, { version: [2, 2], outbox: { packet: usd } })
    const relay = createRelay({
      store: createRelayStore(),
      crypto: relayCrypto,
      knownMints: () => [MINT],
      request: () => double.request,
    })
    const pubkey = packetFields(usd).cardKey

    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "captured" })
    expect(await relay.settlePending(pubkey)).toEqual({
      kind: "refused",
      code: "input-keyset",
    })
    expect(double.calls["/v1/swap"]).toBeUndefined()
    const [refused] = await savedEntries()
    expect(refused.refused).toBe("input-keyset")

    // The next tap of the same record: terminal, no page read, no mint call.
    card.transceive.mockClear()
    const callsBefore = double.log.length
    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "refused", code: "input-keyset", seen: true })
    expect(outboxReads(card)).toEqual(["scope"])
    expect(await relay.settlePending(pubkey)).toEqual({
      kind: "refused",
      code: "input-keyset",
      seen: true,
    })
    expect(double.log).toHaveLength(callsBefore)

    // A later sat payment's record is captured and settled.
    const next = buildRelayPacket(
      FAKE_CARD_KEY,
      samplePayment(mint.keysetId, MINT, { paymentId: 2, seed: 2 }),
    )
    card.setOutbox(next)
    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "captured" })
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(1)
  })

  it("stores a swap the mint refused as refused: the same swap is never sent again", async () => {
    const { card, relay, double, pubkey } = setup({
      packet: buildRelayPacket(FAKE_CARD_KEY, samplePayment(KEYSET, MINT)),
    })
    double.refuseSwaps(400)
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })

    expect(await relay.settlePending(pubkey)).toEqual({
      kind: "refused",
      code: "settlement-unresolved",
    })
    expect(double.calls["/v1/swap"]).toBe(1)
    const [entry] = await savedEntries()
    expect(entry.refused).toBe("settlement-unresolved")
    expect(entry.journal.state).toBe("submitted")
    expect(entry.swaps).toBe(1)

    // Even with the mint willing now, this phone does not resend it.
    double.refuseSwaps(undefined)
    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "refused", code: "settlement-unresolved", seen: true })
    expect(await relay.settlePending(pubkey)).toEqual({
      kind: "refused",
      code: "settlement-unresolved",
      seen: true,
    })
    expect(double.calls["/v1/swap"]).toBe(1)

    // The card's next record is captured as usual.
    card.setOutbox(
      buildRelayPacket(
        FAKE_CARD_KEY,
        samplePayment(KEYSET, MINT, { paymentId: 2, seed: 2 }),
      ),
    )
    expect(
      await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).toEqual({ kind: "captured" })
  })

  it("keeps a swap the mint could not answer (503) open, and settles it on the next try", async () => {
    const { card, relay, double, pubkey } = setup()
    double.refuseSwaps(503)
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })

    expect((await relay.settlePending(pubkey)).kind).toBe("failed")
    const [entry] = await savedEntries()
    expect(entry.refused).toBeUndefined()
    expect(entry.journal.state).toBe("submitted")

    double.refuseSwaps(undefined)
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled" })
    expect(double.calls["/v1/swap"]).toBe(2)
  })

  it("does not relay a card whose pieces are in another unit than sat: no GET_OUTBOX", async () => {
    const { card, relay, pubkey, request } = setup()
    expect(
      await relay.captureOutbox({
        transceive: card.transceive,
        card: { pubkey, unit: "usd" },
      }),
    ).toEqual({ kind: "nothing" })
    expect(outboxReads(card)).toEqual([])
    expect(request).not.toHaveBeenCalled()
    expect(await savedEntries()).toEqual([])
  })

  it("throws when the store cannot be read, never reading it as nothing saved", async () => {
    const { card, relay, pubkey } = setup()
    ;(Keychain.getInternetCredentials as jest.Mock).mockRejectedValueOnce(
      new Error("keychain locked"),
    )
    await expect(
      relay.captureOutbox({ transceive: card.transceive, card: { pubkey } }),
    ).rejects.toThrow("keychain locked")
    expect(outboxReads(card)).toEqual([])

    await Keychain.setInternetCredentials(SERVER, "relay", "{not json")
    await expect(relay.settlePending(pubkey)).rejects.toBeInstanceOf(RelayStoreError)

    await Keychain.setInternetCredentials(
      SERVER,
      "relay",
      JSON.stringify({ format: 1, entries: [], unknownMints: "nope" }),
    )
    await expect(relay.settlePending(pubkey)).rejects.toBeInstanceOf(RelayStoreError)
  })
})

describe("createRelayStore's unknown-mint notes", () => {
  it("keeps the newest KEEP_TERMINAL notes, and keeps them across entry writes", async () => {
    let clock = 0
    const store = createRelayStore(() => (clock += 1))
    for (let i = 0; i <= KEEP_TERMINAL; i += 1) {
      expect(await store.noteUnknownMint("card", `scope${i}`)).toBe(false)
    }
    const saved = await Keychain.getInternetCredentials(SERVER)
    const notes = saved ? JSON.parse(saved.password).unknownMints : []
    expect(notes).toHaveLength(KEEP_TERMINAL)
    // The oldest was dropped, so it reads as new again.
    expect(notes.some((n: { scopeHex: string }) => n.scopeHex === "scope0")).toBe(false)
    expect(await store.noteUnknownMint("card", `scope${KEEP_TERMINAL}`)).toBe(true)
    await store.remove("card", "scope5")
    expect(await store.noteUnknownMint("card", "scope5")).toBe(true)
  })
})

// ENG-787 decision 5: the relay knows the mints the app funds.
describe("defaultKnownMints", () => {
  afterEach(() => setCardFundMints([]))

  it("is forge and the card mint, plus the fund list as it is at each use", () => {
    expect(defaultKnownMints()).toEqual([
      "https://forge.flashapp.me",
      "https://forge.flashapp.me",
      "https://forge.flashapp.me",
    ])
    setCardFundMints(["https://forge.flashapp.me", "https://mint.minibits.cash/Bitcoin"])
    expect(defaultKnownMints()).toContain("https://mint.minibits.cash/Bitcoin")
    expect(defaultKnownMints()).not.toContain("https://mint.macadamia.cash")
  })
})
