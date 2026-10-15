/* eslint-disable no-bitwise -- the fake card's slots are written byte by byte. */
/**
 * ENG-702: the card context offers a tidy only after a signed-in read where
 * the card took this phone's grant (its owner), once the mint has named the
 * fee (online), and only for a card below its shape. A card whose owner is
 * another phone, a signed-out read, a mint that cannot be asked and a card at
 * its shape get no offer; and a tidy run through `runCardOperation` drops the
 * offer, with the pieces read again (`rereadSlots`).
 */
import * as Keychain from "react-native-keychain"
import { act, waitFor } from "@testing-library/react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"

import { setCardBridge } from "@app/utils/cashu-card-bridge"
import { toHex } from "@app/utils/cashu-card"
import { store } from "@app/store/redux"
import { resetFlashcardV2 } from "@app/store/redux/slices/flashcardV2Slice"
import { saveOwnerKey } from "@app/utils/cashu-card-owner-store"
import { targetPieces } from "@app/utils/cashu-card-shape"

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
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: jest.fn(async () => ({ "00aabbccddeeff00": "sat" })),
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

const KEYSET = [0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00]
/** secp256k1's generator, compressed: a C that is a point. */
const C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
const u32 = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
// 57: what a till leaves of a card shaped for 60 after taking 1 and 2 offline.
const AFTER_A_TILL = [1, 2, 2, 4, 4, 4, 8, 8, 8, 16]

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock

let card: FakeCard
let latest: FlashcardSnapshot | undefined

/** A card holding `amounts`, one piece a slot, owned by `FAKE_OWNER_KEY` unless `owner` says otherwise. */
const holding = (amounts: number[], owner?: string) => {
  card = createFakeCard(128, owner ? { owner } : {})
  amounts.forEach((amount, slot) => {
    card.slots[slot] = [
      1,
      ...KEYSET,
      ...u32(amount),
      slot + 1,
      ...new Array(31).fill(0x5a),
      ...(C.match(/../g) ?? []).map((h) => parseInt(h, 16)),
      ...u32(0),
    ]
  })
  requestTechnology.mockResolvedValue(NfcTech.IsoDep)
  transceive.mockImplementation((bytes: number[]) => card.transceive(bytes))
}

const tap = async (options: ProviderOptions = {}) => {
  renderProvider((snapshot) => {
    latest = snapshot
  }, options)
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
  await act(async () => {
    await latest?.readFlashcard(false)
  })
  await waitFor(() => expect(cancelTechnologyRequest).toHaveBeenCalled())
  await waitFor(() => expect(latest?.cashuCard?.unitTotals).toBeDefined())
}

/** This phone holds the owner's key for the card: the read's ALLOW_LOAD takes it. */
const ownItHere = () =>
  saveOwnerKey(card.pubkey, {
    privateKey: FAKE_OWNER_KEY,
    source: "device",
    saved: false,
  })

describe("FlashcardProvider tidy offer (ENG-702)", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)
  let warn: jest.SpyInstance

  beforeEach(async () => {
    latest = undefined
    store.dispatch(resetFlashcardV2())
    await Keychain.resetInternetCredentials({ server: "flashcard-v2-owner" })
    await Keychain.resetInternetCredentials({ server: "flashcard-v2-topups" })
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    requestTechnology.mockReset()
    transceive.mockReset()
    mockFeePpk.mockReset()
    mockFeePpk.mockResolvedValue(0)
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  it("offers a tidy after the owner's online read of a card below its shape", async () => {
    holding(AFTER_A_TILL)
    await ownItHere()
    await tap()

    await waitFor(() =>
      expect(latest?.cashuCard?.tidyOffer).toMatchObject({
        kind: "offer",
        outputs: 5,
        fee: 0,
      }),
    )
    expect(mockFeePpk).toHaveBeenCalledWith("00aabbccddeeff00")
    expect(latest?.cashuCard?.unspentSlots).toHaveLength(AFTER_A_TILL.length)
  })

  it("offers nothing when the card is another phone's: no grant in the read", async () => {
    holding(AFTER_A_TILL, "43".repeat(32))
    await ownItHere()
    await tap()
    await act(async () => undefined)
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
    expect(latest?.cashuCard?.tidyOffer).toBeUndefined()
    expect(mockFeePpk).not.toHaveBeenCalled()
  })

  it("offers nothing on a signed-out read", async () => {
    holding(AFTER_A_TILL)
    await ownItHere()
    await tap({ isAuthed: false })
    await act(async () => undefined)
    // The read took the pieces to name the unit (ENG-708): the offer is
    // withheld for being signed out, not for want of pieces.
    expect(latest?.cashuCard?.unspentSlots).toBeDefined()
    expect(latest?.cashuCard?.tidyOffer).toBeUndefined()
    expect(mockFeePpk).not.toHaveBeenCalled()
  })

  it("offers nothing offline: the mint could not name its fee", async () => {
    holding(AFTER_A_TILL)
    await ownItHere()
    mockFeePpk.mockRejectedValue(new Error("Network request failed"))
    await tap()
    await waitFor(() => expect(mockFeePpk).toHaveBeenCalled())
    await act(async () => undefined)
    expect(latest?.cashuCard?.tidyOffer).toBeUndefined()
  })

  it("offers nothing for a card at its shape", async () => {
    holding(targetPieces(60))
    await ownItHere()
    await tap()
    await waitFor(() => expect(mockFeePpk).toHaveBeenCalled())
    await act(async () => undefined)
    expect(latest?.cashuCard?.tidyOffer).toBeUndefined()
  })

  it("drops the offer, and reads the pieces again, after an operation that asks for it", async () => {
    holding(AFTER_A_TILL)
    await ownItHere()
    await tap()
    await waitFor(() => expect(latest?.cashuCard?.tidyOffer).toBeDefined())

    // The operation reshapes the card without moving its balance: a 16 for 8+8.
    await act(async () => {
      await latest?.runCardOperation(
        async () => {
          card.slots[9] = [
            ...card.slots[9].slice(0, 9),
            ...u32(8),
            ...card.slots[9].slice(13),
          ]
          card.slots[10] = [...card.slots[9]]
          card.slots[10][13] = 0x77
        },
        card.pubkey,
        { rereadSlots: true },
      )
    })

    expect(latest?.cashuCard?.tidyOffer).toBeUndefined()
    expect(latest?.cashuCard?.pieces?.sort((a, b) => a - b)).toEqual([
      1, 2, 2, 4, 4, 4, 8, 8, 8, 8, 8,
    ])
    expect(latest?.cashuCard?.unspentSlots).toHaveLength(11)
  })

  it("offers a tidy on a development build's simulated card, whose owner the bridge's key is (the e2e flows)", async () => {
    holding(AFTER_A_TILL)
    const fromHex = (hex: string) => (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation((async (
      _url: string,
      init: { body: string },
    ) => {
      const answer = await card.transceive(fromHex(JSON.parse(init.body).hex))
      return { ok: true, status: 200, json: async () => ({ hex: toHex(answer) }) }
    }) as unknown as typeof fetch)
    setCardBridge({
      url: "http://localhost:9876",
      mintUrl: "http://localhost:3338",
      ownerKey: FAKE_OWNER_KEY,
    })
    try {
      renderProvider((snapshot) => {
        latest = snapshot
      })
      await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
      await act(async () => {
        await latest?.readFlashcard(false)
      })
      // The bridge's key is never offered as the read's grant.
      expect(card.ins()).not.toContain(0x45)
      await waitFor(() =>
        expect(latest?.cashuCard?.tidyOffer).toMatchObject({ kind: "offer", outputs: 5 }),
      )
    } finally {
      setCardBridge(undefined)
      fetchSpy.mockRestore()
    }
  })
})
