import { act, waitFor } from "@testing-library/react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"

import { setCardBridge } from "@app/utils/cashu-card-bridge"
import {
  CardError,
  Transceiver,
  buildSelectApdu,
  statusWordOf,
  toHex,
} from "@app/utils/cashu-card"
import { store } from "@app/store/redux"
import { resetFlashcardV2 } from "@app/store/redux/slices/flashcardV2Slice"

import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  renderProvider,
} from "./flashcard-harness"

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: jest.fn(async () => ({})),
}))

// ENG-634: with a development build's card bridge set, a tap and a card
// operation reach cardsim over HTTP instead of the NFC tag:
//   - nothing in NfcManager is touched: no isSupported/isEnabled, no session,
//     no transceive, no getTag, no release
//   - the operation still sends SELECT first (that is what ends the previous
//     "tap" on cardsim), checks the card, runs the op and re-reads
//   - a transport failure (a plain Error) gets no re-read, as a lost tag
//   - a refusal (a CardError) is re-read, as on NFC
//   - cleared, the bridge leaves the NFC path as it was

const BRIDGE = "http://localhost:9876"
const INS_SELECT = 0xa4
const PUBKEY = [0x02, ...Array.from({ length: 32 }, (_, i) => i + 1)]
const ok = (data: number[]) => [...data, 0x90, 0x00]

/** An empty card with no PIN until SET_PIN, as the applet answers each INS. */
const makeCard = () => {
  let pinSet = false
  return (apdu: number[]): number[] => {
    switch (apdu[1]) {
      case INS_SELECT:
        return ok([0, 6])
      case 0x01:
        return ok([0, 6, 32, 0, 0, 32, 0x0f, pinSet ? 1 : 0])
      case 0x10:
        return ok(PUBKEY)
      case 0x11:
        return ok([0, 0, 0, 0])
      case 0x41:
        pinSet = true
        return ok([])
      case 0x40:
        return [0x63, 0xc2]
      default:
        return [0x6d, 0x00]
    }
  }
}

const fromHex = (hex: string) => (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
const fetchMock = jest.fn()
const realFetch = globalThis.fetch
/** The APDUs cardsim was sent, in order. */
const sent = () =>
  fetchMock.mock.calls.map(([, init]) => fromHex(JSON.parse(init.body).hex))

/** cardsim: answers each POST /apdu with the card's response, 200 whatever the SW. */
const serveCard = (card: (apdu: number[]) => number[]) =>
  fetchMock.mockImplementation(async (url: string, init: { body: string }) => {
    expect(url).toBe(`${BRIDGE}/apdu`)
    return {
      ok: true,
      status: 200,
      json: async () => ({ hex: toHex(card(fromHex(JSON.parse(init.body).hex))) }),
    }
  })

const nfc = NfcManager as unknown as Record<string, jest.Mock> & {
  isoDepHandler: { transceive: jest.Mock }
}
const expectNoNfc = () => {
  expect(nfc.isSupported).not.toHaveBeenCalled()
  expect(nfc.isEnabled).not.toHaveBeenCalled()
  expect(nfc.start).not.toHaveBeenCalled()
  expect(nfc.requestTechnology).not.toHaveBeenCalled()
  expect(nfc.isoDepHandler.transceive).not.toHaveBeenCalled()
  expect(nfc.getTag).not.toHaveBeenCalled()
  expect(nfc.cancelTechnologyRequest).not.toHaveBeenCalled()
}

let latest: FlashcardSnapshot | undefined

const mountAndRead = async () => {
  renderProvider((snapshot) => {
    latest = snapshot
  })
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
  let result: unknown
  await act(async () => {
    result = await latest?.readFlashcard()
  })
  return result
}

describe("FlashcardProvider with a card bridge (development builds)", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  let warn: jest.SpyInstance

  beforeEach(() => {
    latest = undefined
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.clearAllMocks()
    store.dispatch(resetFlashcardV2())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockReset()
    setCardBridge({ url: BRIDGE, mintUrl: "http://localhost:3338", stubPay: true })
  })

  afterEach(() => {
    warn.mockRestore()
    setCardBridge(undefined)
  })

  afterAll(() => {
    globalThis.fetch = realFetch
  })

  it("reads the card over the bridge, with no NFC at all", async () => {
    serveCard(makeCard())
    const result = (await mountAndRead()) as { cashuCard?: { pubkey: string } }
    expect(result.cashuCard?.pubkey).toBe(toHex(PUBKEY))
    await waitFor(() => expect(latest?.cashuCard?.pubkey).toBe(toHex(PUBKEY)))
    expect(sent()[0]).toEqual(buildSelectApdu())
    expectNoNfc()
  })

  it("a tag without the applet ends the read: there is no NDEF tag behind a bridge", async () => {
    serveCard(() => [0x6a, 0x82])
    expect(await mountAndRead()).toEqual({})
    expect(latest?.cashuCard).toBeUndefined()
    expectNoNfc()
  })

  it("runs an operation over the bridge: SELECT first, the identity check, the op, the re-read", async () => {
    serveCard(makeCard())
    await mountAndRead()
    fetchMock.mockClear()
    let result: string | undefined
    await act(async () => {
      result = await latest?.runCardOperation(async (t: Transceiver) => {
        await t([0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34])
        return "done"
      }, toHex(PUBKEY))
    })
    expect(result).toBe("done")
    expect(sent()[0]).toEqual(buildSelectApdu())
    expect(sent().map((apdu) => apdu[1])).toEqual([INS_SELECT, 0x10, 0x41, 0x01, 0x11])
    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("set"))
    expectNoNfc()
  })

  it("a lost bridge answer is a lost tag: rethrown, and no re-read", async () => {
    const card = makeCard()
    serveCard(card)
    await mountAndRead()
    fetchMock.mockClear()
    let calls = 0
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      calls += 1
      // SELECT and GET_PUBKEY answer; the op's write is lost.
      if (calls > 2) throw new TypeError("Network request failed")
      return {
        ok: true,
        status: 200,
        json: async () => ({ hex: toHex(card(fromHex(JSON.parse(init.body).hex))) }),
      }
    })
    let thrown: unknown
    await act(async () => {
      try {
        await latest?.runCardOperation(
          (t: Transceiver) => t([0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34]),
          toHex(PUBKEY),
        )
      } catch (err) {
        thrown = err
      }
    })
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(CardError)
    // SELECT, GET_PUBKEY, the lost SET_PIN: one request each, no retry, no re-read.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expectNoNfc()
  })

  it("a card that refused the op is re-read, as on NFC", async () => {
    serveCard(makeCard())
    await mountAndRead()
    fetchMock.mockClear()
    let thrown: unknown
    await act(async () => {
      try {
        await latest?.runCardOperation(async (t: Transceiver) => {
          const response = await t([0xb0, 0x40, 0x00, 0x00, 0x04, 0x39, 0x39, 0x39, 0x39])
          throw new CardError(statusWordOf(response), "VERIFY_PIN")
        }, toHex(PUBKEY))
      } catch (err) {
        thrown = err
      }
    })
    expect(thrown).toBeInstanceOf(CardError)
    expect(sent().map((apdu) => apdu[1])).toEqual([INS_SELECT, 0x10, 0x40, 0x01, 0x11])
    expectNoNfc()
  })

  it("cleared, the bridge leaves the NFC path as it was", async () => {
    setCardBridge(undefined)
    nfc.requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    const card = makeCard()
    nfc.isoDepHandler.transceive.mockImplementation(async (apdu: number[]) => card(apdu))
    await mountAndRead()
    expect(nfc.isSupported).toHaveBeenCalled()
    expect(nfc.start).toHaveBeenCalled()
    expect(nfc.requestTechnology).toHaveBeenCalledWith([NfcTech.IsoDep, NfcTech.Ndef])
    expect(nfc.cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
