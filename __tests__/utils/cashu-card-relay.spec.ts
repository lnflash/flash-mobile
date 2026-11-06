/**
 * ENG-820: the assisted-settlement relay's orchestrator. A tap of a 2.2 card
 * carries its last payment to the mint, at most once. These pin:
 *   - the settled path makes exactly one `/v1/swap` and reports the outputs' sum
 *   - a payment the till settled first makes no swap (`already`)
 *   - a second tap of the same record reads no page and calls no mint
 *   - a relay killed after its capture settles from the journal alone, and one
 *     killed between pages resumes at the saved offset
 *   - a record replaced on the card restarts the capture
 *   - an unknown mint is never called, and nothing is captured for it
 *   - two settles at once make one swap between them
 *   - a PENDING answer leaves the journal open, never terminal
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
} from "@app/utils/cashu-card-relay"
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
  it("settles a recorded packet with exactly one swap and reports the outputs' sum", async () => {
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
    expect(outcome).toEqual({ kind: "settled", sats: 12 })
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
    expect(await fresh.settlePending(pubkey)).toEqual({ kind: "settled", sats: 12 })
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
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled", sats: 12 })
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

  it("makes one swap between two settles at once", async () => {
    const { card, relay, double, pubkey } = setup()
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })

    const outcomes = await Promise.all([
      relay.settlePending(pubkey),
      relay.settlePending(pubkey),
    ])
    expect(double.calls["/v1/swap"]).toBe(1)
    expect(outcomes).toEqual([{ kind: "settled", sats: 12 }, { kind: "already" }])
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
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled", sats: 12 })
  })

  it("keeps the journal submitted when the mint is unreachable, and the next settle observes before it swaps", async () => {
    const { card, relay, double, pubkey } = setup()
    await relay.captureOutbox({ transceive: card.transceive, card: { pubkey } })
    double.offline(true)
    expect((await relay.settlePending(pubkey)).kind).toBe("failed")
    const [entry] = await savedEntries()
    expect(entry.journal.state).toBe("captured")
    double.offline(false)
    expect(await relay.settlePending(pubkey)).toEqual({ kind: "settled", sats: 12 })
    expect(double.calls["/v1/swap"]).toBe(1)
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
  })
})
