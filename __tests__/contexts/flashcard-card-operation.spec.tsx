import { act, screen, waitFor } from "@testing-library/react-native"
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
import {
  keysetUnitsLearned,
  resetFlashcardV2,
} from "@app/store/redux/slices/flashcardV2Slice"
import { createFakeCard } from "../helpers/fake-cashu"
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
// The tip header is fetched off the tap; no spec reaches the network for it.
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: jest.fn(async () => undefined),
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
//     are replaced by one that did: labelled at once when the mint named the
//     new split's keysets before, otherwise dropped (never left stale), with
//     the record's unit

const INS_SELECT = 0xa4
const OTHER_CARD_KEY = "09".repeat(32)
const fromHex = (hex: string) => (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
/** The fake card's key; OTHER_CARD_KEY makes another card, which the identity check refuses. */
const PUBKEY = fromHex(createFakeCard(1).pubkey)

/**
 * An open 2.0 card (no owner, no PIN): SET_PIN sets its PIN, and GET_INFO
 * says so from then on.
 */
const makeCard = (cardKey?: string) => {
  const card = createFakeCard(128, { owner: null, cardKey })
  return (bytes: number[]) => card.transceive(bytes)
}

const KEYSET = [0x00, 0x59, 0x53, 0x4c, 0xe0, 0xbf, 0xa1, 0x9a]
const KEYSET_HEX = "0059534ce0bfa19a"
/** A keyset the mint names `usd`, beside KEYSET (`sat`) on a card holding both. */
const USD_KEYSET = [0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x01]
const USD_KEYSET_HEX = "00aabbccddeeff01"
const INS_CLEAR_SPENT = 0x31

const u32 = (n: number) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256)
/** A 2.0 slot: status, keyset, amount, nonce (first byte `nonceByte`), C, date. */
// eslint-disable-next-line max-params -- a slot's own fields, in their order
const slotOf = (status: number, keyset: number[], amount: number, nonceByte = 0xab) => [
  status,
  ...keyset,
  ...u32(amount),
  nonceByte,
  ...new Array(31).fill(0xab),
  0x02,
  ...new Array(32).fill(0xcd),
  0,
  0,
  0,
  0,
]

/**
 * A card that also answers the keyset split (GET_PIECES, GET_PROOF), so a
 * read carries per-unit figures: one unspent 500 in slot 0 and spent slots
 * 1-7, owned, with no PIN. LOAD_APDU stands in for any op that moves value:
 * it takes the balance from 500 to 1500, loading 1000 under `loadKeyset`
 * (`LOAD_APDU`'s keyset, KEYSET unless a spec builds another).
 */
const makeSplitCard = ({ splitFailsAfterLoad = false } = {}) => {
  const card = createFakeCard(128)
  card.slots[0] = slotOf(1, KEYSET, 500)
  for (let slot = 1; slot <= 7; slot += 1) card.slots[slot] = slotOf(2, KEYSET, 500, slot)
  let loaded = false
  return async (bytes: number[]) => {
    if (bytes[1] === 0x30) loaded = true
    if (loaded && splitFailsAfterLoad && bytes[1] === 0x17)
      throw new Error("Tag was lost")
    return card.transceive(bytes)
  }
}

/** LOAD_PROOF of one 1000 piece under `keyset`: 81 bytes, the date 0. */
const loadApdu = (keyset = KEYSET) => {
  const piece = [
    ...keyset,
    ...u32(1000),
    ...new Array(32).fill(0xef),
    0x03,
    ...new Array(32).fill(0x12),
    0,
    0,
    0,
    0,
  ]
  return [0xb0, 0x30, 0x00, 0x00, piece.length, ...piece, 0x01]
}
const LOAD_APDU = loadApdu()
/** An op that moves no value and writes nothing a read can see: the phone's time, a note. */
const NO_VALUE_APDU = [0xb0, 0x37, 0x00, 0x00, 0x04, 0x6a, 0xcc, 0xec, 0xf4]
const SET_PIN_APDU = [0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34]
const CLEAR_SPENT_APDU = [0xb0, INS_CLEAR_SPENT, 0x00, 0x00, 0x01]
const INS_VERIFY_PIN = 0x40
const CLEAR = (pubkey: number[]) => ({ sealed: false, cardPubkey: toHex(pubkey) })

/**
 * A 2.0 card whose PIN is "1234", taken in the clear. A wrong VERIFY_PIN costs
 * a try and answers 63CX; the one that spends the last try blocks the PIN
 * (GET_INFO byte 7 = 2) and answers 6983, and a blocked PIN answers 6983 at
 * once (spec/APDU.md, VERIFY_PIN).
 */
const makePinCard = () => {
  const card = createFakeCard(128, { pin: "1234" })
  return (bytes: number[]) => card.transceive(bytes)
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
    transceive.mockReset().mockImplementation(makeCard())
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
    // re-read: GET_INFO, GET_BALANCE and GET_CARD (the record an op can change).
    const sent = transceive.mock.calls.map((c) => c[0])
    expect(sent[0]).toEqual(buildSelectApdu())
    expect(sent.map((a) => a[1])).toEqual([INS_SELECT, 0x10, 0x41, 0x01, 0x11, 0x16])
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
    transceive.mockImplementation(makeCard(OTHER_CARD_KEY))
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
        await verifyCardPin(t, "9999", CLEAR(PUBKEY))
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
    // SELECT, GET_PUBKEY, the refused VERIFY_PIN, then GET_INFO + GET_BALANCE + GET_CARD.
    expect(sentIns()).toEqual([INS_SELECT, 0x10, INS_VERIFY_PIN, 0x01, 0x11, 0x16])
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
      const thrown = await runAndCatch(
        (t) => verifyCardPin(t, "9999", CLEAR(PUBKEY)),
        toHex(PUBKEY),
        {
          onReread: (info) => reread.push(info.pinState),
        },
      )
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
    const card = makeCard()
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
    const card = makeCard()
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

  it("applies what the op taught this phone (the owner key's source, after a setup) once it succeeded, and only then", async () => {
    await mount()
    await readCard()
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()

    const refused = await runAndCatch(
      async () => {
        throw new CardError(0x6a91, "SET_OWNER")
      },
      toHex(PUBKEY),
      { learned: { ownerKeySource: "seed" } },
    )
    expect(refused).toBeInstanceOf(CardError)
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()

    await act(async () => {
      await latest?.runCardOperation(async () => "done", toHex(PUBKEY), {
        learned: { ownerKeySource: "device" },
      })
    })
    await waitFor(() => expect(latest?.cashuCard?.ownerKeySource).toBe("device"))
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
        await t(NO_VALUE_APDU)
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.balance).toBe(500)
    expect(latest?.cashuCard?.keysets).toBe(before?.keysets)
    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [{ unit: "sat", amount: 500 }],
      unknown: 0,
    })
  })

  it("an op that frees spent slots re-reads them in the same session, and keeps the tap's per-unit figures: the balance did not move", async () => {
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    const before = latest?.cashuCard
    expect(before?.spent).toBe(7)
    expect(before?.spentSlots?.map((slot) => slot.slot)).toEqual([1, 2, 3, 4, 5, 6, 7])

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(CLEAR_SPENT_APDU)
      }, toHex(PUBKEY))
    })

    // The spent count moved, so the slots were read again: none left.
    expect(latest?.cashuCard).toMatchObject({ balance: 500, spent: 0, empty: 127 })
    expect(latest?.cashuCard?.spentSlots).toEqual([])
    // One page of pieces, and no spent slot left to read by GET_PROOF.
    expect(sentIns().filter((ins) => ins === 0x17)).toHaveLength(1)
    expect(sentIns()).not.toContain(0x13)
    // The value did not move: the split and its units stand.
    expect(latest?.cashuCard?.keysets).toBe(before?.keysets)
    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [{ unit: "sat", amount: 500 }],
      unknown: 0,
    })
  })

  it("an op that moves no value and frees no slot reads no slots: the spent slots stand as the tap read them", async () => {
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    const before = latest?.cashuCard

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(NO_VALUE_APDU)
      }, toHex(PUBKEY))
    })

    expect(sentIns()).not.toContain(0x17)
    expect(sentIns()).not.toContain(0x14)
    expect(latest?.cashuCard?.spentSlots).toBe(before?.spentSlots)
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
    expect(store.getState().flashcardV2.keysetUnits).toBeUndefined()
    await act(async () => {
      answers[0]({ [KEYSET_HEX]: "sat" })
    })
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBeUndefined()
    // Its units are kept, though: they are facts about the mint, not the card.
    expect(store.getState().flashcardV2.keysetUnits).toEqual({ [KEYSET_HEX]: "sat" })

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

  it("an op that moves value is labelled at once when the mint named its keysets before", async () => {
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    // The mint is slow to answer about the new split: the label does not wait.
    lookupUnits.mockReturnValue(
      new Promise(() => {
        // never answers
      }),
    )

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(LOAD_APDU)
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.balance).toBe(1500)
    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [{ unit: "sat", amount: 1500 }],
      unknown: 0,
    })
    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBe("sat")
  })

  it("an op that moves value into a second unit is labelled at once, and names no single unit on the card's record", async () => {
    store.dispatch(keysetUnitsLearned({ [KEYSET_HEX]: "sat", [USD_KEYSET_HEX]: "usd" }))
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    await waitFor(() =>
      expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBe("sat"),
    )
    // The mint is slow to answer about the new split: the label does not wait.
    lookupUnits.mockReturnValue(
      new Promise(() => {
        // never answers
      }),
    )

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(loadApdu(USD_KEYSET))
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.balance).toBe(1500)
    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [
        { unit: "sat", amount: 500 },
        { unit: "usd", amount: 1000 },
      ],
      unknown: 0,
    })
    // Two units, so no one unit for the home row to value all 1500 in.
    const record = store.getState().flashcardV2.cards[toHex(PUBKEY)]
    expect(record.lastBalance).toBe(1500)
    expect(record.unit).toBeUndefined()
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

  it("an op that moves value replaces the card's pieces with those read in the same session (ENG-700)", async () => {
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    // The tap's read: the unspent 500 alone, the spent slots left out.
    expect(latest?.cashuCard?.pieces).toEqual([500])

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(LOAD_APDU)
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.balance).toBe(1500)
    expect(latest?.cashuCard?.pieces).toEqual([500, 1000])
  })

  it("an op that moves value, when the split cannot be re-read, drops the card's pieces: the next top-up shapes its amount alone", async () => {
    transceive.mockImplementation(makeSplitCard({ splitFailsAfterLoad: true }))
    await mount()
    await readCard()
    expect(latest?.cashuCard?.pieces).toEqual([500])

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(LOAD_APDU)
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.balance).toBe(1500)
    expect(latest?.cashuCard?.pieces).toBeUndefined()
  })

  it("an op that moves no value keeps the card's pieces as the tap read them, even when it frees spent slots", async () => {
    transceive.mockImplementation(makeSplitCard())
    await mount()
    await readCard()
    const before = latest?.cashuCard?.pieces
    expect(before).toEqual([500])

    await act(async () => {
      await latest?.runCardOperation(async (t) => {
        await t(CLEAR_SPENT_APDU)
      }, toHex(PUBKEY))
    })

    expect(latest?.cashuCard?.spent).toBe(0)
    expect(latest?.cashuCard?.pieces).toBe(before)
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
        await t(NO_VALUE_APDU)
      }, toHex(PUBKEY))
    })

    expect(store.getState().flashcardV2.cards[toHex(PUBKEY)].unit).toBe("sat")
  })

  // ENG-706: an op can say where it has got to. On Android the in-app sheet
  // shows it in place of "Please tap NFC tags"; on iOS the system NFC sheet
  // does, through its alert message. Fire-and-forget: a refused alert never
  // costs the op its result, and the text never outlives the op.
  describe("progress the op reports", () => {
    const setAlertMessage = (NfcManager as unknown as { setAlertMessageIOS: jest.Mock })
      .setAlertMessageIOS
    const status = () => screen.getByTestId("flashcard-scan-sheet-status")

    /** Starts an op that reports `text` and then waits; resolve it with the returned call. */
    const startReporting = (text?: string) => {
      let finish: ((value: string) => void) | undefined
      let result: Promise<string | undefined> | undefined
      act(() => {
        result = latest?.runCardOperation(
          (t, report) =>
            new Promise<string>((resolve) => {
              t(SET_PIN_APDU).then(() => {
                if (text !== undefined) report(text)
                finish = resolve
              })
            }),
          toHex(PUBKEY),
        )
      })
      return {
        finish: async (value = "done") => {
          await waitFor(() => expect(finish).not.toBe(undefined))
          let out: string | undefined
          await act(async () => {
            finish?.(value)
            out = await result
          })
          return out
        },
      }
    }

    it("shows the op's text on Android's scan sheet, and the plain prompt on the next op", async () => {
      const os = jest.replaceProperty(Platform, "OS", "android")
      try {
        await mount()
        await readCard()
        const op = startReporting("Making pieces (3 of 7)…")
        await waitFor(() =>
          expect(status().props.children).toBe("Making pieces (3 of 7)…"),
        )
        expect(setAlertMessage).not.toHaveBeenCalled()
        await expect(op.finish()).resolves.toBe("done")

        const next = startReporting()
        await waitFor(() => expect(transceive).toHaveBeenCalled())
        expect(status().props.children).toBe("Please tap NFC tags")
        await next.finish()
      } finally {
        os.restore()
      }
    })

    it("sets the iOS NFC sheet's alert message to the op's text", async () => {
      const os = jest.replaceProperty(Platform, "OS", "ios")
      try {
        await mount()
        await readCard()
        const op = startReporting("Loading pieces (1 of 5)…")
        await waitFor(() =>
          expect(setAlertMessage).toHaveBeenCalledWith("Loading pieces (1 of 5)…"),
        )
        await op.finish()
      } finally {
        os.restore()
      }
    })

    it("returns the op's result when iOS refuses the alert message", async () => {
      const os = jest.replaceProperty(Platform, "OS", "ios")
      try {
        await mount()
        await readCard()
        setAlertMessage.mockRejectedValue(new Error("no session"))
        const op = startReporting("Reading the card…")
        await waitFor(() => expect(setAlertMessage).toHaveBeenCalled())
        await expect(op.finish("tidied")).resolves.toBe("tidied")
      } finally {
        setAlertMessage.mockReset()
        os.restore()
      }
    })
  })
})
