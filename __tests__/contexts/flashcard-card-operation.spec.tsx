import { act, waitFor } from "@testing-library/react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"

import { WrongCardError, buildSelectApdu, toHex } from "@app/utils/cashu-card"
import { unitsForKeysets } from "@app/utils/cashu-mint"
import { store } from "@app/store/redux"
import { resetFlashcardV2 } from "@app/store/redux/slices/flashcardV2Slice"
import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  ProviderOptions,
  renderProvider,
} from "./flashcard-harness"

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
// A read asks the mint for keyset units; no spec reaches the network.
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: jest.fn(),
}))

// `runCardOperation` is the one door every card-changing flow goes through
// (PIN today; load and spend next). This pins its shape:
//   - one IsoDep-only session, SELECT first, released exactly once
//   - the card is checked against the pubkey the screen is showing, and the
//     operation never runs against a different card
//   - the card is re-read afterwards so context reflects what the op did
//   - every failure is rethrown, after the release, never swallowed
//   - signed out, the card stays in memory: the op writes nothing to the store
//   - the per-unit figures from the tap survive an op that moved no value, and
//     are dropped (never left stale) by one that did

const ok = (data: number[]) => [...data, 0x90, 0x00]
const INS_SELECT = 0xa4
const PUBKEY = [0x02, ...Array.from({ length: 32 }, (_, i) => i + 1)]
const OTHER_PUBKEY = [0x03, ...Array.from({ length: 32 }, (_, i) => 99 - i)]

/** A card whose PIN state flips to "set" once SET_PIN has been sent. */
const makeCard = (pubkey: number[]) => {
  let pinSet = false
  return async (bytes: number[]) => {
    switch (bytes[1]) {
      case INS_SELECT:
        return ok([0, 2])
      case 0x01:
        return ok([0, 2, 32, 1, 7, 24, 0x07, pinSet ? 1 : 0])
      case 0x10:
        return ok(pubkey)
      case 0x11:
        return ok([0, 0, 0x01, 0xf4])
      case 0x41:
        pinSet = true
        return ok([])
      default:
        throw new Error(`unsupported ${bytes[1].toString(16)}`)
    }
  }
}

const KEYSET = [0x00, 0x59, 0x53, 0x4c, 0xe0, 0xbf, 0xa1, 0x9a]
const KEYSET_HEX = "0059534ce0bfa19a"
/** One unspent 500 proof in slot 0, the rest spent or empty. */
const SLOT_STATUSES = [1, ...new Array(7).fill(2), ...new Array(24).fill(0)]
const PROOF_SLOT = [
  0x01,
  ...KEYSET,
  0,
  0,
  0x01,
  0xf4,
  ...new Array(32).fill(0xab),
  0x02,
  ...new Array(32).fill(0xcd),
]
const INS_LOAD = 0x30

/**
 * A card that also answers the keyset split (GET_SLOT_STATUS, GET_PROOF), so a
 * read carries per-unit figures. LOAD_PROOF stands in for any op that moves
 * value: it takes the balance from 500 to 1500.
 */
const makeSplitCard = () => {
  let balance = 500
  return async (bytes: number[]) => {
    switch (bytes[1]) {
      case INS_SELECT:
        return ok([0, 2])
      case 0x01:
        return ok([0, 2, 32, 1, 7, 24, 0x07, 1])
      case 0x10:
        return ok(PUBKEY)
      case 0x11:
        return ok([0, 0, Math.floor(balance / 256) % 256, balance % 256])
      case 0x14:
        return ok(SLOT_STATUSES)
      case 0x13:
        return ok(PROOF_SLOT)
      case INS_LOAD:
        balance = 1500
        return ok([0x01])
      case 0x41:
        return ok([])
      default:
        throw new Error(`unsupported ${bytes[1].toString(16)}`)
    }
  }
}

const SET_PIN_APDU = [0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34]
const LOAD_APDU = [0xb0, INS_LOAD, 0x00, 0x00, 0x01, 0x00]

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const getTag = NfcManager.getTag as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock
const lookupUnits = unitsForKeysets as jest.Mock

let latest: FlashcardSnapshot | undefined

const mount = async (options: ProviderOptions = {}) => {
  renderProvider((snapshot) => {
    latest = snapshot
  }, options)
  await waitFor(() => expect(latest?.runCardOperation).toBeDefined())
}

/** Read the card first so context holds it, as a screen would. */
const readCard = async () => {
  requestTechnology.mockResolvedValueOnce(NfcTech.IsoDep)
  await act(async () => {
    await latest?.readFlashcard(false)
  })
  await waitFor(() => expect(latest?.cashuCard?.pubkey).toBe(toHex(PUBKEY)))
  // Forget the read's own session so the counts below are the op's alone.
  requestTechnology.mockClear()
  cancelTechnologyRequest.mockClear()
  transceive.mockClear()
}

/** Runs the op the way a screen does and hands back what it threw, if anything. */
const runAndCatch = async (op: jest.Mock, pubkey: string) => {
  let thrown: unknown
  await act(async () => {
    try {
      await latest?.runCardOperation(op, pubkey)
    } catch (error) {
      thrown = error
    }
  })
  return thrown
}

describe("FlashcardProvider runCardOperation", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  let warn: jest.SpyInstance

  beforeEach(() => {
    latest = undefined
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    requestTechnology.mockReset().mockResolvedValue(NfcTech.IsoDep)
    transceive.mockReset().mockImplementation(makeCard(PUBKEY))
    getTag.mockReset()
    lookupUnits.mockReset().mockResolvedValue({ [KEYSET_HEX]: "sat" })
    store.dispatch(resetFlashcardV2())
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  it("opens one IsoDep session, SELECTs first, checks the card, runs the op, re-reads, releases once", async () => {
    await mount()
    await readCard()
    const op = jest.fn(async (t: (b: number[]) => Promise<number[]>) => {
      await t([0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34])
      return "done"
    })

    let result: string | undefined
    await act(async () => {
      result = await latest?.runCardOperation(op, toHex(PUBKEY))
    })

    expect(result).toBe("done")
    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(requestTechnology).toHaveBeenCalledWith(NfcTech.IsoDep)
    // SELECT, GET_PUBKEY (the identity check), the op's APDU, then the
    // re-read: GET_INFO and GET_BALANCE.
    const sent = transceive.mock.calls.map((c) => c[0])
    expect(sent[0]).toEqual(buildSelectApdu())
    expect(sent.map((a) => a[1])).toEqual([INS_SELECT, 0x10, 0x41, 0x01, 0x11])
    expect(op).toHaveBeenCalledTimes(1)
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    expect(getTag).not.toHaveBeenCalled()
    // The re-read reached context and the store: the PIN is now set.
    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("set"))
    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].pinState).toBe("set")
  })

  it("refuses to run the op against a different card, and still releases", async () => {
    await mount()
    await readCard()
    transceive.mockImplementation(makeCard(OTHER_PUBKEY))
    const op = jest.fn()

    const thrown = await runAndCatch(op, toHex(PUBKEY))

    expect(thrown).toBeInstanceOf(WrongCardError)
    expect(op).not.toHaveBeenCalled()
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    // Context still shows the card the screen was showing, untouched.
    expect(latest?.cashuCard?.pubkey).toBe(toHex(PUBKEY))
  })

  it("rethrows the op's failure after releasing, and does not re-read", async () => {
    await mount()
    await readCard()
    const op = jest.fn(async () => {
      throw new Error("63C2")
    })

    const thrown = await runAndCatch(op, toHex(PUBKEY))

    expect(thrown).toEqual(new Error("63C2"))
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    const sent = transceive.mock.calls.map((c) => c[0][1])
    expect(sent).not.toContain(0x01)
    expect(sent).not.toContain(0x11)
  })

  it("a cancelled tap rejects before the op runs and releases once", async () => {
    await mount()
    await readCard()
    requestTechnology.mockRejectedValue(new Error("UserCancel"))
    const op = jest.fn()

    const thrown = await runAndCatch(op, toHex(PUBKEY))

    expect(thrown).toEqual(new Error("UserCancel"))
    expect(op).not.toHaveBeenCalled()
    expect(transceive).not.toHaveBeenCalled()
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
  })

  it("signed out: the op runs and context shows the result, but nothing reaches the store", async () => {
    await mount({ isAuthed: false })
    await readCard()

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(SET_PIN_APDU)
      }, toHex(PUBKEY))
    })

    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("set"))
    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)]).toBeUndefined()
  })

  it("an op that moves no value keeps the tap's per-unit figures", async () => {
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    const before = latest?.cashuCard

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(SET_PIN_APDU)
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.balance).toBe(500)
    expect(latest?.cashuCard?.keysets).toBe(before?.keysets)
    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [{ unit: "sat", amount: 500 }],
      unknown: 0,
    })
  })

  it("an op that moves value drops the per-unit figures, and a late mint answer does not restore them", async () => {
    // The mint answers only when the spec says so: after the op has run.
    let answerMint: (units: Record<string, string>) => void = () => {}
    lookupUnits.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerMint = resolve
        }),
    )
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    expect(latest?.cashuCard?.keysets).toEqual([{ keysetId: KEYSET_HEX, amount: 500 }])
    await waitFor(() => expect(lookupUnits).toHaveBeenCalledTimes(1))

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(LOAD_APDU)
      }, toHex(PUBKEY))
    })

    // The new total stands; the split read at 500 no longer describes it.
    expect(latest?.cashuCard?.balance).toBe(1500)
    expect(latest?.cashuCard?.keysets).toBeUndefined()
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()

    await act(async () => {
      answerMint({ [KEYSET_HEX]: "sat" })
    })
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    expect(latest?.cashuCard?.balance).toBe(1500)
  })
})
