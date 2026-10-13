/**
 * ENG-675: the card's clock, fed with Bitcoin block headers (architect's
 * decision 7). What it pins:
 *   - the tip comes from mempool.space, else blockstream.info (else the dev
 *     bridge's stub), and is kept ten minutes;
 *   - a header is kept only with its own work, at or under the applet's floor,
 *     and only as the block it was named as: a stale or invalid header is
 *     never sent;
 *   - in a tap the card is told the phone's time and shown the kept header
 *     only when it is newer than the card's clock, never waits on the network,
 *     and a refusal never fails the tap.
 */
import { setCardBridge } from "../../app/utils/cashu-card-bridge"
import {
  FLOOR_BITS,
  HEADER_CACHE_MS,
  HEADER_SOURCES,
  checkHeader,
  feedHeader,
  headerSources,
  keptHeader,
  refreshTipHeader,
  resetKeptHeader,
  targetOf,
} from "../../app/utils/cashu-card-headers"
import { createFakeCard } from "../helpers/fake-cashu"
import { HEADER_VECTORS, esploraFetch, headerBytes } from "../helpers/block-headers"

const [OLDER, MIDDLE, NEWEST] = HEADER_VECTORS

beforeEach(() => {
  resetKeptHeader()
  setCardBridge(undefined)
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(() => setCardBridge(undefined))

describe("checkHeader", () => {
  it("takes a real mainnet header: its time, its hash as Bitcoin shows it, and its bits", () => {
    HEADER_VECTORS.forEach((vector) => {
      expect(checkHeader(headerBytes(vector), vector.hash)).toMatchObject({
        hash: vector.hash,
        time: vector.time,
        bits: 0x17021ef0,
      })
    })
  })

  it("refuses a header named as another block", () => {
    expect(() => checkHeader(headerBytes(NEWEST), OLDER.hash)).toThrow(/not the block/)
  })

  it("refuses the tip with a nonce byte changed: it lacks its work", () => {
    const forged = headerBytes(NEWEST)
    forged[79] = (forged[79] + 1) % 256
    expect(() => checkHeader(forged)).toThrow(/lacks its work/)
  })

  it("refuses a header whose bits name more than the applet's floor: a testnet or made-up block", () => {
    const easy = headerBytes(NEWEST)
    // bits 0x1d00ffff, the genesis difficulty, far over the floor.
    easy.splice(72, 4, 0xff, 0xff, 0x00, 0x1d)
    expect(() => checkHeader(easy)).toThrow(/too little work/)
  })

  it("refuses bits no header could carry, and a header of another length", () => {
    expect(targetOf(0x22000001)).toBeUndefined()
    expect(targetOf(0x17800000)).toBeUndefined()
    expect(() => checkHeader(headerBytes(NEWEST).slice(0, 79))).toThrow(/80 bytes/)
  })

  it("puts the floor at the applet's FLOOR_BITS, 0x17087BC0 (D24)", () => {
    expect(FLOOR_BITS).toBe(0x17087bc0)
    expect((targetOf(0x17021ef0) as bigint) <= (targetOf(FLOOR_BITS) as bigint)).toBe(
      true,
    )
  })
})

describe("refreshTipHeader", () => {
  it("asks mempool.space for the tip hash, then that block's header, and keeps it", async () => {
    const asked: string[] = []
    const fetcher = esploraFetch(NEWEST, asked)
    await expect(refreshTipHeader({ fetcher: fetcher as never })).resolves.toMatchObject({
      time: NEWEST.time,
    })
    expect(asked).toEqual([
      "https://mempool.space/api/blocks/tip/hash",
      `https://mempool.space/api/block/${NEWEST.hash}/header`,
    ])
    expect(keptHeader()?.hash).toBe(NEWEST.hash)
    expect(HEADER_SOURCES).toEqual([
      "https://mempool.space/api",
      "https://blockstream.info/api",
    ])
  })

  it("falls back to blockstream.info when mempool.space fails", async () => {
    const asked: string[] = []
    const good = esploraFetch(NEWEST)
    const fetcher = jest.fn(async (url: string) => {
      asked.push(url)
      if (url.startsWith("https://mempool.space")) throw new Error("offline")
      return good(url)
    })
    await expect(refreshTipHeader({ fetcher: fetcher as never })).resolves.toMatchObject({
      hash: NEWEST.hash,
    })
    expect(asked[asked.length - 1]).toBe(
      `https://blockstream.info/api/block/${NEWEST.hash}/header`,
    )
  })

  it("keeps no header a source names wrongly or without its work, and none when both fail", async () => {
    const forged = { ...NEWEST, header: NEWEST.header.slice(0, -2) + "00" }
    await expect(
      refreshTipHeader({ fetcher: esploraFetch(forged) as never }),
    ).resolves.toBeUndefined()
    expect(keptHeader()).toBeUndefined()
    const down = jest.fn(async () => ({ ok: false, status: 503, text: async () => "" }))
    await expect(refreshTipHeader({ fetcher: down as never })).resolves.toBeUndefined()
    expect(down).toHaveBeenCalledTimes(2)
  })

  it("asks again only after ten minutes, and keeps the newer of what it has", async () => {
    let now = 0
    const first = esploraFetch(MIDDLE)
    await refreshTipHeader({ fetcher: first as never, now: () => now })
    const second = esploraFetch(OLDER)
    now = HEADER_CACHE_MS - 1
    await refreshTipHeader({ fetcher: second as never, now: () => now })
    expect(second).not.toHaveBeenCalled()
    now = HEADER_CACHE_MS + 1
    await refreshTipHeader({ fetcher: second as never, now: () => now })
    expect(second).toHaveBeenCalled()
    // An older tip (a lagging source) never replaces a newer header.
    expect(keptHeader()?.hash).toBe(MIDDLE.hash)
  })

  it("keeps the header it had when every source fails later", async () => {
    await refreshTipHeader({ fetcher: esploraFetch(NEWEST) as never, now: () => 0 })
    const down = jest.fn(async () => {
      throw new Error("offline")
    })
    await expect(
      refreshTipHeader({ fetcher: down as never, now: () => HEADER_CACHE_MS * 2 }),
    ).resolves.toMatchObject({ hash: NEWEST.hash })
  })

  it("asks the dev bridge's stub instead in a development build, for the e2e flows", async () => {
    setCardBridge({
      url: "http://localhost:9876",
      headersUrl: "http://localhost:9878/api",
    })
    expect(headerSources()).toEqual(["http://localhost:9878/api"])
    const asked: string[] = []
    await refreshTipHeader({ fetcher: esploraFetch(NEWEST, asked) as never })
    expect(asked[0]).toBe("http://localhost:9878/api/blocks/tip/hash")
  })
})

describe("feedHeader, in a tap", () => {
  it("tells the card the phone's time, then shows it a kept header newer than its clock", async () => {
    await refreshTipHeader({ fetcher: esploraFetch(NEWEST) as never })
    const card = createFakeCard()
    const report = await feedHeader(card.transceive, 0, { now: () => 1791814900_000 })
    expect(report).toEqual({ told: true, sent: true, now: NEWEST.time })
    const [tell, header] = card.transceive.mock.calls.map(([apdu]) => apdu)
    expect(tell).toEqual([0xb0, 0x37, 0x00, 0x00, 0x04, 0x6a, 0xcc, 0xec, 0xf4])
    expect(header.slice(5, 85)).toEqual(headerBytes(NEWEST))
    expect(card.now()).toBe(NEWEST.time)
  })

  it("never sends a header that is not newer than the card's clock", async () => {
    await refreshTipHeader({ fetcher: esploraFetch(OLDER) as never })
    const card = createFakeCard()
    const report = await feedHeader(card.transceive, NEWEST.time)
    expect(report).toMatchObject({ told: true, sent: false, now: NEWEST.time })
    expect(card.ins()).toEqual([0x37])
  })

  it("sends no header when the phone has none, and touches no network in the tap", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    try {
      const card = createFakeCard()
      const report = await feedHeader(card.transceive, 0)
      expect(report).toMatchObject({ sent: false })
      expect(card.ins()).toEqual([0x37])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("a card that refuses the header (6A93) or TELL_TIME keeps its clock, and the tap goes on", async () => {
    await refreshTipHeader({ fetcher: esploraFetch(NEWEST) as never })
    const refusing = jest.fn(async (apdu: number[]) =>
      apdu[1] === 0x36 ? [0x6a, 0x93] : [0x6d, 0x00],
    )
    const report = await feedHeader(refusing, 1000)
    expect(report).toMatchObject({
      told: false,
      sent: true,
      now: 1000,
      refused: "CardError",
    })
  })

  it("a card that leaves mid-tap fails nothing here either", async () => {
    await refreshTipHeader({ fetcher: esploraFetch(NEWEST) as never })
    const gone = jest.fn(async () => {
      throw new Error("Tag was lost")
    })
    await expect(feedHeader(gone, 0)).resolves.toMatchObject({ told: false, now: 0 })
  })
})
