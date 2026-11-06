/**
 * ENG-820: a tap of a 2.2 card relays its last payment to the mint, first.
 * These pin, through the FlashcardProvider:
 *   - on an operation tap that changes slots (a tidy's CLEAR_SPENT and
 *     LOAD_PROOF), the GET_OUTBOX APDUs and the `/v1/swap` come before them
 *   - a 2.1 card is never sent GET_OUTBOX: SELECT, GET_PUBKEY, then the op
 *   - a relay that could not settle blocks a slot-changing op (no op, no
 *     re-read) and lets any other op through, after a toast
 *   - a plain read tap relays too: the packet in the tap, the mint after it
 *   - a refusal that repeats (a usd-keyset packet, a swap the mint refused)
 *     blocks nothing: the op runs, one toast, no second swap on the next tap,
 *     and the card's next record is relayed
 *   - a record at a mint this app does not know is said once, then quiet
 */
import { act, waitFor } from "@testing-library/react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"
import * as Keychain from "react-native-keychain"

import { CASHU_MINT_URL } from "@app/config/appinfo"
import type { CardOperationOptions } from "@app/contexts/Flashcard"
import { Transceiver } from "@app/utils/cashu-card"
import { RelayUnsettledError } from "@app/utils/cashu-card-relay"
import { createRelayRequest } from "@app/utils/cashu-card-topup/mint"
import { unitsForKeysets } from "@app/utils/cashu-mint"
import { toastShow } from "@app/utils/toast"
import { store } from "@app/store/redux"
import {
  cardSeen,
  cardUnitResolved,
  resetFlashcardV2,
} from "@app/store/redux/slices/flashcardV2Slice"

import { FAKE_CARD_KEY, createFakeCard, createFakeMint } from "../helpers/fake-cashu"
import { buildRelayPacket, relayMintFor, samplePayment } from "../helpers/relay-packet"
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
  unitsForKeysets: jest.fn(),
}))
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: jest.fn(async () => undefined),
}))
// The relay's mint is the fake one; no spec reaches the network.
jest.mock("@app/utils/cashu-card-topup/mint", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup/mint"),
  createRelayRequest: jest.fn(),
}))

const INS_SELECT = 0xa4
const INS_GET_PUBKEY = 0x10
const INS_GET_OUTBOX = 0x1b
const INS_CLEAR_SPENT = 0x31
const INS_LOAD_PROOF = 0x30
const CLEAR_SPENT_APDU = [0xb0, INS_CLEAR_SPENT, 0x00, 0x00, 0x01]
/** TELL_TIME: an op that changes no slot (a limit, a PIN stand in for it). */
const NO_SLOT_APDU = [0xb0, 0x37, 0x00, 0x00, 0x04, 0x6a, 0xcc, 0xec, 0xf4]

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock
const relayRequest = createRelayRequest as jest.Mock
const toast = toastShow as jest.Mock

let latest: FlashcardSnapshot | undefined
/** Card APDUs (`card:<INS>`), mint calls (`mint:<route>`) and the release, in order. */
let events: string[]

const setup = ({
  version = [2, 2] as [number, number],
  unit = "sat" as "sat" | "usd",
} = {}) => {
  const mint = createFakeMint()
  const double = relayMintFor(mint)
  const packet = buildRelayPacket(
    FAKE_CARD_KEY,
    samplePayment(unit === "usd" ? mint.usdKeysetId : mint.keysetId, CASHU_MINT_URL),
  )
  const card = createFakeCard(128, { owner: null, version, outbox: { packet } })
  transceive.mockImplementation(async (apdu: number[]) => {
    events.push(`card:${apdu[1].toString(16)}`)
    return card.transceive(apdu)
  })
  relayRequest.mockImplementation((url: string) => {
    expect(url).toBe(CASHU_MINT_URL)
    return async (route: string, body?: unknown) => {
      events.push(`mint:${route}`)
      return double.request(route, body)
    }
  })
  return { mint, double, card }
}

const mount = async () => {
  renderProvider((snapshot) => {
    latest = snapshot
  })
  await waitFor(() => expect(latest?.runCardOperation).toBeDefined())
}

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

const cardEvents = () => events.filter((e) => e.startsWith("card:"))
const toastMessages = () => toast.mock.calls.map(([arg]) => arg.message)

describe("FlashcardProvider relays a 2.2 card's last payment first", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  let warn: jest.SpyInstance

  beforeEach(async () => {
    latest = undefined
    events = []
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    await Keychain.resetInternetCredentials({ server: "flashcard-v2-relay" })
    requestTechnology.mockReset().mockResolvedValue(NfcTech.IsoDep)
    transceive.mockReset()
    cancelTechnologyRequest.mockImplementation(() => {
      events.push("release")
      return Promise.resolve()
    })
    ;(unitsForKeysets as jest.Mock).mockReset().mockResolvedValue({})
    store.dispatch(resetFlashcardV2())
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  it("sends the relay's GET_OUTBOX and its /v1/swap before a tidy's CLEAR_SPENT and LOAD_PROOF", async () => {
    const { card, double } = setup()
    await mount()
    const op = jest.fn(async (t: Transceiver) => {
      await t(CLEAR_SPENT_APDU)
      await t([0xb0, INS_LOAD_PROOF, 0x00, 0x00, 0x01, 0x00])
    })

    const thrown = await runAndCatch(op, card.pubkey, {
      changesSlots: true,
      rereadSlots: true,
    })

    expect(thrown).toBeUndefined()
    expect(op).toHaveBeenCalledTimes(1)
    expect(double.calls["/v1/swap"]).toBe(1)
    const lastOutbox = events.lastIndexOf(`card:${INS_GET_OUTBOX.toString(16)}`)
    const swap = events.indexOf("mint:/v1/swap")
    const clear = events.indexOf(`card:${INS_CLEAR_SPENT.toString(16)}`)
    const load = events.indexOf(`card:${INS_LOAD_PROOF.toString(16)}`)
    expect(lastOutbox).toBeGreaterThan(-1)
    expect(lastOutbox).toBeLessThan(clear)
    expect(swap).toBeGreaterThan(lastOutbox)
    expect(swap).toBeLessThan(clear)
    expect(clear).toBeLessThan(load)
    await waitFor(() =>
      expect(toastMessages()).toContain("Settled this card's last payment."),
    )
  })

  it("never sends GET_OUTBOX to a 2.1 card: SELECT, GET_PUBKEY, then the op", async () => {
    const { card } = setup({ version: [2, 1] })
    await mount()
    const op = jest.fn(async (t: Transceiver) => {
      await t(CLEAR_SPENT_APDU)
    })

    expect(await runAndCatch(op, card.pubkey, { changesSlots: true })).toBeUndefined()

    expect(cardEvents().slice(0, 3)).toEqual([
      `card:${INS_SELECT.toString(16)}`,
      `card:${INS_GET_PUBKEY.toString(16)}`,
      `card:${INS_CLEAR_SPENT.toString(16)}`,
    ])
    expect(cardEvents()).not.toContain(`card:${INS_GET_OUTBOX.toString(16)}`)
    expect(relayRequest).not.toHaveBeenCalled()
  })

  it("blocks a top-up or tidy behind a relay that could not settle, and lets a limit through", async () => {
    const { card, double } = setup()
    double.offline(true)
    await mount()
    const slotOp = jest.fn()

    const thrown = await runAndCatch(slotOp, card.pubkey, { changesSlots: true })

    expect(thrown).toBeInstanceOf(RelayUnsettledError)
    expect(slotOp).not.toHaveBeenCalled()
    // No re-read after it (GET_INFO): the card refused nothing.
    expect(cardEvents()).not.toContain("card:1")
    expect(double.calls["/v1/swap"]).toBeUndefined()

    events = []
    const limitOp = jest.fn(async (t: Transceiver) => {
      await t(NO_SLOT_APDU)
      return "written"
    })
    let result: unknown
    await act(async () => {
      result = await latest?.runCardOperation(limitOp, card.pubkey)
    })
    expect(result).toBe("written")
    expect(limitOp).toHaveBeenCalledTimes(1)
    expect(toastMessages()).toContain(
      "Could not settle the payment yet. Tap the card again later.",
    )
    // The captured packet was not read again: it waits in the journal.
    expect(cardEvents()).not.toContain(`card:${INS_GET_OUTBOX.toString(16)}`)

    // Back online, the next slot-changing tap settles it first.
    double.offline(false)
    expect(await runAndCatch(slotOp, card.pubkey, { changesSlots: true })).toBeUndefined()
    expect(slotOp).toHaveBeenCalledTimes(1)
    expect(double.calls["/v1/swap"]).toBe(1)
  })

  const refusals: {
    name: string
    unit: "sat" | "usd"
    refuse?: number
    swaps: number
  }[] = [
    { name: "a usd-keyset packet", unit: "usd", swaps: 0 },
    { name: "a swap the mint refused", unit: "sat", refuse: 400, swaps: 1 },
  ]
  refusals.forEach(({ name, unit, refuse, swaps }) =>
    it(`lets a top-up or tidy through after ${name}, says so once, and never resends the swap`, async () => {
      const { card, double, mint } = setup({ unit })
      double.refuseSwaps(refuse)
      await mount()
      const slotOp = jest.fn(async () => "loaded")

      expect(
        await runAndCatch(slotOp, card.pubkey, { changesSlots: true }),
      ).toBeUndefined()
      expect(slotOp).toHaveBeenCalledTimes(1)
      expect(double.calls["/v1/swap"] ?? 0).toBe(swaps)
      const refused = "This card's last payment can't be settled from this phone."
      expect(toastMessages().filter((m) => m === refused)).toHaveLength(1)
      // A refusal raised at capture (unit, context) never reached a mint, so
      // no toast may say a mint refused it.
      expect(toastMessages().some((m) => /mint refused/i.test(m))).toBe(false)

      // The next tap: not blocked, no second swap, and no second toast.
      double.refuseSwaps(undefined)
      expect(
        await runAndCatch(slotOp, card.pubkey, { changesSlots: true }),
      ).toBeUndefined()
      expect(slotOp).toHaveBeenCalledTimes(2)
      expect(double.calls["/v1/swap"] ?? 0).toBe(swaps)
      expect(toastMessages().filter((m) => m === refused)).toHaveLength(1)

      // The card's next payment is relayed as usual.
      card.setOutbox(
        buildRelayPacket(
          FAKE_CARD_KEY,
          samplePayment(mint.keysetId, CASHU_MINT_URL, { paymentId: 2, seed: 2 }),
        ),
      )
      expect(
        await runAndCatch(slotOp, card.pubkey, { changesSlots: true }),
      ).toBeUndefined()
      expect(double.calls["/v1/swap"]).toBe(swaps + 1)
      await waitFor(() =>
        expect(toastMessages()).toContain("Settled this card's last payment."),
      )
    }),
  )

  it("says a record at a mint this app does not know once, and is quiet on the next taps", async () => {
    const mint = createFakeMint()
    const packet = buildRelayPacket(
      FAKE_CARD_KEY,
      samplePayment(mint.keysetId, "https://unknown-mint.test"),
    )
    const card = createFakeCard(128, { owner: null, version: [2, 2], outbox: { packet } })
    transceive.mockImplementation(async (apdu: number[]) => card.transceive(apdu))
    await mount()
    const slotOp = jest.fn(async () => "loaded")
    const unknown =
      "This card's last payment is for a mint this app doesn't know, so it wasn't settled."

    for (let tap = 1; tap <= 3; tap += 1) {
      expect(
        await runAndCatch(slotOp, card.pubkey, { changesSlots: true }),
      ).toBeUndefined()
      expect(slotOp).toHaveBeenCalledTimes(tap)
      expect(toastMessages().filter((m) => m === unknown)).toHaveLength(1)
    }
    expect(relayRequest).not.toHaveBeenCalled()
  })

  it("does not relay a card this phone knows holds usd: no GET_OUTBOX, and the op runs", async () => {
    const { card } = setup({ unit: "usd" })
    store.dispatch(
      cardSeen({
        pubkey: card.pubkey,
        version: "2.2",
        pinState: "unset",
        lastBalance: 0,
        owned: false,
        needsUpdate: false,
        limits: { day: 0, allowance: 0 },
        at: 1,
      }),
    )
    store.dispatch(cardUnitResolved({ pubkey: card.pubkey, unit: "usd" }))
    await mount()
    const slotOp = jest.fn(async () => "loaded")

    expect(await runAndCatch(slotOp, card.pubkey, { changesSlots: true })).toBeUndefined()
    expect(slotOp).toHaveBeenCalledTimes(1)
    expect(cardEvents()).not.toContain(`card:${INS_GET_OUTBOX.toString(16)}`)
    expect(relayRequest).not.toHaveBeenCalled()
  })

  it("relays on a plain read tap: the packet in the tap, the mint after it is released", async () => {
    const { double } = setup()
    await mount()

    await act(async () => {
      await latest?.readFlashcard(false)
    })

    await waitFor(() => expect(double.calls["/v1/swap"]).toBe(1))
    await waitFor(() =>
      expect(toastMessages()).toContain("Settled this card's last payment."),
    )
    const release = events.indexOf("release")
    expect(events.lastIndexOf(`card:${INS_GET_OUTBOX.toString(16)}`)).toBeLessThan(
      release,
    )
    expect(events.findIndex((e) => e.startsWith("mint:"))).toBeGreaterThan(release)
  })
})
