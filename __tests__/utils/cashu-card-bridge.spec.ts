/**
 * ENG-634: the development-only simulated card (cardsim over HTTP). These pin
 * what keeps it out of release builds and away from real money:
 *   - every entry point answers undefined, or does nothing, when __DEV__ is
 *     false: no bridge, no dev mint, no pay stub, no dev link
 *   - the production mint is refused as a dev mint, in any spelling, and the
 *     pay stub is refused without a dev mint
 *   - the transport sends one request per APDU and never retries, and every
 *     failure is a plain Error (a lost tag), never a CardError (a refusal)
 */
import { CASHU_MINT_URL } from "@app/config/appinfo"
import {
  bridgeTransceiver,
  cardMintUrl,
  getCardBridge,
  isDevLink,
  isProductionMint,
  parseCardBridgeLink,
  setCardBridge,
  stubbedPayOutcome,
} from "@app/utils/cashu-card-bridge"
import { CardError } from "@app/utils/cashu-card"

const BRIDGE = "http://localhost:9876"
const MINT = "http://localhost:3338"

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}

const fetchMock = jest.fn()
const realFetch = globalThis.fetch

beforeEach(() => {
  setDev(true)
  setCardBridge(undefined)
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterAll(() => {
  setDev(true)
  setCardBridge(undefined)
  globalThis.fetch = realFetch
})

const answer = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })

describe("setCardBridge", () => {
  it("sets the bridge, its dev mint and the pay stub, without trailing slashes", () => {
    setCardBridge({ url: `${BRIDGE}/`, mintUrl: `${MINT}//`, stubPay: true })
    expect(getCardBridge()).toEqual({ url: BRIDGE, mintUrl: MINT, stubPay: true })
    expect(cardMintUrl()).toBe(MINT)
  })

  it("clears it with undefined: the card is NFC again, and the mint the production one", () => {
    setCardBridge({ url: BRIDGE, mintUrl: MINT })
    setCardBridge(undefined)
    expect(getCardBridge()).toBeUndefined()
    expect(cardMintUrl()).toBe(CASHU_MINT_URL)
  })

  it("keeps the production mint without a dev mint", () => {
    setCardBridge({ url: BRIDGE })
    expect(cardMintUrl()).toBe(CASHU_MINT_URL)
  })
  ;[
    CASHU_MINT_URL,
    "https://FORGE.flashapp.me/",
    "http://forge.flashapp.me:3338",
    "https://forge.flashapp.me/v1",
  ].forEach((mintUrl) => {
    it(`refuses the production mint as a dev mint (${mintUrl})`, () => {
      expect(() => setCardBridge({ url: BRIDGE, mintUrl, stubPay: true })).toThrow(
        /production mint/,
      )
      expect(getCardBridge()).toBeUndefined()
    })
  })

  it("refuses the pay stub without a dev mint", () => {
    expect(() => setCardBridge({ url: BRIDGE, stubPay: true })).toThrow(/dev mint/)
    expect(getCardBridge()).toBeUndefined()
  })
  ;["localhost:9876", "ftp://localhost:9876", "mailto:card@localhost", ""].forEach(
    (url) => {
      it(`refuses a bridge URL that is not http(s): "${url}"`, () => {
        expect(() => setCardBridge({ url })).toThrow(/http/)
      })
    },
  )

  it("refuses a dev mint URL that is not http(s)", () => {
    expect(() => setCardBridge({ url: BRIDGE, mintUrl: "localhost:3338" })).toThrow(
      /mint URL/,
    )
  })

  it("leaves the previous bridge in place when a new one is refused", () => {
    setCardBridge({ url: BRIDGE, mintUrl: MINT })
    expect(() => setCardBridge({ url: BRIDGE, mintUrl: CASHU_MINT_URL })).toThrow()
    expect(getCardBridge()).toEqual({ url: BRIDGE, mintUrl: MINT, stubPay: false })
  })
})

describe("isProductionMint", () => {
  it("matches the production mint's host only", () => {
    expect(isProductionMint(CASHU_MINT_URL)).toBe(true)
    expect(isProductionMint(MINT)).toBe(false)
    expect(isProductionMint("https://forge.flashapp.me.evil.test")).toBe(false)
    expect(isProductionMint("not a url")).toBe(false)
  })
})

describe("stubbedPayOutcome", () => {
  it("is paid only with the stub on and a dev mint set", () => {
    setCardBridge({ url: BRIDGE, mintUrl: MINT, stubPay: true })
    expect(stubbedPayOutcome()).toEqual({ kind: "paid" })
  })

  it("is undefined with the stub off, with no bridge, or with no dev mint", () => {
    expect(stubbedPayOutcome()).toBeUndefined()
    setCardBridge({ url: BRIDGE, mintUrl: MINT, stubPay: false })
    expect(stubbedPayOutcome()).toBeUndefined()
    setCardBridge({ url: BRIDGE })
    expect(stubbedPayOutcome()).toBeUndefined()
  })
})

describe("in a release build (__DEV__ false)", () => {
  it("sets nothing, reads nothing and stubs nothing", () => {
    setCardBridge({ url: BRIDGE, mintUrl: MINT, stubPay: true })
    setDev(false)
    expect(getCardBridge()).toBeUndefined()
    expect(cardMintUrl()).toBe(CASHU_MINT_URL)
    expect(stubbedPayOutcome()).toBeUndefined()
    setCardBridge(undefined)
    setDev(true)
    // The release build's clear was a no-op too: the dev bridge is still here.
    expect(getCardBridge()).toEqual({ url: BRIDGE, mintUrl: MINT, stubPay: true })
  })

  it("ignores a bridge set in a release build", () => {
    setDev(false)
    setCardBridge({ url: BRIDGE, mintUrl: MINT, stubPay: true })
    setDev(true)
    expect(getCardBridge()).toBeUndefined()
  })

  it("reads no dev link", () => {
    setDev(false)
    expect(parseCardBridgeLink(`flash://dev/card-bridge?url=${BRIDGE}`)).toBeUndefined()
    expect(parseCardBridgeLink("flash://dev/card-tap")).toBeUndefined()
  })
})

describe("parseCardBridgeLink", () => {
  it("reads a bridge link with a dev mint and the pay stub", () => {
    expect(
      parseCardBridgeLink(
        `flash://dev/card-bridge?url=${encodeURIComponent(
          BRIDGE,
        )}&mint=${encodeURIComponent(MINT)}&stubPay=1`,
      ),
    ).toEqual({ kind: "bridge", config: { url: BRIDGE, mintUrl: MINT, stubPay: true } })
  })

  it("reads a bridge link with neither, unencoded", () => {
    expect(parseCardBridgeLink(`flash://dev/card-bridge?url=${BRIDGE}`)).toEqual({
      kind: "bridge",
      config: { url: BRIDGE, mintUrl: undefined, stubPay: false },
    })
  })

  it("reads off=1 as clearing the bridge", () => {
    expect(parseCardBridgeLink("flash://dev/card-bridge?off=1")).toEqual({
      kind: "bridge",
      config: undefined,
    })
  })

  it("reads the tap link", () => {
    expect(parseCardBridgeLink("flash://dev/card-tap")).toEqual({ kind: "tap" })
    expect(parseCardBridgeLink("flash://dev/card-tap/")).toEqual({ kind: "tap" })
  })
  ;[
    "flash://dev/card-bridge",
    "flash://dev/card-bridge?mint=http://localhost:3338",
    "flash://dev/other",
    "flash://card-tap",
    "flash://payment/dev/card-tap",
    "https://pay.getflash.io/dev/card-tap",
    "lightning:lnbc1",
    "garbage",
    "",
  ].forEach((url) => {
    it(`reads nothing from "${url}"`, () => {
      expect(parseCardBridgeLink(url)).toBeUndefined()
    })
  })
})

describe("isDevLink", () => {
  it("is true for flash://dev/ links only", () => {
    expect(isDevLink("flash://dev/card-tap")).toBe(true)
    expect(isDevLink("FLASH://dev/card-bridge?off=1")).toBe(true)
    expect(isDevLink("flash://devon")).toBe(false)
    expect(isDevLink("https://pay.getflash.io/dev")).toBe(false)
    expect(isDevLink("https://pay.getflash.io/dev/card-tap")).toBe(false)
    expect(isDevLink(null)).toBe(false)
    expect(isDevLink(undefined)).toBe(false)
  })
})

describe("bridgeTransceiver", () => {
  const SELECT = [0x00, 0xa4, 0x04, 0x00, 0x07, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02]

  it("posts the APDU as hex to /apdu and answers the bytes cardsim sent back", async () => {
    answer(200, { hex: "00069000", sw: "9000" })
    await expect(bridgeTransceiver(`${BRIDGE}/`)(SELECT)).resolves.toEqual([
      0x00, 0x06, 0x90, 0x00,
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BRIDGE}/apdu`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ hex: "00a4040007d2760000850102" })
  })

  it("hands a refusal back as the card's status word: cardsim answers it 200", async () => {
    answer(200, { hex: "63C2", sw: "63C2" })
    await expect(bridgeTransceiver(BRIDGE)([0xb0, 0x40, 0, 0])).resolves.toEqual([
      0x63, 0xc2,
    ])
  })

  const failures: [string, () => void][] = [
    ["a non-2xx answer", () => answer(500, { error: "boom" })],
    ["a network error", () => fetchMock.mockRejectedValueOnce(new TypeError("offline"))],
    ["a body that is not hex", () => answer(200, { hex: "zz" })],
    ["a body with no status word", () => answer(200, { hex: "90" })],
    ["a body with no hex", () => answer(200, { error: "?" })],
  ]

  failures.forEach(([name, fail]) => {
    it(`throws a plain Error, never a CardError, on ${name}, and never retries`, async () => {
      fail()
      const err = await bridgeTransceiver(BRIDGE)(SELECT).catch((e) => e)
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(CardError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it("gives up after its timeout, as a lost tag, without a retry", async () => {
    jest.useFakeTimers()
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              const abort = new Error("aborted")
              abort.name = "AbortError"
              reject(abort)
            })
          }),
      )
      const pending = bridgeTransceiver(BRIDGE, 5000)(SELECT).catch((e) => e)
      jest.advanceTimersByTime(5000)
      const err = await pending
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(CardError)
      expect(err.message).toMatch(/AbortError/)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it("never puts the APDU, which can carry a PIN, in its error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline 31323334"))
    const err = await bridgeTransceiver(BRIDGE)([
      0xb0, 0x40, 0, 0, 4, 0x31, 0x32, 0x33, 0x34,
    ]).catch((e) => e)
    expect(err.message).not.toMatch(/3132/)
  })
})
