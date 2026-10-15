import { act, waitFor } from "@testing-library/react-native"
import { Platform } from "react-native"
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager"
import axios from "axios"

import { CASHU_AID, CASHU_APPLET_AID, buildSelectApdu } from "@app/utils/cashu-card"
import { i18nObject } from "@app/i18n/i18n-util"
import { unitsForKeysets } from "@app/utils/cashu-mint"
import { store } from "@app/store/redux"
import {
  cardSeen,
  cardUnitResolved,
  keysetUnitsLearned,
  resetFlashcardV2,
} from "@app/store/redux/slices/flashcardV2Slice"
import { FakeCard, FakeCardOptions, createFakeCard } from "../helpers/fake-cashu"
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
// The tip header is fetched off the tap; no spec reaches the network for it.
// The card's clock is still fed in the tap (TELL_TIME), from what is kept.
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: jest.fn(async () => undefined),
}))
import { toastShow } from "@app/utils/toast"
import { CARD_TRANSCEIVE_TIMEOUT_MS } from "@app/utils/cashu-card-nfc"

// Exercises handleTag's orchestration — the only code that decides whether a
// Cashu card is ever read — against the mocked NFC manager and a fake 2.0
// card. The parser and APDU client have their own spec; this one pins the
// call site:
//   - the transceive used is the manager's isoDepHandler (not a phantom field
//     on the tag), reached only when the request resolved with IsoDep
//   - one requestTechnology per tap, whatever the card turns out to be
//   - a cancelled request ends the tap; it never opens a second session
//   - getTag() runs only on the NDEF path, after the applet SELECT: on iOS
//     it is a live NDEF read, so it must never precede or follow a Cashu read
//   - a Cashu read lands in context state AND in the tap's result, so a
//     screen can render it and the caller can navigate on it (ENG-616); only
//     a signed-in read is written to the phone's record of cards
//   - a card that needs an update shows the notice, is sent nothing more and
//     is not read as a BoltCard; a card that fails AUTH shows and stores
//     nothing (ENG-675)
//   - the Cashu card and the BoltCard are forgotten separately

const ok = (data: number[]) => [...data, 0x90, 0x00]
const SW_FILE_NOT_FOUND = [0x6a, 0x82]
const INS_SELECT = 0xa4
/** The fake card's key: the one it signs AUTH with. */
const PUBKEY_HEX = createFakeCard(1).pubkey
const KEYSET = [0x00, 0x59, 0x53, 0x4c, 0xe0, 0xbf, 0xa1, 0x9a]
const KEYSET_HEX = "0059534ce0bfa19a"
/** A keyset the mint has never named, beside KEYSET on a card holding two. */
const UNNAMED_KEYSET = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77]
const UNNAMED_KEYSET_HEX = "0011223344556677"
/** A keyset the mint names `usd`, beside KEYSET (`sat`) on a card holding both. */
const USD_KEYSET = [0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x01]
const USD_KEYSET_HEX = "00aabbccddeeff01"

// A BoltCard payload; values are placeholders.
const CARD_PAYLOAD = "lnurlw://card.test.flashapp.me/boltcard?p=PARAM_P&c=PARAM_C"
const BALANCE_HTML = `<a href="lightning:lnurl1CARD">pay</a><dt>1,234 SATS</dt>`
const NDEF_TAG = { id: "04AABBCC", ndefMessage: [{ payload: [1, 2, 3] }] }
// A JavaCard with no NDEF application on it.
const ISO_DEP_ONLY_TAG = { id: "08AABBCC" }

/** A big-endian u32, as the applet sends a balance or a proof amount. */
const u32 = (n: number) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256)

/** A slot as the 2.0 card holds it: status, keyset, amount, nonce (its first byte `nonceByte`), C, date. */
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
 * A 2.0 card holding one unspent 500 in slot 0 and spent slots 1-7, with a
 * PIN and an owner (another phone's), as the fake applet answers.
 */
const loadedCard = (options: FakeCardOptions = {}): FakeCard => {
  const card = createFakeCard(128, { pin: "1234", ...options })
  card.slots[0] = slotOf(1, KEYSET, 500)
  for (let slot = 1; slot <= 7; slot += 1) card.slots[slot] = slotOf(2, KEYSET, 500, slot)
  return card
}

/** Answers like `loadedCard`, for a spec that hands the transceiver to the mock. */
const cashuCard = (bytes: number[]) => currentCard.transceive(bytes)
let currentCard: FakeCard = loadedCard()

/**
 * A 2.0 card holding one unspent piece per entry of `proofs`, in slots 0, 1,
 * ... under the keyset given; the other slots are empty.
 */
const cardHolding = (proofs: { keyset: number[]; amount: number }[]) => {
  const card = createFakeCard(128, { pin: "1234" })
  proofs.forEach(({ keyset, amount }, slot) => {
    card.slots[slot] = slotOf(1, keyset, amount, slot)
  })
  return (bytes: number[]) => card.transceive(bytes)
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

const tapCashuCard = (options: FakeCardOptions = {}) => {
  currentCard = loadedCard(options)
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
    // SELECT, GET_INFO, GET_PUBKEY, GET_BALANCE (shown as unverified while
    // the card signs, ENG-707), AUTH (the card proves its key before anything
    // it said is kept), GET_CARD, TELL_TIME (the card's clock is told the
    // phone's time; no header is kept to show it), then the pieces by page
    // and a GET_PROOF per spent slot, the seven spent ones (ENG-631: the next
    // top-up asks the mint about them) — a read touches nothing else, and
    // never sends CLEAR_SPENT.
    expect(transceive.mock.calls.map((call) => call[0][1])).toEqual([
      INS_SELECT,
      0x01,
      0x10,
      0x11,
      0x15,
      0x16,
      0x37,
      0x17,
      ...new Array(7).fill(0x13),
    ])
    // The applet is the only thing this tap talks to: no NDEF read before the
    // SELECT (neither cardctl nor flash-pos sends one) and none after it.
    expect(getTag).not.toHaveBeenCalled()

    // The card lands in context for the screen and in the result for the
    // caller — the same object, so the two can never disagree.
    const expected = {
      version: "2.0",
      balance: 500,
      pinState: "set",
      hasOwner: true,
      pubkey: PUBKEY_HEX,
      unspent: 1,
      spent: 7,
      empty: 120,
      keysets: [{ keysetId: KEYSET_HEX, amount: 500 }],
    }
    expect(result.cashuCard).toMatchObject(expected)
    // The spent slots, data and all, in slot order: what the top-up's load
    // tap will ask the mint about before it frees any of them.
    expect(result.cashuCard?.spentSlots?.map((slot) => slot.slot)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
    expect(result.cashuCard?.spentSlots?.[0]).toMatchObject({
      status: "spent",
      keysetId: KEYSET_HEX,
      amount: 500,
      nonce: "01" + "ab".repeat(31),
      date: 0,
    })
    expect(result.boltCard).toBeUndefined()
    await waitFor(() => expect(latest?.cashuCard).toMatchObject(expected))
    // ...and the phone remembers the card: the applet keeps no history, so
    // this device-local record is the only one.
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({
      pubkey: PUBKEY_HEX,
      version: "2.0",
      pinState: "set",
      lastBalance: 500,
      owned: true,
      needsUpdate: false,
      limits: { day: 0, allowance: 0, rollBudget: 7, rolls: 0 },
    })
    expect(knownCards()[PUBKEY_HEX].lastSeenAt).toBeGreaterThan(0)
    // No toast: the card screen is the feedback now.
    expect(toastShow).not.toHaveBeenCalled()
    // The BoltCard flow does not run for a Cashu card.
    expect(axios.get).not.toHaveBeenCalled()
    expect(latest?.balanceInSats).toBeUndefined()
  })

  // ENG-681: a J3R180 with cashu-javacard installed as documented has the
  // opener on first, so the 10-byte package AID reaches the opener (9000, no
  // version, then 6D00). The tap sends the full applet AID first and reads
  // the card as 2.0, never as needing an update.
  it("raises Android's transceive timeout before the read's first APDU: the read makes the card sign (AUTH)", async () => {
    // On a Pixel a card signature takes about 1.5 s, past Android's 618 ms
    // IsoDep default, which reports TagLostException on a card that never
    // moved (seen on the J3R180, 2026-10-13).
    tapCashuCard()
    const setTransceiveTimeout = NfcManager.setTimeout as unknown as jest.Mock
    setTransceiveTimeout.mockClear()
    const os = jest.replaceProperty(Platform, "OS", "android")
    try {
      await tapOnce()
    } finally {
      os.restore()
    }
    expect(setTransceiveTimeout).toHaveBeenCalledWith(CARD_TRANSCEIVE_TIMEOUT_MS)
    const [raisedAt] = setTransceiveTimeout.mock.invocationCallOrder
    expect(raisedAt).toBeGreaterThan(requestTechnology.mock.invocationCallOrder[0])
    expect(raisedAt).toBeLessThan(transceive.mock.invocationCallOrder[0])
  })

  it("reads a 2.0 card installed opener first as 2.0, through the full applet AID", async () => {
    tapCashuCard({ opener: true })

    const result = await tapOnce()

    expect(transceive.mock.calls[0][0]).toEqual(buildSelectApdu(CASHU_APPLET_AID))
    expect(transceive.mock.calls.map((call) => call[0])).not.toContainEqual(
      buildSelectApdu(CASHU_AID),
    )
    expect(result.needsUpdate).toBeUndefined()
    expect(result.cashuCard).toMatchObject({
      version: "2.0",
      balance: 500,
      pubkey: PUBKEY_HEX,
    })
    expect(getTag).not.toHaveBeenCalled()
    expect(toastShow).not.toHaveBeenCalled()
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

  it("labels a card holding two units at once, and names no single unit on its record", async () => {
    store.dispatch(keysetUnitsLearned({ [KEYSET_HEX]: "sat", [USD_KEYSET_HEX]: "usd" }))
    tapCashuCard()
    transceive.mockImplementation(
      cardHolding([
        { keyset: KEYSET, amount: 500 },
        { keyset: USD_KEYSET, amount: 200 },
      ]),
    )
    lookupUnits.mockReturnValue(
      new Promise(() => {
        // never answers
      }),
    )

    await tapOnce()

    expect(latest?.cashuCard?.unitTotals).toEqual({
      byUnit: [
        { unit: "sat", amount: 500 },
        { unit: "usd", amount: 200 },
      ],
      unknown: 0,
    })
    // The home row values the whole balance in the record's one unit: a card
    // holding two has none, or all 700 would be counted as sats.
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({ lastBalance: 700 })
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

  it("keeps the unit on the card's record for an unchanged balance when the mint cannot be asked and no keyset units were kept", async () => {
    // A record named on a build before `keysetUnits`: the record has its unit,
    // but nothing on this phone can label the read at once.
    store.dispatch(
      cardSeen({
        pubkey: PUBKEY_HEX,
        version: "2.0",
        pinState: "set",
        lastBalance: 500,
        owned: true,
        needsUpdate: false,
        limits: { day: 0, allowance: 0 },
        at: 1,
      }),
    )
    store.dispatch(cardUnitResolved({ pubkey: PUBKEY_HEX, unit: "sat" }))
    tapCashuCard()
    lookupUnits.mockRejectedValue(new Error("Network Error"))

    await tapOnce()

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith("Cashu mint keyset lookup failed:", "Error"),
    )
    expect(store.getState().flashcardV2.keysetUnits).toBeUndefined()
    expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    // Still the 500 the unit was named for, so the home row keeps valuing it
    // rather than show "500 · unit unknown".
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({ lastBalance: 500, unit: "sat" })
  })

  it("still opens a card that leaves the field during the keyset split: balance kept, unit unknown, mint not asked", async () => {
    // Two unspent proofs; the tag is lost at the second GET_PROOF, after
    // GET_BALANCE answered. The split only names units, so the read stands
    // and the screen labels the figure "unit unknown".
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(ISO_DEP_ONLY_TAG)
    const twoPieces = cardHolding([
      { keyset: KEYSET, amount: 500 },
      { keyset: KEYSET, amount: 500 },
    ])
    transceive.mockImplementation(async (bytes: number[]) => {
      if (bytes[1] === 0x17) throw new Error("readerTransceiveErrorTagConnectionLost")
      return twoPieces(bytes)
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
    // answers every Cashu SELECT with 6A82 because it knows none of the AIDs.
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(NDEF_TAG)
    transceive.mockResolvedValue(SW_FILE_NOT_FOUND)

    const result = await tapOnce()

    await waitFor(() => expect(latest?.balanceInSats).toBe(1234))
    // One session, one tag read, one release — no second request for Ndef.
    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(getTag).toHaveBeenCalledTimes(1)
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    // Both 2.0 SELECT forms and the two withdrawn AIDs were tried, nothing more.
    expect(transceive).toHaveBeenCalledTimes(4)
    expect(transceive.mock.calls.every((call) => call[0][1] === INS_SELECT)).toBe(true)
    // ...and the NDEF read came after them, not before.
    expect(getTag.mock.invocationCallOrder[0]).toBeGreaterThan(
      transceive.mock.invocationCallOrder[3],
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
      bytes[1] === INS_SELECT ? ok([2, 0]) : [0x6f, 0x00],
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
      if (bytes[1] === INS_SELECT) return ok([2, 0])
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

describe("FlashcardProvider and card protocol 2.0 (ENG-675)", () => {
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
    jest.clearAllMocks()
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  it("a card that needs an update shows the notice, is sent nothing after the SELECT commands, and is not read as a BoltCard", async () => {
    tapCashuCard({ legacy: "0.x" })
    getTag.mockResolvedValue(NDEF_TAG)

    const result = await tapOnce()

    expect(result).toEqual({ needsUpdate: true })
    // The two 2.0 forms, then the withdrawn 0.x AID, which answered: nothing more.
    expect(transceive.mock.calls.map((call) => call[0][1])).toEqual([
      INS_SELECT,
      INS_SELECT,
      INS_SELECT,
    ])
    expect(toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: i18nObject("en").FlashcardV2.needsUpdateBody(),
      }),
    )
    // No NDEF fall-through, no BoltCard page, nothing stored.
    expect(getTag).not.toHaveBeenCalled()
    expect(axios.get).not.toHaveBeenCalled()
    expect(latest?.cashuCard).toBeUndefined()
    expect(knownCards()).toEqual({})
  })

  it("a Foxy 1.x card needs an update too", async () => {
    tapCashuCard({ legacy: "1.x" })
    await expect(tapOnce()).resolves.toEqual({ needsUpdate: true })
    expect(transceive).toHaveBeenCalledTimes(4)
  })

  it("a card that fails AUTH shows no balance, stores nothing, and says why", async () => {
    tapCashuCard({ badAuth: true })

    const result = await tapOnce()

    expect(result.cashuCard).toBeUndefined()
    expect(latest?.cashuCard).toBeUndefined()
    expect(knownCards()).toEqual({})
    // Nothing is asked once AUTH failed. GET_BALANCE, before it, is all a
    // clone gets to say, and only as unverified (ENG-707).
    expect(transceive.mock.calls.map((call) => call[0][1])).toEqual([
      INS_SELECT,
      0x01,
      0x10,
      0x11,
      0x15,
    ])
    expect(toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: i18nObject("en").FlashcardV2.authFailed(),
      }),
    )
    expect(getTag).not.toHaveBeenCalled()
  })

  it("feeds the card's clock in the read tap: TELL_TIME, the kept header when it is newer, and GET_INFO and GET_CARD again once it moved", async () => {
    const headers = jest.requireMock("@app/utils/cashu-card-headers")
    const real = jest.requireActual("@app/utils/cashu-card-headers")
    // A header the phone keeps (fetched off the tap): the newest vector.
    const { HEADER_VECTORS, esploraFetch } = jest.requireActual(
      "../helpers/block-headers",
    )
    await real.refreshTipHeader({ fetcher: esploraFetch(HEADER_VECTORS[2]) })
    tapCashuCard()

    const result = await tapOnce()

    const sent = transceive.mock.calls.map((call) => call[0][1])
    expect(sent.slice(0, 11)).toEqual([
      INS_SELECT,
      0x01,
      0x10,
      0x11,
      0x15,
      0x16,
      0x37,
      0x36,
      0x01,
      0x16,
      0x17,
    ])
    expect(result.cashuCard?.now).toBe(HEADER_VECTORS[2].time)
    expect(headers.refreshTipHeader).toHaveBeenCalled()
    real.resetKeptHeader()
  })

  it("records an ownerless card as not owned, and resolves no owner key for it", async () => {
    tapCashuCard({ owner: null })
    const result = await tapOnce()
    expect(result.cashuCard?.hasOwner).toBe(false)
    expect(knownCards()[PUBKEY_HEX]).toMatchObject({ owned: false })
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
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
