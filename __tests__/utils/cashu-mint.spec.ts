/**
 * ENG-616: the unit on a Cashu card's balance comes from the mint that issued
 * its keysets (NUT-02 `GET /v1/keysets`), never from an assumption.
 */
import axios from "axios"

import {
  fetchKeysetUnits,
  parseKeysetUnits,
  soleUnit,
  totalsByUnit,
  unitsForKeysets,
} from "../../app/utils/cashu-mint"
import { setCardBridge } from "../../app/utils/cashu-card-bridge"

jest.mock("axios", () => ({ get: jest.fn() }))

const get = axios.get as jest.Mock

const SAT = "0059534ce0bfa19a"
const USD = "00ad268c4d1f5826"

/** A NUT-02 /v1/keysets body: `{ keysets: [{ id, unit, active, ... }] }`. */
const keysetsBody = (keysets: { id: string; unit: string }[]) => ({
  keysets: keysets.map((k) => ({ ...k, active: true })),
})

// The module caches per mint URL for the app session; a fresh URL per test
// keeps one test's cache out of the next.
let mintSeq = 0
const freshMint = () => {
  mintSeq += 1
  return `https://mint-${mintSeq}.test`
}

beforeEach(() => {
  get.mockReset()
})

describe("parseKeysetUnits", () => {
  it("maps each keyset id to its unit", () => {
    expect(
      parseKeysetUnits(
        keysetsBody([
          { id: SAT, unit: "sat" },
          { id: USD, unit: "usd" },
        ]),
      ),
    ).toEqual({ [SAT]: "sat", [USD]: "usd" })
  })

  it("lowercases ids and units so a card's raw-byte hex id always matches", () => {
    expect(
      parseKeysetUnits(keysetsBody([{ id: SAT.toUpperCase(), unit: "SAT" }])),
    ).toEqual({ [SAT]: "sat" })
  })

  it("skips entries without a string id and unit instead of trusting them", () => {
    expect(
      parseKeysetUnits({
        keysets: [
          { id: SAT },
          { unit: "usd" },
          { id: 7, unit: "sat" },
          null,
          { id: USD, unit: "usd" },
        ],
      }),
    ).toEqual({ [USD]: "usd" })
  })

  // ENG-787: a card names a v2 keyset (33 bytes) by its first 8.
  const V2 = `01fc0ec0${"5a".repeat(29)}`
  const V2_PREFIX = V2.slice(0, 16)

  it("maps a v2 keyset's 8-byte card id to its unit, beside the full id", () => {
    const units = parseKeysetUnits(
      keysetsBody([
        { id: SAT, unit: "sat" },
        { id: V2, unit: "sat" },
      ]),
    )
    expect(units).toEqual({ [SAT]: "sat", [V2]: "sat", [V2_PREFIX]: "sat" })
    expect(totalsByUnit([{ keysetId: V2_PREFIX, amount: 21 }], units)).toEqual({
      byUnit: [{ unit: "sat", amount: 21 }],
      unknown: 0,
    })
  })

  it("leaves a card id two v2 keysets share unmapped: its value is unit unknown", () => {
    const other = `${V2_PREFIX}${"c3".repeat(25)}`
    const units = parseKeysetUnits(
      keysetsBody([
        { id: V2, unit: "sat" },
        { id: other, unit: "usd" },
      ]),
    )
    expect(units[V2_PREFIX]).toBeUndefined()
    expect(totalsByUnit([{ keysetId: V2_PREFIX, amount: 5 }], units)).toEqual({
      byUnit: [],
      unknown: 5,
    })
  })

  it("never lets a v2 prefix override a v1 id the mint lists exactly", () => {
    const shadow = `${SAT}${"77".repeat(25)}`
    const units = parseKeysetUnits(
      keysetsBody([
        { id: SAT, unit: "sat" },
        { id: shadow, unit: "usd" },
      ]),
    )
    expect(units[SAT]).toBe("sat")
  })

  it("refuses a body with no keyset list, so an error page cannot pass for 'no keysets'", () => {
    expect(() => parseKeysetUnits("<html>502</html>")).toThrow(/no keysets list/)
    expect(() => parseKeysetUnits({})).toThrow(/no keysets list/)
    expect(() => parseKeysetUnits(null)).toThrow(/no keysets list/)
  })
})

describe("fetchKeysetUnits", () => {
  it("GETs the mint's /v1/keysets with a timeout, whatever trailing slash the URL has", async () => {
    get.mockResolvedValue({ data: keysetsBody([{ id: SAT, unit: "sat" }]) })

    await expect(fetchKeysetUnits("https://forge.example/")).resolves.toEqual({
      [SAT]: "sat",
    })
    expect(get).toHaveBeenCalledWith(
      "https://forge.example/v1/keysets",
      expect.objectContaining({ timeout: expect.any(Number) }),
    )
  })

  it("rejects when the mint cannot be reached", async () => {
    get.mockRejectedValue(new Error("Network Error"))
    await expect(fetchKeysetUnits("https://forge.example")).rejects.toThrow(
      "Network Error",
    )
  })
})

describe("unitsForKeysets", () => {
  it("asks the mint once per session", async () => {
    const mint = freshMint()
    get.mockResolvedValue({ data: keysetsBody([{ id: SAT, unit: "sat" }]) })

    await unitsForKeysets([SAT], mint)
    await unitsForKeysets([SAT], mint)

    expect(get).toHaveBeenCalledTimes(1)
  })

  it("asks again when the cached list lacks a keyset on the card — a keyset added since", async () => {
    const mint = freshMint()
    get
      .mockResolvedValueOnce({ data: keysetsBody([{ id: SAT, unit: "sat" }]) })
      .mockResolvedValueOnce({
        data: keysetsBody([
          { id: SAT, unit: "sat" },
          { id: USD, unit: "usd" },
        ]),
      })

    await unitsForKeysets([SAT], mint)
    await expect(unitsForKeysets([SAT, USD], mint)).resolves.toEqual({
      [SAT]: "sat",
      [USD]: "usd",
    })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("does not remember a failed lookup: the next read asks the mint again", async () => {
    const mint = freshMint()
    get
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({ data: keysetsBody([{ id: SAT, unit: "sat" }]) })

    await expect(unitsForKeysets([SAT], mint)).rejects.toThrow("Network Error")
    await expect(unitsForKeysets([SAT], mint)).resolves.toEqual({ [SAT]: "sat" })
  })

  it("defaults to the Flash mint", async () => {
    get.mockResolvedValue({ data: keysetsBody([{ id: SAT, unit: "sat" }]) })
    await unitsForKeysets([SAT])
    expect(get).toHaveBeenCalledWith(
      "https://forge.flashapp.me/v1/keysets",
      expect.anything(),
    )
  })

  describe("with a development build's dev mint (ENG-634)", () => {
    type Dev = { __DEV__: boolean }
    afterEach(() => {
      ;(globalThis as unknown as Dev).__DEV__ = true
      setCardBridge(undefined)
    })

    it("defaults to the dev mint while a card bridge names one", async () => {
      setCardBridge({ url: "http://localhost:9876", mintUrl: "http://localhost:3338" })
      get.mockResolvedValue({ data: keysetsBody([{ id: SAT, unit: "sat" }]) })
      await unitsForKeysets([SAT])
      expect(get).toHaveBeenCalledWith(
        "http://localhost:3338/v1/keysets",
        expect.anything(),
      )
      expect(get).not.toHaveBeenCalledWith(
        "https://forge.flashapp.me/v1/keysets",
        expect.anything(),
      )
    })

    it("never in a release build", async () => {
      setCardBridge({ url: "http://localhost:9876", mintUrl: "http://localhost:3339" })
      ;(globalThis as unknown as Dev).__DEV__ = false
      get.mockResolvedValue({ data: keysetsBody([{ id: SAT, unit: "sat" }]) })
      await unitsForKeysets([SAT])
      expect(get).not.toHaveBeenCalledWith(
        "http://localhost:3339/v1/keysets",
        expect.anything(),
      )
    })
  })
})

describe("totalsByUnit", () => {
  it("sums each unit's keysets and sets aside what no listed keyset accounts for", () => {
    const units = { [SAT]: "sat", "00ffffffffffff01": "sat", [USD]: "usd" }
    expect(
      totalsByUnit(
        [
          { keysetId: USD, amount: 250 },
          { keysetId: SAT, amount: 16 },
          { keysetId: "00ffffffffffff01", amount: 8 },
          { keysetId: "00deadbeefdeadbe", amount: 3 },
        ],
        units,
      ),
    ).toEqual({
      byUnit: [
        { unit: "sat", amount: 24 },
        { unit: "usd", amount: 250 },
      ],
      unknown: 3,
    })
  })

  it("matches a card's keyset id whatever its case", () => {
    expect(
      totalsByUnit([{ keysetId: SAT.toUpperCase(), amount: 5 }], { [SAT]: "sat" }),
    ).toEqual({ byUnit: [{ unit: "sat", amount: 5 }], unknown: 0 })
  })
})

describe("soleUnit", () => {
  it("is the unit when every unspent proof is in that one unit", () => {
    expect(soleUnit({ byUnit: [{ unit: "usd", amount: 5 }], unknown: 0 })).toBe("usd")
  })

  it("is undefined for a mixed card, a card with unlisted keysets, or an empty one", () => {
    expect(
      soleUnit({
        byUnit: [
          { unit: "sat", amount: 5 },
          { unit: "usd", amount: 5 },
        ],
        unknown: 0,
      }),
    ).toBeUndefined()
    expect(soleUnit({ byUnit: [{ unit: "sat", amount: 5 }], unknown: 1 })).toBeUndefined()
    expect(soleUnit({ byUnit: [], unknown: 0 })).toBeUndefined()
  })
})
