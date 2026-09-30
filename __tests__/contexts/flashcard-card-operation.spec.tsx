import { act, waitFor } from "@testing-library/react-native"
import { Platform } from "react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"

import type { CardOperationOptions } from "@app/contexts/Flashcard"
import {
  AppletNotSelectedError,
  CardError,
  Transceiver,
  WrongCardError,
  buildSelectApdu,
  toHex,
  verifyCardPin,
} from "@app/utils/cashu-card"
import { CARD_TRANSCEIVE_TIMEOUT_MS } from "@app/utils/cashu-card-nfc"
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
//   - on Android the transceive timeout is raised before the first APDU
//   - the card is checked against the pubkey the screen is showing, and the
//     operation never runs against a different card
//   - the card is re-read afterwards so context reflects what the op did; a
//     re-read the card leaves before never turns an op that landed into a
//     failure, and what the op proves stands in for it
//   - a card that refused the op is re-read too (the third wrong PIN blocks
//     it) and the refusal is rethrown unchanged; a different card or a lost
//     channel gets no re-read
//   - every failure is rethrown, after the release, never swallowed
//   - signed out, the card stays in memory: the op writes nothing to the store
//   - the per-unit figures from the tap survive an op that moved no value, and
//     are dropped (never left stale), with the record's unit, by one that did

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
const makeSplitCard = ({ splitFailsAfterLoad = false } = {}) => {
  let balance = 500
  let loaded = false
  const statuses = [...SLOT_STATUSES]
  const proofs: Record<number, number[]> = { 0: PROOF_SLOT }
  return async (bytes: number[]) => {
    switch (bytes[1]) {
      case INS_SELECT:
        return ok([0, 2])
      case 0x01:
        return ok([0, 2, 32, loaded ? 2 : 1, 7, loaded ? 23 : 24, 0x07, 1])
      case 0x10:
        return ok(PUBKEY)
      case 0x11:
        return ok([0, 0, Math.floor(balance / 256) % 256, balance % 256])
      case 0x14:
        if (loaded && splitFailsAfterLoad) throw new Error("Tag was lost")
        return ok(statuses)
      case 0x13:
        return ok(proofs[bytes[2]] ?? PROOF_SLOT)
      case INS_LOAD: {
        // A 1000 proof under the same keyset lands in the first empty slot.
        const slot = statuses.indexOf(0)
        statuses[slot] = 1
        proofs[slot] = [
          0x01,
          ...KEYSET,
          0,
          0,
          0x03,
          0xe8,
          ...new Array(32).fill(0xef),
          0x03,
          ...new Array(32).fill(0x12),
        ]
        balance = 1500
        loaded = true
        return ok([slot])
      }
      case 0x41:
        return ok([])
      default:
        throw new Error(`unsupported ${bytes[1].toString(16)}`)
    }
  }
}

const SET_PIN_APDU = [0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34]
const LOAD_APDU = [0xb0, INS_LOAD, 0x00, 0x00, 0x01, 0x00]
const INS_VERIFY_PIN = 0x40
const CARD_PIN = [0x31, 0x32, 0x33, 0x34]

/**
 * A v0.2.0 card whose PIN is "1234". A wrong VERIFY_PIN costs a try and
 * answers 63CX; the one that spends the last try moves the PIN to blocked
 * (GET_INFO byte 7 = 2) and answers 6983, and a blocked PIN answers 6983 at
 * once (CashuApplet.java@v0.2.0:506-527).
 */
const makePinCard = () => {
  let tries = 3
  let pinState = 1
  return async (bytes: number[]) => {
    switch (bytes[1]) {
      case INS_SELECT:
        return ok([0, 2])
      case 0x01:
        return ok([0, 2, 32, 1, 7, 24, 0x07, pinState])
      case 0x10:
        return ok(PUBKEY)
      case 0x11:
        return ok([0, 0, 0x01, 0xf4])
      case INS_VERIFY_PIN: {
        if (tries === 0) return [0x69, 0x83]
        if (bytes.slice(5).join() === CARD_PIN.join()) {
          tries = 3
          return ok([])
        }
        tries -= 1
        if (tries > 0) return [0x63, 0xc0 + tries]
        pinState = 2
        return [0x69, 0x83]
      }
      default:
        throw new Error(`unsupported ${bytes[1].toString(16)}`)
    }
  }
}

/** A transport failure: the native bridge rejects when the card leaves the field. */
const tagLost = (detail = "") =>
  Object.assign(new Error(`Tag was lost ${detail}`), { name: "TagConnectionLost" })

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const setTransceiveTimeout = NfcManager.setTimeout as unknown as jest.Mock

/** The INS of every APDU the op's session sent, in order. */
const sentIns = () => transceive.mock.calls.map((c) => c[0][1])
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
const runAndCatch = async (
  op: (t: Transceiver) => Promise<unknown>,
  pubkey: string,
  options?: CardOperationOptions,
) => {
  let thrown: unknown
  await act(async () => {
    try {
      await latest?.runCardOperation(op, pubkey, options)
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

  it("opens one IsoDep session, sends SELECT first, checks the card, runs the op, re-reads, releases once", async () => {
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

  it("raises Android's transceive timeout once the session is open, before the first APDU", async () => {
    await mount()
    await readCard()
    setTransceiveTimeout.mockClear()
    const os = jest.replaceProperty(Platform, "OS", "android")
    try {
      await act(async () => {
        await latest?.runCardOperation(async (t) => {
          await t(SET_PIN_APDU)
        }, toHex(PUBKEY))
      })
    } finally {
      os.restore()
    }

    expect(setTransceiveTimeout).toHaveBeenCalledTimes(1)
    expect(setTransceiveTimeout).toHaveBeenCalledWith(CARD_TRANSCEIVE_TIMEOUT_MS)
    const [raisedAt] = setTransceiveTimeout.mock.invocationCallOrder
    expect(raisedAt).toBeGreaterThan(requestTechnology.mock.invocationCallOrder[0])
    expect(raisedAt).toBeLessThan(transceive.mock.invocationCallOrder[0])
  })

  it("refuses to run the op against a different card, re-reads nothing, and still releases", async () => {
    await mount()
    await readCard()
    transceive.mockImplementation(makeCard(OTHER_PUBKEY))
    const op = jest.fn()
    const onReread = jest.fn()

    const thrown = await runAndCatch(op, toHex(PUBKEY), { onReread })

    expect(thrown).toBeInstanceOf(WrongCardError)
    expect(op).not.toHaveBeenCalled()
    // SELECT and GET_PUBKEY only: nothing is read from, or recorded for, a
    // card that is not the one on screen.
    expect(sentIns()).toEqual([INS_SELECT, 0x10])
    expect(onReread).not.toHaveBeenCalled()
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    // Context still shows the card the screen was showing, untouched.
    expect(latest?.cashuCard?.pubkey).toBe(toHex(PUBKEY))
  })

  it("re-reads a card that refused the op, then rethrows the refusal unchanged after releasing", async () => {
    transceive.mockImplementation(makePinCard())
    await mount()
    await readCard()
    let refusal: unknown
    const op = async (t: Transceiver) => {
      try {
        await verifyCardPin(t, "9999")
      } catch (err) {
        refusal = err
        throw err
      }
    }
    const onReread = jest.fn()

    const thrown = await runAndCatch(op, toHex(PUBKEY), { onReread })

    expect(thrown).toBe(refusal)
    expect(thrown).toBeInstanceOf(CardError)
    expect((thrown as CardError).sw).toBe(0x63c2)
    // SELECT, GET_PUBKEY, the refused VERIFY_PIN, then GET_INFO + GET_BALANCE.
    expect(sentIns()).toEqual([INS_SELECT, 0x10, INS_VERIFY_PIN, 0x01, 0x11])
    expect(onReread).toHaveBeenCalledTimes(1)
    expect(onReread).toHaveBeenCalledWith(expect.objectContaining({ pinState: "set" }))
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
  })

  it("three wrong PINs leave the card blocked, in context and on its record", async () => {
    transceive.mockImplementation(makePinCard())
    await mount()
    await readCard()
    expect(latest?.cashuCard?.pinState).toBe("set")
    const reread: string[] = []

    const answers: number[] = []
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const thrown = await runAndCatch((t) => verifyCardPin(t, "9999"), toHex(PUBKEY), {
        onReread: (info) => reread.push(info.pinState),
      })
      answers.push((thrown as CardError).sw)
    }

    expect(answers).toEqual([0x63c2, 0x63c1, 0x6983])
    expect(reread).toEqual(["set", "set", "blocked"])
    // The card screen reads this: a blocked card gets the blocked notice and
    // no PIN action, never the "set" notice it had before.
    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("blocked"))
    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].pinState).toBe("blocked")
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(3)
  })

  const unanswered = [
    { name: "a channel lost mid-op", error: tagLost() },
    {
      name: "a tag the applet cannot be selected on",
      error: new AppletNotSelectedError(0x6a82, 0x6a82),
    },
  ]
  unanswered.forEach(({ name, error }) => {
    it(`${name}: rethrown after releasing, with no re-read`, async () => {
      await mount()
      await readCard()
      const onReread = jest.fn()
      const op = jest.fn(async (t: Transceiver) => {
        await t(SET_PIN_APDU)
        throw error
      })

      const thrown = await runAndCatch(op, toHex(PUBKEY), { onReread })

      expect(thrown).toBe(error)
      expect(sentIns()).toEqual([INS_SELECT, 0x10, 0x41])
      expect(onReread).not.toHaveBeenCalled()
      expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    })
  })

  it("a card that leaves after the op landed: the op's result stands, and what it proves is applied", async () => {
    await mount()
    await readCard()
    expect(latest?.cashuCard?.pinState).toBe("unset")
    // SET_PIN lands (the card now holds the PIN); the card is gone by GET_INFO.
    const card = makeCard(PUBKEY)
    transceive.mockImplementation(async (bytes: number[]) => {
      if (bytes[1] === 0x01) throw tagLost("lnurlw://secret.example/withdraw")
      return card(bytes)
    })
    const onReread = jest.fn()

    let result: string | undefined
    await act(async () => {
      result = await latest?.runCardOperation(
        async (t) => {
          await t(SET_PIN_APDU)
          return "done"
        },
        toHex(PUBKEY),
        { assume: { pinState: "set" }, onReread },
      )
    })

    expect(result).toBe("done")
    expect(sentIns()).toEqual([INS_SELECT, 0x10, 0x41, 0x01])
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    expect(onReread).not.toHaveBeenCalled()
    // The card screen must not keep offering "Set PIN" for a card with one.
    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("set"))
    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].pinState).toBe("set")
    // The lost re-read is logged by error name alone, never its message.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("re-read"),
      "TagConnectionLost",
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret.example")
  })

  it("a lost re-read with nothing assumed leaves the card on screen as it was", async () => {
    await mount()
    await readCard()
    const card = makeCard(PUBKEY)
    transceive.mockImplementation(async (bytes: number[]) => {
      if (bytes[1] === 0x11) throw tagLost()
      return card(bytes)
    })

    const thrown = await runAndCatch(async (t) => {
      await t(SET_PIN_APDU)
    }, toHex(PUBKEY))

    expect(thrown).toBeUndefined()
    expect(latest?.cashuCard?.pinState).toBe("unset")
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
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

  it("an op that moves value re-reads the keyset split in the same session and names its units; the old split's late answer never lands", async () => {
    // The mint answers each lookup only when the spec says so.
    const answers: ((units: Record<string, string>) => void)[] = []
    lookupUnits.mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve)
        }),
    )
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    expect(latest?.cashuCard?.keysets).toEqual([{ keysetId: KEYSET_HEX, amount: 500 }])
    await waitFor(() => expect(answers).toHaveLength(1))

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(LOAD_APDU)
      }, toHex(PUBKEY))
    })

    // The new total, and the split read with it while the card was there.
    expect(latest?.cashuCard?.balance).toBe(1500)
    expect(latest?.cashuCard?.keysets).toEqual([{ keysetId: KEYSET_HEX, amount: 1500 }])
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    await waitFor(() => expect(answers).toHaveLength(2))

    // The answer about the split read at 500 arrives late: it does not land.
    await act(async () => {
      answers[0]({ [KEYSET_HEX]: "sat" })
    })
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBeUndefined()

    // The answer about the new split names the unit of the whole new total.
    await act(async () => {
      answers[1]({ [KEYSET_HEX]: "sat" })
    })
    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [{ unit: "sat", amount: 1500 }],
      unknown: 0,
    })
    const record = store.getState().flashcardV2.cards[toHex(PUBKEY)]
    expect(record.lastBalance).toBe(1500)
    expect(record.unit).toBe("sat")
  })

  it("an op that moves value, when the split cannot be re-read, leaves the total 'unit unknown' and clears the record's unit", async () => {
    transceive.mockImplementation(makeSplitCard({ splitFailsAfterLoad: true }))
    await mount()
    await readCard()
    await waitFor(() =>
      expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBe("sat"),
    )
    lookupUnits.mockClear()

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(LOAD_APDU)
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.balance).toBe(1500)
    expect(latest?.cashuCard?.keysets).toBeUndefined()
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    // Nothing to ask the mint about: a unit for a total whose split nobody
    // read would say every unspent proof is in it.
    expect(lookupUnits).not.toHaveBeenCalled()
    const record = store.getState().flashcardV2.cards[toHex(PUBKEY)]
    expect(record.lastBalance).toBe(1500)
    expect(record.unit).toBeUndefined()
  })

  it("an op that moves no value keeps the unit on the card's record", async () => {
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    await waitFor(() =>
      expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBe("sat"),
    )

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(SET_PIN_APDU)
      }, toHex(PUBKEY))
    })

    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBe("sat")
  })
})
