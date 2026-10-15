/* eslint-disable no-bitwise -- the fake card's slots are written byte by byte. */
/**
 * ENG-708: a read tap asks the card for its slots (GET_PIECES pages, a
 * GET_PROOF per spent slot) only when something can use them: a top-up (the
 * owner's, or a PIN top-up from another phone) or the owner's tidy offer,
 * both of which need the phone signed in and online. A signed-out or offline
 * read shows the balance without them, labelled with the unit this phone
 * recorded for the same balance (display only). An online, signed-in read
 * still reads them, after the balance is already on screen (ENG-707).
 */
import * as Keychain from "react-native-keychain"
import { act, waitFor } from "@testing-library/react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"

import { store } from "@app/store/redux"
import {
  cardSeen,
  cardUnitResolved,
  resetFlashcardV2,
} from "@app/store/redux/slices/flashcardV2Slice"
import { saveOwnerKey } from "@app/utils/cashu-card-owner-store"

import { FAKE_OWNER_KEY, FakeCard, createFakeCard } from "../helpers/fake-cashu"
import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  ProviderOptions,
  renderProvider,
} from "./flashcard-harness"

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
const mockUnitsForKeysets = jest.fn(async (_ids: string[]) => ({
  "00aabbccddeeff00": "sat",
}))
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: (ids: string[]) => mockUnitsForKeysets(ids),
}))
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: jest.fn(async () => undefined),
}))
const mockFeePpk = jest.fn(async (_id: string) => 0)
jest.mock("@app/utils/cashu-card-topup/connected", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup/connected"),
  topUpMint: () => ({ url: "https://mint.test", feePpk: mockFeePpk }),
}))
// The phone's connectivity, as the provider's `useConnectivity` reports it.
let mockOffline = false
jest.mock("@app/hooks/use-connectivity", () => ({
  useConnectivity: () => ({ isOffline: mockOffline, justReconnected: false }),
}))

const INS_GET_PIECES = 0x17
const INS_GET_PROOF = 0x13
const KEYSET = [0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00]
/** secp256k1's generator, compressed: a C that is a point. */
const C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
const u32 = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
// 57: what a till leaves of a card shaped for 60 after taking 1 and 2 offline.
const AFTER_A_TILL = [1, 2, 2, 4, 4, 4, 8, 8, 8, 16]
const BALANCE = AFTER_A_TILL.reduce((sum, amount) => sum + amount, 0)

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock

let card: FakeCard
let latest: FlashcardSnapshot | undefined

const slotOf = (status: number, amount: number, slot: number) => [
  status,
  ...KEYSET,
  ...u32(amount),
  slot + 1,
  ...new Array(31).fill(0x5a),
  ...(C.match(/../g) ?? []).map((h) => parseInt(h, 16)),
  ...u32(0),
]

/**
 * A card holding `amounts`, one piece a slot, and one spent slot after them,
 * owned by `FAKE_OWNER_KEY` unless `owner` says otherwise.
 */
const holding = (amounts: number[], owner?: string) => {
  card = createFakeCard(128, owner ? { owner } : {})
  amounts.forEach((amount, slot) => {
    card.slots[slot] = slotOf(1, amount, slot)
  })
  card.slots[amounts.length] = slotOf(2, 4, amounts.length)
  requestTechnology.mockResolvedValue(NfcTech.IsoDep)
  transceive.mockImplementation((bytes: number[]) => card.transceive(bytes))
}

/** This phone holds the owner's key for the card: the read's ALLOW_LOAD takes it. */
const ownItHere = () =>
  saveOwnerKey(card.pubkey, {
    privateKey: FAKE_OWNER_KEY,
    source: "device",
    saved: false,
  })

/** This phone recorded the card at `lastBalance`, in `unit`. */
const recorded = (lastBalance: number, unit: string) => {
  store.dispatch(
    cardSeen({
      pubkey: card.pubkey,
      version: "2.0",
      pinState: "unset",
      lastBalance,
      owned: true,
      needsUpdate: false,
      limits: { day: 0, allowance: 0 },
      at: 1,
    }),
  )
  store.dispatch(cardUnitResolved({ pubkey: card.pubkey, unit }))
}

const mount = async (options: ProviderOptions = {}) => {
  renderProvider((snapshot) => {
    latest = snapshot
  }, options)
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
}

/** One whole tap, start to release; resolves once the card is in context. */
const tap = async (options: ProviderOptions = {}) => {
  await mount(options)
  await act(async () => {
    await latest?.readFlashcard(false)
  })
  await waitFor(() => expect(cancelTechnologyRequest).toHaveBeenCalled())
  await waitFor(() => expect(latest?.cashuCard?.balance).toBe(BALANCE))
}

const sent = (ins: number) => card.ins().filter((i) => i === ins).length

describe("FlashcardProvider reads the card's pieces only when something needs them (ENG-708)", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)
  let warn: jest.SpyInstance

  beforeEach(async () => {
    latest = undefined
    mockOffline = false
    store.dispatch(resetFlashcardV2())
    await Keychain.resetInternetCredentials({ server: "flashcard-v2-owner" })
    await Keychain.resetInternetCredentials({ server: "flashcard-v2-topups" })
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    requestTechnology.mockReset()
    transceive.mockReset()
    mockFeePpk.mockReset()
    mockFeePpk.mockResolvedValue(0)
    mockUnitsForKeysets.mockClear()
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  it("a signed-out read of an owned card sends no GET_PIECES and no GET_PROOF, and still shows the balance", async () => {
    holding(AFTER_A_TILL)
    await ownItHere()
    await tap({ isAuthed: false })

    expect(sent(INS_GET_PIECES)).toBe(0)
    expect(sent(INS_GET_PROOF)).toBe(0)
    expect(latest?.cashuCard).toMatchObject({ balance: BALANCE, pubkey: card.pubkey })
    expect(latest?.cashuCard?.keysets).toBeUndefined()
    expect(latest?.cashuCard?.pieces).toBeUndefined()
    expect(latest?.cashuCard?.spentSlots).toBeUndefined()
    expect(mockUnitsForKeysets).not.toHaveBeenCalled()
  })

  it("the owner's read while offline sends no GET_PIECES, and offers no tidy", async () => {
    holding(AFTER_A_TILL)
    await ownItHere()
    mockOffline = true
    await tap()

    expect(sent(INS_GET_PIECES)).toBe(0)
    expect(sent(INS_GET_PROOF)).toBe(0)
    // The owner was still settled in the tap: only the slots were skipped.
    expect(latest?.cashuCard?.ownerKeySource).toBe("device")
    expect(latest?.cashuCard?.unspentSlots).toBeUndefined()
    await act(async () => undefined)
    expect(latest?.cashuCard?.tidyOffer).toBeUndefined()
    expect(mockFeePpk).not.toHaveBeenCalled()
  })

  it("the owner's online read sends GET_PIECES only once the balance is on screen, and holds the card's pieces for a top-up", async () => {
    holding(AFTER_A_TILL)
    await ownItHere()
    await mount()
    // Hold the first GET_PIECES until the test has looked at the context.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let piecesAsked = false
    transceive.mockImplementation(async (bytes: number[]) => {
      if (bytes[1] === INS_GET_PIECES && !piecesAsked) {
        piecesAsked = true
        await held
      }
      return card.transceive(bytes)
    })
    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = latest?.readFlashcard(false) ?? done
    })

    await waitFor(() => expect(piecesAsked).toBe(true))
    // The balance (ENG-707's preview) was already in context when the first
    // GET_PIECES went out.
    await waitFor(() => expect(latest?.cashuCardPreview?.balance).toBe(BALANCE))

    release()
    await act(async () => {
      await done
    })
    await waitFor(() => expect(latest?.cashuCard?.balance).toBe(BALANCE))
    expect(sent(INS_GET_PIECES)).toBeGreaterThan(0)
    expect(sent(INS_GET_PROOF)).toBe(1)
    // What the top-up screen hands the engine as the card's pieces (ENG-700).
    expect([...(latest?.cashuCard?.pieces ?? [])].sort((a, b) => a - b)).toEqual(
      [...AFTER_A_TILL].sort((a, b) => a - b),
    )
    expect(latest?.cashuCard?.spentSlots?.map((slot) => slot.slot)).toEqual([
      AFTER_A_TILL.length,
    ])
    // And the tidy is still offered (ENG-702).
    await waitFor(() =>
      expect(latest?.cashuCard?.tidyOffer).toMatchObject({ kind: "offer" }),
    )
  })

  it("another phone's card, read signed in and online, still sends GET_PIECES: a PIN top-up needs its unit and room", async () => {
    holding(AFTER_A_TILL, "43".repeat(32))
    await ownItHere()
    await tap()

    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
    expect(sent(INS_GET_PIECES)).toBeGreaterThan(0)
    expect(sent(INS_GET_PROOF)).toBe(1)
    await waitFor(() =>
      expect(latest?.cashuCard?.unitTotals).toEqual({
        byUnit: [{ unit: "sat", amount: BALANCE }],
        unknown: 0,
      }),
    )
  })

  describe("the unit this phone recorded, for display only", () => {
    it("labels an offline read with it when the card still says the recorded balance", async () => {
      holding(AFTER_A_TILL)
      await ownItHere()
      recorded(BALANCE, "sat")
      mockOffline = true
      await tap()

      expect(sent(INS_GET_PIECES)).toBe(0)
      expect(latest?.cashuCard?.recordUnit).toBe("sat")
      // Never as the mint's units: a top-up decides on those alone.
      expect(latest?.cashuCard?.unitTotals).toBeUndefined()
      // The record keeps its unit for the same balance.
      expect(store.getState().flashcardV2.cards[card.pubkey].unit).toBe("sat")
    })

    it("labels a signed-out read with it too", async () => {
      holding(AFTER_A_TILL)
      recorded(BALANCE, "usd")
      await tap({ isAuthed: false })

      expect(latest?.cashuCard?.recordUnit).toBe("usd")
    })

    it("leaves the unit unknown when the balance moved since it was recorded", async () => {
      holding(AFTER_A_TILL)
      await ownItHere()
      recorded(BALANCE + 3, "sat")
      mockOffline = true
      await tap()

      expect(latest?.cashuCard?.recordUnit).toBeUndefined()
      expect(latest?.cashuCard?.unitTotals).toBeUndefined()
    })

    it("is not set on a read that has the split", async () => {
      holding(AFTER_A_TILL)
      await ownItHere()
      recorded(BALANCE, "sat")
      await tap()

      expect(sent(INS_GET_PIECES)).toBeGreaterThan(0)
      expect(latest?.cashuCard?.recordUnit).toBeUndefined()
    })

    it("is dropped when an operation moves the balance", async () => {
      holding(AFTER_A_TILL)
      await ownItHere()
      recorded(BALANCE, "sat")
      mockOffline = true
      await tap()
      expect(latest?.cashuCard?.recordUnit).toBe("sat")

      // The operation adds a piece; its re-read reads the new split.
      await act(async () => {
        await latest?.runCardOperation(async () => {
          card.slots[20] = slotOf(1, 8, 20)
        }, card.pubkey)
      })

      await waitFor(() => expect(latest?.cashuCard?.balance).toBe(BALANCE + 8))
      expect(latest?.cashuCard?.recordUnit).toBeUndefined()
    })
  })
})
