import { act, waitFor } from "@testing-library/react-native"
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager"
import axios from "axios"

import { buildSelectApdu } from "@app/utils/cashu-card"
import { unitsForKeysets } from "@app/utils/cashu-mint"
import { store } from "@app/store/redux"
import {
  keysetUnitsLearned,
  resetFlashcardV2,
} from "@app/store/redux/slices/flashcardV2Slice"
import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  ProviderOptions,
  renderProvider,
} from "./flashcard-harness"

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
// The mint is asked for keyset units after a Cashu read; no spec reaches the
// network. The grouping itself stays real.
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: jest.fn(),
}))
import { toastShow } from "@app/utils/toast"

// Exercises handleTag's orchestration — the only code that decides whether a
// Cashu card is ever read — against the mocked NFC manager. The parser and
// APDU client have their own spec; this one pins the call site:
//   - the transceive used is the manager's isoDepHandler (not a phantom field
//     on the tag), reached only when the request resolved with IsoDep
//   - one requestTechnology per tap, whatever the card turns out to be
//   - a cancelled request ends the tap; it never opens a second session
//   - getTag() runs only on the NDEF path, after the applet SELECT: on iOS
//     it is a live NDEF read, so it must never precede or follow a Cashu read
//   - a Cashu read lands in context state AND in the tap's result, so a
//     screen can render it and the caller can navigate on it (ENG-616); only
//     a signed-in read is written to the phone's record of cards
//   - the Cashu card and the BoltCard are forgotten separately

const ok = (data: number[]) => [...data, 0x90, 0x00]
const SW_FILE_NOT_FOUND = [0x6a, 0x82]
const INS_SELECT = 0xa4
const PUBKEY = [0x02, ...Array.from({ length: 32 }, (_, i) => i + 1)]
const PUBKEY_HEX = PUBKEY.map((b) => b.toString(16).padStart(2, "0")).join("")
const KEYSET = [0x00, 0x59, 0x53, 0x4c, 0xe0, 0xbf, 0xa1, 0x9a]
const KEYSET_HEX = "0059534ce0bfa19a"
/** A keyset the mint has never named, beside KEYSET on a card holding two. */
const UNNAMED_KEYSET = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77]
const UNNAMED_KEYSET_HEX = "0011223344556677"

// A BoltCard payload; values are placeholders.
const CARD_PAYLOAD = "lnurlw://card.test.flashapp.me/boltcard?p=PARAM_P&c=PARAM_C"
const BALANCE_HTML = `<a href="lightning:lnurl1CARD">pay</a><dt>1,234 SATS</dt>`
const NDEF_TAG = { id: "04AABBCC", ndefMessage: [{ payload: [1, 2, 3] }] }
// A JavaCard with no NDEF application on it.
const ISO_DEP_ONLY_TAG = { id: "08AABBCC" }

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

/**
 * Answers like a real Cashu card: SELECT, GET_INFO, GET_PUBKEY, GET_BALANCE,
 * GET_SLOT_STATUS, GET_PROOF.
 */
const cashuCard = async (bytes: number[]) => {
  switch (bytes[1]) {
    case INS_SELECT:
      return ok([0, 2])
    case 0x01:
      // v0.2, 32 slots, 1 unspent, 7 spent, 24 empty, caps 0x07, PIN set.
      return ok([0, 2, 32, 1, 7, 24, 0x07, 1])
    case 0x10:
      return ok(PUBKEY)
    case 0x11:
      return ok([0, 0, 0x01, 0xf4])
    case 0x14:
      return ok(SLOT_STATUSES)
    case 0x13:
      return ok(PROOF_SLOT)
    default:
      throw new Error("unsupported")
  }
}

/** A big-endian u32, as the applet sends a balance or a proof amount. */
const u32 = (n: number) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256)

/**
 * Answers like `cashuCard`, but holds one unspent proof per entry of
 * `proofs`, in slots 0, 1, ... under the keyset given; the other slots are
 * empty.
 */
const cardHolding =
  (proofs: { keyset: number[]; amount: number }[]) => async (bytes: number[]) => {
    switch (bytes[1]) {
      case 0x01:
        // v0.2, 32 slots, the proofs unspent, none spent, caps 0x07, PIN set.
        return ok([0, 2, 32, proofs.length, 0, 32 - proofs.length, 0x07, 1])
      case 0x11:
        return ok(u32(proofs.reduce((sum, { amount }) => sum + amount, 0)))
      case 0x14:
        return ok([...proofs.map(() => 1), ...new Array(32 - proofs.length).fill(0)])
      case 0x13: {
        const { keyset, amount } = proofs[bytes[2]]
        // Status, keyset id and amount, then PROOF_SLOT's nonce and C.
        return ok([0x01, ...keyset, ...u32(amount), ...PROOF_SLOT.slice(13)])
      }
      default:
        return cashuCard(bytes)
    }
  }

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const getTag = NfcManager.getTag as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock
const lookupUnits = unitsForKeysets as jest.Mock

let latest: FlashcardSnapshot | undefined

const knownCards = () => store.getState().flashcardV2.cards

/** Mounts the provider; `tap` then reads one card and resolves to the result. */
const mount = async (options: ProviderOptions = {}) => {
  renderProvider((snapshot) => {
    latest = snapshot
  }, options)
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
  let taps = 0
  const tap = async () => {
    let result: Awaited<ReturnType<FlashcardSnapshot["readFlashcard"]>> = {}
    await act(async () => {
      result = (await latest?.readFlashcard(false)) ?? {}
    })
    // The tap is "done" once the session has been released (the finally
    // block), which is also the invariant every test here cares about:
    // exactly one release per tap.
    taps += 1
    await waitFor(() => expect(cancelTechnologyRequest).toHaveBeenCalledTimes(taps))
    return result
  }
  return { tap }
}

/** Renders the provider and taps once, resolving to what the tap returned. */
const tapOnce = async (options: ProviderOptions = {}) => (await mount(options)).tap()

const tapCashuCard = () => {
  requestTechnology.mockResolvedValue(NfcTech.IsoDep)
  getTag.mockResolvedValue(ISO_DEP_ONLY_TAG)
  transceive.mockImplementation(cashuCard)
}

const tapBoltCard = () => {
  requestTechnology.mockResolvedValue(NfcTech.Ndef)
  getTag.mockResolvedValue(NDEF_TAG)
}

describe("FlashcardProvider Cashu card orchestration", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  let warn: jest.SpyInstance

  beforeEach(() => {
    latest = undefined
    store.dispatch(resetFlashcardV2())
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    requestTechnology.mockReset()
    transceive.mockReset()
    getTag.mockReset()
    lookupUnits.mockReset()
    lookupUnits.mockResolvedValue({ [KEYSET_HEX]: "sat" })
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
    ;(Ndef.text.decodePayload as jest.Mock).mockReturnValue(CARD_PAYLOAD)
    ;(axios.get as jest.Mock).mockResolvedValue({ data: BALANCE_HTML })
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  it("reads a Cashu card through the manager's IsoDep handler when the request resolves IsoDep", async () => {
    tapCashuCard()

    const result = await tapOnce()

    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(requestTechnology).toHaveBeenCalledWith([NfcTech.IsoDep, NfcTech.Ndef])
    // The applet SELECT goes out first, verbatim, over the manager's handler.
    expect(transceive.mock.calls[0][0]).toEqual(buildSelectApdu())
    // SELECT, GET_INFO, GET_PUBKEY, GET_BALANCE, then GET_SLOT_STATUS and the
    // one unspent slot's GET_PROOF — a read touches nothing else.
    expect(transceive.mock.calls.map((call) => call[0][1])).toEqual([
      INS_SELECT,
      0x01,
      0x10,
      0x11,
      0x14,
      0x13,
    ])
    // The applet is the only thing this tap talks to: no NDEF read before the
    // SELECT (neither cardctl nor flash-pos sends one) and none after it.
    expect(getTag).not.toHaveBeenCalled()

    // The card lands in context for the screen and in the result for the
    // caller — the same object, so the two can never disagree.
    const expected = {
      version: "0.2",
      balance: 500,
      pinState: "set",
      pubkey: PUBKEY_HEX,
      unspent: 1,
      spent: 7,
      empty: 24,
      keysets: [{ keysetId: KEYSET_HEX, amount: 500 }],
    }
    expect(result.cashuCard).toMatchObject(expected)
    expect(result.boltCard).toBeUndefined()
    await waitFor(() => expect(latest?.cashuCard).toMatchObject(expected))
    // ...and the phone remembers the card: the applet keeps no history, so
    // this device-local record is the only one.
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({
      pubkey: PUBKEY_HEX,
      version: "0.2",
      pinState: "set",
      lastBalance: 500,
    })
    expect(knownCards()[PUBKEY_HEX].lastSeenAt).toBeGreaterThan(0)
    // No toast: the card screen is the feedback now.
    expect(toastShow).not.toHaveBeenCalled()
    // The BoltCard flow does not run for a Cashu card.
    expect(axios.get).not.toHaveBeenCalled()
    expect(latest?.balanceInSats).toBeUndefined()
  })

  it("names the balance's unit from the mint's keysets, in context and on the card's record", async () => {
    tapCashuCard()

    await tapOnce()

    // Asked about exactly the keysets the card holds, after the tap.
    expect(lookupUnits).toHaveBeenCalledWith([KEYSET_HEX])
    await waitFor(() =>
      expect(latest?.cashuCard?.unitTotals).toEqual({
        byUnit: [{ unit: "sat", amount: 500 }],
        unknown: 0,
      }),
    )
    expect(knownCards()[PUBKEY_HEX].unit).toBe("sat")
  })

  it("labels a later read at once from the units the mint named before, without waiting on the mint", async () => {
    tapCashuCard()
    const { tap } = await mount()
    await tap()
    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    expect(store.getState().flashcardV2.keysetUnits).toEqual({ [KEYSET_HEX]: "sat" })

    // The mint is slow this time: the read is labelled before it answers.
    lookupUnits.mockReturnValue(
      new Promise(() => {
        // never answers
      }),
    )
    await tap()
    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [{ unit: "sat", amount: 500 }],
      unknown: 0,
    })
  })

  it("names the unit on the card's record at once too, so the home row says what the card screen says while the mint is slow", async () => {
    tapCashuCard()
    const { tap } = await mount()
    await tap()
    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({ lastBalance: 500, unit: "sat" })

    // Spent at a POS since: 300 left under the same keyset, and the mint does
    // not answer this time. The moved balance clears the record's unit
    // (`cardSeen`); what the mint named before names it again at once.
    transceive.mockImplementation(cardHolding([{ keyset: KEYSET, amount: 300 }]))
    lookupUnits.mockReturnValue(
      new Promise(() => {
        // never answers
      }),
    )
    await tap()

    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [{ unit: "sat", amount: 300 }],
      unknown: 0,
    })
    // The home row reads the record, not the card screen's state.
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({ lastBalance: 300, unit: "sat" })
  })

  it("still waits on the mint for a card holding a keyset it has not named", async () => {
    store.dispatch(keysetUnitsLearned({ ["ff".repeat(8)]: "usd" }))
    tapCashuCard()
    lookupUnits.mockReturnValue(
      new Promise(() => {
        // never answers
      }),
    )

    await tapOnce()

    expect(latest?.cashuCard?.balance).toBe(500)
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
  })

  it("still waits on the mint when it has named only some of the card's keysets", async () => {
    store.dispatch(keysetUnitsLearned({ [KEYSET_HEX]: "sat" }))
    tapCashuCard()
    transceive.mockImplementation(
      cardHolding([
        { keyset: KEYSET, amount: 500 },
        { keyset: UNNAMED_KEYSET, amount: 200 },
      ]),
    )
    lookupUnits.mockReturnValue(
      new Promise(() => {
        // never answers
      }),
    )

    await tapOnce()

    // The split was read: one keyset the mint named before, one it never has.
    expect(latest?.cashuCard?.keysets).toEqual([
      { keysetId: KEYSET_HEX, amount: 500 },
      { keysetId: UNNAMED_KEYSET_HEX, amount: 200 },
    ])
    // No figure with an "unknown" remainder before the mint answers: it may
    // yet name the other keyset.
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    expect(knownCards()[PUBKEY_HEX].unit).toBeUndefined()
  })

  it("a signed-out read keeps no keyset units for later", async () => {
    tapCashuCard()

    await tapOnce({ isAuthed: false })

    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    expect(store.getState().flashcardV2.keysetUnits).toBeUndefined()
  })

  it("leaves the unit unknown, and the record's unit alone, when the mint cannot be asked", async () => {
    tapCashuCard()
    lookupUnits.mockRejectedValue(new Error("Network Error"))

    await tapOnce()

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith("Cashu mint keyset lookup failed:", "Error"),
    )
    expect(latest?.cashuCard?.balance).toBe(500)
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    expect(knownCards()[PUBKEY_HEX].unit).toBeUndefined()
  })

  it("still opens a card that leaves the field during the keyset split: balance kept, unit unknown, mint not asked", async () => {
    // Two unspent proofs; the tag is lost at the second GET_PROOF, after
    // GET_BALANCE answered. The split only names units, so the read stands
    // and the screen labels the figure "unit unknown".
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(ISO_DEP_ONLY_TAG)
    transceive.mockImplementation(async (bytes: number[]) => {
      switch (bytes[1]) {
        case 0x01:
          // v0.2, 32 slots, 2 unspent, 0 spent, 30 empty, caps 0x07, PIN set.
          return ok([0, 2, 32, 2, 0, 30, 0x07, 1])
        case 0x11:
          return ok([0, 0, 0x03, 0xe8])
        case 0x14:
          return ok([1, 1, ...new Array(30).fill(0)])
        case 0x13:
          if (bytes[2] === 1) throw new Error("readerTransceiveErrorTagConnectionLost")
          return ok(PROOF_SLOT)
        default:
          return cashuCard(bytes)
      }
    })

    const result = await tapOnce()

    expect(result.cashuCard).toMatchObject({
      balance: 1000,
      pubkey: PUBKEY_HEX,
      unspent: 2,
      pinState: "set",
    })
    expect(result.cashuCard?.keysets).toBeUndefined()
    await waitFor(() => expect(latest?.cashuCard?.balance).toBe(1000))
    // Nothing to ask the mint about, so nothing is asked.
    expect(lookupUnits).not.toHaveBeenCalled()
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    // The read counts: no "couldn't read" toast, and the phone remembers it.
    expect(toastShow).not.toHaveBeenCalled()
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({ lastBalance: 1000 })
    expect(knownCards()[PUBKEY_HEX].unit).toBeUndefined()
    // One session, released once (tapOnce waits for exactly one release).
    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(getTag).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith("Cashu card keyset split skipped: Error")
  })

  it("keeps a read made while signed out in memory only, off this phone's record", async () => {
    tapCashuCard()

    const result = await tapOnce({ isAuthed: false })

    // The screen still gets the card and the caller still navigates on it...
    expect(result.cashuCard?.pubkey).toBe(PUBKEY_HEX)
    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    // ...but nothing is written for the next account on the phone to find.
    expect(knownCards()).toEqual({})
  })

  it("does not touch the IsoDep channel when the tag connected as Ndef", async () => {
    tapBoltCard()

    const result = await tapOnce()

    expect(transceive).not.toHaveBeenCalled()
    await waitFor(() => expect(latest?.balanceInSats).toBe(1234))
    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(getTag).toHaveBeenCalledTimes(1)
    expect(result.cashuCard).toBeUndefined()
    expect(latest?.cashuCard).toBeUndefined()
  })

  it("reports a BoltCard read in the tap's result, so the caller can open its screen", async () => {
    tapBoltCard()

    const result = await tapOnce()

    expect(result).toEqual({ boltCard: true })
    await waitFor(() => expect(latest?.lnurl).toBe("lnurl1CARD"))
  })

  it("reports nothing when a BoltCard's balance page does not load", async () => {
    tapBoltCard()
    ;(axios.get as jest.Mock).mockRejectedValue(new Error("Network Error"))

    const result = await tapOnce()

    expect(result).toEqual({})
    expect(latest?.lnurl).toBeUndefined()
  })

  it("falls through to the NDEF flow on the same tap when the applet SELECT is refused", async () => {
    // An NTAG 424 BoltCard is a Type-4 tag: it connects as IsoDep too, and
    // answers both SELECT forms with 6A82 because the Cashu AID is unknown.
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(NDEF_TAG)
    transceive.mockResolvedValue(SW_FILE_NOT_FOUND)

    const result = await tapOnce()

    await waitFor(() => expect(latest?.balanceInSats).toBe(1234))
    // One session, one tag read, one release — no second request for Ndef.
    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(getTag).toHaveBeenCalledTimes(1)
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    // Both SELECT forms were tried, nothing more.
    expect(transceive).toHaveBeenCalledTimes(2)
    expect(transceive.mock.calls.every((call) => call[0][1] === INS_SELECT)).toBe(true)
    // ...and the NDEF read came after them, not before.
    expect(getTag.mock.invocationCallOrder[0]).toBeGreaterThan(
      transceive.mock.invocationCallOrder[1],
    )
    // A plain 6A82/6A82 refusal is the expected BoltCard answer: nothing to log.
    expect(warn).not.toHaveBeenCalled()
    expect(result.cashuCard).toBeUndefined()
    expect(result.boltCard).toBe(true)
  })

  it("a cancelled request ends the tap without opening a second session", async () => {
    // iOS: the user dismisses the sheet; Android: the modal's Cancel. Either
    // way the pending request rejects.
    requestTechnology.mockRejectedValue(new Error("UserCancel"))

    const result = await tapOnce()

    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(getTag).not.toHaveBeenCalled()
    expect(transceive).not.toHaveBeenCalled()
    expect(axios.get).not.toHaveBeenCalled()
    expect(toastShow).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it("a Cashu card that fails mid-read is not re-read as a BoltCard", async () => {
    // SELECT succeeded, so this is our card; a later status failure is a
    // transport error, not a reason to parse the tag as NDEF.
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(NDEF_TAG)
    transceive.mockImplementation(async (bytes: number[]) =>
      bytes[1] === INS_SELECT ? ok([0, 2]) : [0x6f, 0x00],
    )

    const result = await tapOnce()

    expect(axios.get).not.toHaveBeenCalled()
    expect(getTag).not.toHaveBeenCalled()
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }))
    expect(result.cashuCard).toBeUndefined()
    expect(latest?.cashuCard).toBeUndefined()
    expect(latest?.balanceInSats).toBeUndefined()
    expect(knownCards()).toEqual({})
  })

  it("tells the user when the card is lost mid-read and still ends the tap", async () => {
    // SELECT succeeded, then the tag left the field: the native side rejects
    // transceive (iOS readerTransceiveErrorTagConnectionLost, Android
    // IOException). The user gets a toast, the session is released once,
    // and the tap is not retried as a BoltCard.
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(NDEF_TAG)
    transceive.mockImplementation(async (bytes: number[]) => {
      if (bytes[1] === INS_SELECT) return ok([0, 2])
      throw new Error("readerTransceiveErrorTagConnectionLost")
    })

    await tapOnce()

    expect(toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message:
          "Couldn't read the card. Hold your phone steady against it and try again.",
      }),
    )
    expect(axios.get).not.toHaveBeenCalled()
    expect(getTag).not.toHaveBeenCalled()
    expect(latest?.cashuCard).toBeUndefined()
    // The rethrow lands in handleTag's outer catch: still the one logging site.
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.any(Error))
  })
})

describe("FlashcardProvider forgets each card on its own", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  let warn: jest.SpyInstance

  beforeEach(() => {
    latest = undefined
    store.dispatch(resetFlashcardV2())
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    requestTechnology.mockReset()
    transceive.mockReset()
    getTag.mockReset()
    lookupUnits.mockReset()
    lookupUnits.mockResolvedValue({ [KEYSET_HEX]: "sat" })
    ;(Ndef.text.decodePayload as jest.Mock).mockReturnValue(CARD_PAYLOAD)
    ;(axios.get as jest.Mock).mockResolvedValue({ data: BALANCE_HTML })
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  /** A phone holding both: a linked BoltCard, then a Cashu card read. */
  const holdBothCards = async (updateState = jest.fn()) => {
    const { tap } = await mount({ updateState })
    tapBoltCard()
    await tap()
    tapCashuCard()
    await tap()
    await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
    expect(latest?.lnurl).toBe("lnurl1CARD")
    expect(knownCards()[PUBKEY_HEX]).toBeDefined()
    return { tap }
  }

  it("forgetCashuCard drops the Cashu card from context and from this phone, and leaves the BoltCard linked", async () => {
    const updateState = jest.fn()
    await holdBothCards(updateState)
    const persistentWrites = updateState.mock.calls.length

    await act(async () => {
      latest?.forgetCashuCard()
    })

    await waitFor(() => expect(latest?.cashuCard).toBeUndefined())
    // Gone from the store, not just the context: the next account on this
    // phone finds nothing.
    expect(knownCards()).toEqual({})
    // The BoltCard is untouched, in context and in persistent state.
    expect(latest?.lnurl).toBe("lnurl1CARD")
    expect(latest?.balanceInSats).toBe(1234)
    expect(updateState).toHaveBeenCalledTimes(persistentWrites)
  })

  it("resetFlashcard forgets the BoltCard and leaves the Cashu card alone", async () => {
    await holdBothCards()

    await act(async () => {
      await latest?.resetFlashcard()
    })

    await waitFor(() => expect(latest?.lnurl).toBeUndefined())
    expect(latest?.balanceInSats).toBeUndefined()
    expect(latest?.cashuCard?.pubkey).toBe(PUBKEY_HEX)
    expect(knownCards()[PUBKEY_HEX]).toBeDefined()
  })

  it("a unit lookup that lands after the card was forgotten does not bring it back", async () => {
    let answer: (units: Record<string, string>) => void = () => {}
    lookupUnits.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    const { tap } = await mount()
    tapCashuCard()
    await tap()
    expect(knownCards()[PUBKEY_HEX]).toBeDefined()

    await act(async () => {
      latest?.forgetCashuCard()
    })
    await act(async () => {
      answer({ [KEYSET_HEX]: "sat" })
    })

    expect(latest?.cashuCard).toBeUndefined()
    expect(knownCards()).toEqual({})
  })
})
