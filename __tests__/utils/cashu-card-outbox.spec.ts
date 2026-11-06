/**
 * ENG-820: GET_OUTBOX (INS 1B), the card adapter of the assisted-settlement
 * relay. Only a 2.2 card is ever sent it; 6A88 is nothing to settle and no
 * network; 6D00 is not an error; a scope of any length but 45 is refused.
 */
import { CardProtocolError, INS, Transceiver, selectApplet } from "@app/utils/cashu-card"
import {
  OutboxEmpty,
  OutboxUnsupported,
  parseOutboxHeader,
  readOutboxPage,
  readOutboxScope,
  supportsOutbox,
  versionSupportsOutbox,
} from "@app/utils/cashu-card-relay/outbox"
import { createRelay, createRelayStore } from "@app/utils/cashu-card-relay"
import { relayCrypto } from "@app/utils/cashu-card-relay/crypto"
import * as Keychain from "react-native-keychain"

import { createFakeCard } from "../helpers/fake-cashu"
import { RECORDED_PACKET, packetFields } from "../helpers/relay-packet"

const answer =
  (...responses: number[][]): Transceiver =>
  async () =>
    responses.shift() ?? [0x6f, 0x00]

beforeEach(async () => {
  await Keychain.resetInternetCredentials({ server: "flashcard-v2-relay" })
})

describe("supportsOutbox", () => {
  it("is false for 2.0 and 2.1 and true for 2.2 and later minors of major 2", () => {
    expect(supportsOutbox(2, 0)).toBe(false)
    expect(supportsOutbox(2, 1)).toBe(false)
    expect(supportsOutbox(2, 2)).toBe(true)
    expect(supportsOutbox(2, 3)).toBe(true)
    expect(supportsOutbox(3, 2)).toBe(false)
    expect(versionSupportsOutbox([2, 1])).toBe(false)
    expect(versionSupportsOutbox([2, 2])).toBe(true)
    expect(versionSupportsOutbox([2])).toBe(false)
  })

  it("adds GET_OUTBOX as INS 1B", () => {
    expect(INS.GET_OUTBOX).toBe(0x1b)
  })

  // A regression guard, not a change: the version gate already took any 2.x
  // minor before ENG-820, so this passes on the code before it too.
  it("leaves selectApplet accepting a 2.2 card's 02 02", async () => {
    const card = createFakeCard(128, { version: [2, 2] })
    await expect(selectApplet(card.transceive)).resolves.toEqual([2, 2])
  })
})

describe("GET_OUTBOX", () => {
  it("asks the scope as B0 1B 00 00 with Le 00 and the page with offset (2) and count (1) in the data", async () => {
    const transceive = jest.fn(
      answer([...new Array(45).fill(7), 0x90, 0x00], [1, 2, 3, 0x90, 0x00]),
    )
    await readOutboxScope(transceive)
    await readOutboxPage(transceive, 0x01fe, 3)
    expect(transceive.mock.calls[0][0]).toEqual([0xb0, 0x1b, 0x00, 0x00, 0x00])
    expect(transceive.mock.calls[1][0]).toEqual([
      0xb0, 0x1b, 0x01, 0x00, 0x03, 0x01, 0xfe, 0x03, 0x00,
    ])
  })

  it("reads 6A88 as no record and 6D00, 6E00 and 6A86 as no GET_OUTBOX, not errors", async () => {
    await expect(readOutboxScope(answer([0x6a, 0x88]))).rejects.toBeInstanceOf(
      OutboxEmpty,
    )
    for (const sw of [
      [0x6d, 0x00],
      [0x6e, 0x00],
      [0x6a, 0x86],
    ]) {
      await expect(readOutboxScope(answer(sw))).rejects.toBeInstanceOf(OutboxUnsupported)
    }
  })

  it("refuses a scope of any length but 45, and a page longer than its count", async () => {
    await expect(
      readOutboxScope(answer([...new Array(44).fill(0), 0x90, 0x00])),
    ).rejects.toBeInstanceOf(CardProtocolError)
    await expect(
      readOutboxScope(answer([...new Array(46).fill(0), 0x90, 0x00])),
    ).rejects.toBeInstanceOf(CardProtocolError)
    await expect(
      readOutboxPage(answer([1, 2, 3, 0x90, 0x00]), 0, 2),
    ).rejects.toBeInstanceOf(CardProtocolError)
    await expect(readOutboxPage(answer(), 0, 0)).rejects.toBeInstanceOf(CardProtocolError)
    await expect(readOutboxPage(answer(), 0x10000, 1)).rejects.toBeInstanceOf(
      CardProtocolError,
    )
  })

  it("reads the policy's fields from the recorded packet's header: card key, installation at 40, mint", () => {
    const fields = packetFields(RECORDED_PACKET)
    expect(parseOutboxHeader(RECORDED_PACKET.slice(0, 255))).toEqual({
      cardKey: fields.cardKey,
      installation: fields.installation,
      mint: "https://mint.test",
    })
    expect(() => parseOutboxHeader([0, ...RECORDED_PACKET.slice(1, 255)])).toThrow(
      CardProtocolError,
    )
  })
})

describe("the relay's card half on cards with nothing to settle", () => {
  const relayWith = () => {
    const request = jest.fn()
    return {
      request,
      relay: createRelay({
        store: createRelayStore(),
        crypto: relayCrypto,
        knownMints: () => ["https://mint.test"],
        request,
      }),
    }
  }

  it("reads 6A88 as nothing to settle, with no page read and no network", async () => {
    const card = createFakeCard(128, { version: [2, 2], outbox: {} })
    const { relay, request } = relayWith()
    expect(
      await relay.captureOutbox({
        transceive: card.transceive,
        card: { pubkey: card.pubkey },
      }),
    ).toEqual({ kind: "nothing" })
    expect(card.ins()).toEqual([0x1b])
    expect(await relay.settlePending(card.pubkey)).toEqual({ kind: "nothing" })
    expect(request).not.toHaveBeenCalled()
  })

  it("reads a 6D00 answer as nothing to settle, not an error", async () => {
    // No `outbox` option: the card answers INS 1B as a 2.1 card does, 6D00.
    const card = createFakeCard(128, { version: [2, 2] })
    const { relay, request } = relayWith()
    expect(
      await relay.captureOutbox({
        transceive: card.transceive,
        card: { pubkey: card.pubkey },
      }),
    ).toEqual({ kind: "nothing" })
    expect(request).not.toHaveBeenCalled()
  })
})
