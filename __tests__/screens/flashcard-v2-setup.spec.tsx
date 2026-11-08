/**
 * ENG-675: setting up a Cashu card (card protocol 2.0; architect's decisions
 * 14 and 15). Before the tap, off the card: the owner key (the seed's, or a
 * random one that lives only on this phone, which the screen says) and the tip
 * header for the clock's anchor. Then one tap, owner last: the PIN when one is
 * chosen, the record, the key saved, SET_OWNER. A setup cut short is finished
 * by the next tap with the key already saved.
 */
import * as React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import { NfcError } from "react-native-nfc-manager"

import type { CardOperationOptions, CashuCardState } from "../../app/contexts/Flashcard"
import appTheme from "../../app/rne-theme/theme"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { FlashcardV2SetupScreen } from "../../app/screens/card-screen/flashcard-v2-setup"
import {
  CardNeedsUpdateError,
  CardProtocolError,
  CardTap,
  Transceiver,
} from "../../app/utils/cashu-card"
import { RelayUnsettledError } from "../../app/utils/cashu-card-relay"
import { ownerPublicKey } from "../../app/utils/cashu-card-owner"
import { FAKE_OWNER_KEY, FakeCard, createFakeCard } from "../helpers/fake-cashu"
import { cardRecord, cashuCardState } from "../helpers/cashu-card-state"
import { isolatedMintName } from "../../app/utils/cashu-card-format"
import { HEADER_VECTORS, headerBytes } from "../helpers/block-headers"
import rootReducer from "../../app/store/redux/reducers"
import type { FlashcardV2Slice } from "../../app/store/redux/slices/flashcardV2Slice"

loadLocale("en")
const LL = i18nObject("en")

const mockGoBack = jest.fn()
const mockToast = jest.fn()
const mockNewOwnerKey = jest.fn()
const mockOwnerKeyFor = jest.fn()
const mockSaveOwnerKey = jest.fn()
const mockRefreshTipHeader = jest.fn()
const mockFetchKeysetUnits = jest.fn()
/** The real freezeSetupIntent and setUpCard, watched: a retry must not freeze again. */
const mockFreezeSetupIntent = jest.fn()
const mockSetUpCard = jest.fn()
/** flushPersisted, as the screen awaits it before each card write (ENG-826). */
const mockFlushPersisted = jest.fn()
let mockCard: CashuCardState | undefined
let capturedOptions: CardOperationOptions | undefined
type Op = (
  t: Transceiver,
  report: (text: string) => void,
  tap: CardTap,
) => Promise<unknown>
let mockRunResult: (op: Op) => Promise<unknown>

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/utils/toast", () => ({
  toastShow: (...args: unknown[]) => mockToast(...args),
}))
jest.mock("@app/utils/cashu-card-bridge", () => ({
  ...jest.requireActual("@app/utils/cashu-card-bridge"),
  cardMintUrl: () => "https://mint.test",
}))
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  fetchKeysetUnits: (...args: unknown[]) => mockFetchKeysetUnits(...args),
}))
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: (...args: unknown[]) => mockRefreshTipHeader(...args),
}))
jest.mock("@app/utils/cashu-card-owner-store", () => ({
  ...jest.requireActual("@app/utils/cashu-card-owner-store"),
  newOwnerKey: (...args: unknown[]) => mockNewOwnerKey(...args),
  ownerKeyFor: (...args: unknown[]) => mockOwnerKeyFor(...args),
  saveOwnerKey: (...args: unknown[]) => mockSaveOwnerKey(...args),
  freezeSetupIntent: (...args: unknown[]) => mockFreezeSetupIntent(...args),
  setUpCard: (...args: unknown[]) => mockSetUpCard(...args),
}))
const actualOwnerStore = jest.requireActual("@app/utils/cashu-card-owner-store")
mockFreezeSetupIntent.mockImplementation(actualOwnerStore.freezeSetupIntent)
mockSetUpCard.mockImplementation(actualOwnerStore.setUpCard)
jest.mock("@app/store/redux", () => ({
  ...jest.requireActual("@app/store/redux"),
  flushPersisted: (...args: unknown[]) => mockFlushPersisted(...args),
}))
jest.mock("@app/hooks", () => ({
  useFlashcard: () => ({
    cashuCard: mockCard,
    runCardOperation: async (op: Op, _pubkey: string, options?: CardOperationOptions) => {
      capturedOptions = options
      return mockRunResult(op)
    },
  }),
}))

/** A store as the app's, unpersisted: `flashcardV2` as a restart rehydrates it. */
const newStore = (flashcardV2?: FlashcardV2Slice) =>
  configureStore({
    reducer: rootReducer,
    ...(flashcardV2
      ? { preloadedState: { flashcardV2 } as Parameters<typeof rootReducer>[0] }
      : {}),
  })
let testStore = newStore()
/** What `flushPersisted` put on disk last: the slice a restart rehydrates. */
let disk: FlashcardV2Slice | undefined
const flushToDisk = async () => {
  disk = JSON.parse(JSON.stringify(testStore.getState().flashcardV2))
}
beforeEach(() => {
  testStore = newStore()
  disk = undefined
  mockFlushPersisted.mockImplementation(flushToDisk)
})

const SEED_KEY = { privateKey: FAKE_OWNER_KEY, source: "seed", saved: false }
/** The applet version setup writes to (ENG-825). */
const V22: [number, number] = [2, 2]
/** runCardOperation as the provider runs it: `op` on `card`, with the tap's SELECT and GET_PUBKEY. */
const runOn =
  (card: FakeCard, version: number[] = V22, pubkey = card.pubkey) =>
  (op: Op) =>
    op(card.transceive, () => undefined, { version, pubkey })
const hex = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("")

/** Renders with no wait for the intro: a card refused before it never shows one. */
const renderPlain = () =>
  render(
    <Provider store={testStore}>
      <ThemeProvider
        theme={createTheme({
          mode: "light",
          lightColors: appTheme.lightColors,
          darkColors: appTheme.darkColors,
        })}
      >
        <FlashcardV2SetupScreen />
      </ThemeProvider>
    </Provider>,
  )

const renderScreen = async () => {
  const rendered = renderPlain()
  await waitFor(() => expect(screen.getByTestId("setup-intro")).toBeTruthy())
  return rendered
}

const type = (digits: string) => {
  for (const d of digits) fireEvent.press(screen.getByTestId(`pin-${d}`))
}
const errorText = () => screen.getByTestId("setup-error").props.children

/** Chooses `pin` (new and confirm) and taps. */
const chooseAndTap = async (pin: string, confirm = pin) => {
  fireEvent.press(screen.getByTestId("setup-choose-pin"))
  type(pin)
  fireEvent.press(screen.getByTestId("pin-next"))
  type(confirm)
  fireEvent.press(screen.getByTestId("pin-next"))
  await act(async () => {
    fireEvent.press(screen.getByTestId("setup-tap"))
  })
}

describe("FlashcardV2SetupScreen", () => {
  let card: FakeCard
  let order: string[]
  /** `c`'s own answers, each INS noted in `order`. */
  const trace = (c: FakeCard) => {
    const answer = c.transceive.getMockImplementation()!
    return async (apdu: number[]) => {
      order.push(apdu[1].toString(16))
      return answer(apdu)
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    capturedOptions = undefined
    order = []
    card = createFakeCard(128, { owner: null, sealed: true, version: V22 })
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      order.push(apdu[1].toString(16))
      return answer(apdu)
    })
    mockCard = cashuCardState({
      pubkey: card.pubkey,
      hasOwner: false,
      recordSet: false,
      pinState: "unset",
      unspent: 0,
      balance: 0,
      ownerKeySource: undefined,
    })
    mockRunResult = runOn(card)
    mockOwnerKeyFor.mockResolvedValue(undefined)
    mockNewOwnerKey.mockResolvedValue(SEED_KEY)
    mockSaveOwnerKey.mockImplementation(async () => {
      order.push("saved")
    })
    mockRefreshTipHeader.mockResolvedValue({
      bytes: headerBytes(HEADER_VECTORS[2]),
      time: HEADER_VECTORS[2].time,
    })
  })

  it("says setup makes this phone the owner, that an empty card belongs to the first phone that sets it up, and that the key comes from the recovery phrase", async () => {
    await renderScreen()
    expect(screen.getByText(LL.FlashcardV2.setUpIntro())).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.setUpFirstPhone())).toBeTruthy()
    expect(screen.getByTestId("setup-key-seed").props.children).toBe(
      LL.FlashcardV2.setUpKeySeed(),
    )
    expect(mockNewOwnerKey).toHaveBeenCalledWith(card.pubkey)
  })

  it("says the owner key lives only on this phone when the phone has no recovery phrase", async () => {
    mockNewOwnerKey.mockResolvedValue({
      privateKey: "11".repeat(32),
      source: "device",
      saved: false,
    })
    await renderScreen()
    expect(screen.getByTestId("setup-key-device").props.children).toBe(
      "This card's owner key lives only on this phone. If you lose the phone, nobody can change the card's PIN or limits again.",
    )
  })

  it("with a PIN: SET_PIN and VERIFY_PIN (sealed), SET_CARD, the key saved, then SET_OWNER with the tip as its anchor, in one tap", async () => {
    await renderScreen()

    await chooseAndTap("2468")

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    // The two sealed PIN commands each ask the card for its PIN key first.
    // GET_CARD is read with GET_INFO before anything is written (ENG-825).
    // ENG-826: SET_CARD is read back (GET_CARD) before the key is saved.
    expect(order).toEqual(["1", "16", "44", "41", "44", "40", "32", "16", "saved", "43"])
    expect(mockSaveOwnerKey).toHaveBeenCalledWith(card.pubkey, SEED_KEY)
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    expect(card.pin()).toBe("2468")
    expect(card.record()).toEqual({ set: true, mint: "https://mint.test" })
    expect(card.now()).toBe(HEADER_VECTORS[2].time)
    expect(capturedOptions).toEqual({
      changesSlots: true,
      assume: {
        hasOwner: true,
        recordSet: true,
        pinState: "set",
        record: { recordSet: true },
      },
      learned: { ownerKeySource: "seed" },
    })
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", message: LL.FlashcardV2.setUpDone() }),
    )
    expect(JSON.stringify(mockToast.mock.calls)).not.toContain("2468")
  })

  it("without a PIN: SET_CARD, the key saved, SET_OWNER; and it says what a card with no PIN is", async () => {
    await renderScreen()
    fireEvent.press(screen.getByTestId("setup-no-pin"))
    expect(screen.getByTestId("setup-tap-note").props.children).toBe(
      LL.FlashcardV2.setUpNoPinNote(),
    )
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(order).toEqual(["1", "16", "32", "16", "saved", "43"])
    expect(card.pin()).toBeUndefined()
    expect(capturedOptions?.assume).toEqual({
      hasOwner: true,
      recordSet: true,
      record: { recordSet: true },
    })
  })

  it("sends no anchor when the phone has no tip header: SET_OWNER carries the key alone", async () => {
    mockRefreshTipHeader.mockResolvedValue(undefined)
    await renderScreen()
    fireEvent.press(screen.getByTestId("setup-no-pin"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled())
    const setOwner = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x43)
    expect(setOwner?.[4]).toBe(65)
    expect(card.now()).toBe(0)
  })

  it("an open card that has a PIN from before is refused at the intro, before a PIN is typed: nothing is tapped", async () => {
    mockCard = { ...(mockCard as CashuCardState), pinState: "set" }
    renderPlain()
    await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpPinSet()))
    expect(screen.getByTestId("setup-close")).toBeTruthy()
    expect(screen.queryByTestId("setup-choose-pin")).toBeNull()
    expect(screen.queryByTestId("setup-no-pin")).toBeNull()
    expect(order).toEqual([])
  })

  const refusedAtIntro = async (overrides: Partial<CashuCardState>, message: string) => {
    mockCard = { ...(mockCard as CashuCardState), ...overrides }
    renderPlain()
    await waitFor(() => expect(errorText()).toBe(message))
    expect(screen.getByTestId("setup-close")).toBeTruthy()
    expect(order).toEqual([])
  }
  for (const [name, overrides, message] of [
    ["owned", { hasOwner: true }, () => LL.FlashcardV2.setUpAlreadyOwned()],
    ["funded", { unspent: 2, balance: 10 }, () => LL.FlashcardV2.setUpInUse()],
  ] as [string, Partial<CashuCardState>, () => string][]) {
    it(`a card already read as ${name} is refused at the intro`, () =>
      refusedAtIntro(overrides, message()))
  }

  it("a mismatched confirmation goes back to the new PIN and taps nothing", async () => {
    await renderScreen()
    fireEvent.press(screen.getByTestId("setup-choose-pin"))
    type("2468")
    fireEvent.press(screen.getByTestId("pin-next"))
    type("2469")
    fireEvent.press(screen.getByTestId("pin-next"))
    expect(errorText()).toBe(LL.FlashcardV2.pinMismatch())
    expect(screen.getByTestId("pin-step-title").props.children).toBe(
      LL.FlashcardV2.newPin(),
    )
    expect(order).toEqual([])
  })

  it("a tap lost once SET_OWNER went out says to tap again, and the next tap finds this phone the owner with the key it saved", async () => {
    const answer = card.transceive.getMockImplementation()!
    card.transceive.mockImplementation(async (apdu) => {
      const response = await answer(apdu)
      if (apdu[1] === 0x43) throw new Error("Tag was lost")
      return response
    })
    await renderScreen()
    fireEvent.press(screen.getByTestId("setup-no-pin"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUncertain()))
    // The key was saved before SET_OWNER, which landed.
    expect(mockSaveOwnerKey).toHaveBeenCalledTimes(1)
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))

    // Tap again: the card has an owner, and takes this phone's proof.
    card.transceive.mockImplementation(answer)
    card.transceive.mockClear()
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    // ENG-826: SET_OWNER had gone out, so the record is read back and the
    // wallet's record finished.
    expect(card.ins()).toEqual([0x01, 0x44, 0x45, 0x16])
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: LL.FlashcardV2.setUpAlreadyMine() }),
    )
    expect(disk?.setups?.[card.pubkey]).toMatchObject({
      status: "set-up",
      heldByCard: { mint: "https://mint.test", unit: 0, refundKey: null, design: null },
    })
  })

  it("resumes with the key saved for the card, not a new one", async () => {
    const saved = { privateKey: "33".repeat(32), source: "device", saved: true }
    mockOwnerKeyFor.mockResolvedValue(saved)
    await renderScreen()
    expect(mockNewOwnerKey).not.toHaveBeenCalled()
    expect(screen.getByTestId("setup-key-device")).toBeTruthy()
  })

  it("a card another phone already owns says so and ends the setup: nothing is written", async () => {
    card = createFakeCard(128, { owner: "11".repeat(32), version: V22 })
    mockRunResult = runOn(card)
    await renderScreen()
    fireEvent.press(screen.getByTestId("setup-no-pin"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpAlreadyOwned()))
    expect(screen.getByTestId("setup-close")).toBeTruthy()
    expect(card.ins()).toEqual([0x01, 0x44, 0x45])
  })

  it("a card holding funds cannot be set up", async () => {
    card.slots[0] = [1, ...new Array(81).fill(1)]
    await renderScreen()
    fireEvent.press(screen.getByTestId("setup-no-pin"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpInUse()))
    expect(order).toEqual(["1", "16"])
  })

  // ENG-825: the guard before any write, as the holder sees it.
  describe("the guard before any write (ENG-825)", () => {
    const tapNoPin = async () => {
      fireEvent.press(screen.getByTestId("setup-no-pin"))
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
    }
    /** Every INS sent was a read. */
    const onlyReads = () =>
      expect(order.filter((ins) => !["1", "10", "16", "a4"].includes(ins))).toEqual([])

    for (const [label, arrange, message] of [
      [
        "a used card",
        () => {
          card.slots[5] = [2, ...new Array(81).fill(1)]
        },
        () => LL.FlashcardV2.setUpUsed(),
      ],
      [
        "a locked card",
        () => {
          card = createFakeCard(128, { owner: null, version: V22, locked: true })
          card.transceive.mockImplementation(trace(card))
          mockRunResult = runOn(card)
        },
        () => LL.FlashcardV2.setUpLocked(),
      ],
      [
        "a card with limits",
        () => {
          card = createFakeCard(128, { owner: null, version: V22, limits: { day: 5000 } })
          card.transceive.mockImplementation(trace(card))
          mockRunResult = runOn(card)
        },
        () => LL.FlashcardV2.setUpLimitsSet(),
      ],
      [
        "an applet older than 2.2",
        () => {
          card = createFakeCard(128, { owner: null, version: [2, 1] })
          card.transceive.mockImplementation(trace(card))
          mockRunResult = runOn(card, [2, 1])
        },
        () => LL.FlashcardV2.setUpNeedsApplet(),
      ],
    ] as [string, () => void, () => string][]) {
      it(`${label} is refused inline, for good: Close, and nothing written`, async () => {
        arrange()
        await renderScreen()
        await tapNoPin()
        await waitFor(() => expect(errorText()).toBe(message()))
        expect(screen.getByTestId("setup-close")).toBeTruthy()
        expect(screen.queryByTestId("setup-tap")).toBeNull()
        onlyReads()
        expect(mockSaveOwnerKey).not.toHaveBeenCalled()
      })
    }

    it("a newer 2.x applet asks for a Flash update, and sends nothing at all", async () => {
      mockRunResult = runOn(card, [2, 3])
      await renderScreen()
      await tapNoPin()
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpNeedsAppUpdate()))
      expect(screen.getByTestId("setup-close")).toBeTruthy()
      expect(screen.queryByTestId("setup-tap")).toBeNull()
      expect(order).toEqual([])
    })

    it("a newer applet major, refused at SELECT, asks for a Flash update for good", async () => {
      // runCardOperation's SELECT throws this for a 3.x applet (checkVersion).
      mockRunResult = () => Promise.reject(new CardNeedsUpdateError("newer"))
      await renderScreen()
      await tapNoPin()
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpNeedsAppUpdate()))
      expect(screen.getByTestId("setup-close")).toBeTruthy()
      expect(screen.queryByTestId("setup-tap")).toBeNull()
      expect(mockSaveOwnerKey).not.toHaveBeenCalled()
    })

    it("a card whose record names another mint says which, for good", async () => {
      // The screen read the card with no record; its record names mint.test
      // by the tap, and the holder chose Minibits.
      card = createFakeCard(128, { owner: null, version: V22, record: true })
      card.transceive.mockImplementation(trace(card))
      mockRunResult = runOn(card)
      await renderScreen()
      fireEvent.press(screen.getByTestId("setup-mint-change"))
      fireEvent.press(screen.getByTestId("setup-mint-option-Minibits"))
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-mint-next"))
      })
      await tapNoPin()
      await waitFor(() =>
        expect(errorText()).toBe(
          LL.FlashcardV2.setUpOtherMint({ mint: isolatedMintName("https://mint.test") }),
        ),
      )
      expect(screen.getByTestId("setup-close")).toBeTruthy()
      onlyReads()
      expect(card.record()).toEqual({ set: true, mint: "https://mint.test" })
    })

    it("an answer framed wrong says the card could not be read, and to tap again: not the uncertain copy", async () => {
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        // GET_INFO cut to 30 bytes.
        return apdu[1] === 0x01 ? [...response.slice(0, 30), 0x90, 0x00] : response
      })
      await renderScreen()
      await tapNoPin()
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUnreadable()))
      expect(errorText()).not.toBe(LL.FlashcardV2.setUpUncertain())
      expect(screen.getByTestId("setup-tap")).toBeTruthy()
      expect(card.ins()).toEqual([0x01])
    })

    it("a CardProtocolError from the tap is the unreadable copy too", async () => {
      mockRunResult = async () => {
        throw new CardProtocolError("GET_PUBKEY: expected 33 bytes, got 2")
      }
      await renderScreen()
      await tapNoPin()
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUnreadable()))
      expect(screen.getByTestId("setup-tap")).toBeTruthy()
    })

    it("a 2.2 card's payment that could not be settled says so, and lets the holder tap again", async () => {
      mockRunResult = async () => {
        throw new RelayUnsettledError({ kind: "pending" } as never)
      }
      await renderScreen()
      await tapNoPin()
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.relayPending()))
      expect(screen.getByTestId("setup-tap")).toBeTruthy()
    })

    it("a tap that reaches another card than the one the sequence is for says so, and writes nothing", async () => {
      mockRunResult = runOn(card, V22, "02" + "cd".repeat(32))
      await renderScreen()
      await tapNoPin()
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.wrongCard()))
      expect(screen.getByTestId("setup-tap")).toBeTruthy()
      onlyReads()
    })

    /** Each tap's write cut once, after the card took INS `ins`: the answer is lost. */
    const cutOnceAfter = (ins: number) => {
      const answer = card.transceive.getMockImplementation()!
      let cut = true
      card.transceive.mockImplementation(async (apdu) => {
        order.push(apdu[1].toString(16))
        const response = await answer(apdu)
        if (cut && apdu[1] === ins) {
          cut = false
          throw new Error("Tag was lost")
        }
        return response
      })
    }

    it("a retry reuses the frozen intent: a tap cut after SET_PIN is finished by the next, with the same PIN, and nothing is frozen again", async () => {
      cutOnceAfter(0x41)
      await renderScreen()
      await chooseAndTap("2468")
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUncertain()))
      expect(card.pin()).toBe("2468")
      expect(mockFreezeSetupIntent).toHaveBeenCalledTimes(1)
      const intent = mockSetUpCard.mock.calls[0][1].intent

      // Tap again: the card now says its PIN is set, by this sequence.
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      // The retry froze nothing new: it wrote the first tap's intent, the same object.
      expect(mockFreezeSetupIntent).toHaveBeenCalledTimes(1)
      expect(mockSetUpCard).toHaveBeenCalledTimes(2)
      expect(mockSetUpCard.mock.calls[1][1].intent).toBe(intent)
      expect(mockSetUpCard.mock.calls[1][1].progress).toBe(
        mockSetUpCard.mock.calls[0][1].progress,
      )
      expect(card.pin()).toBe("2468")
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
      expect(card.record()).toEqual({ set: true, mint: intent.mint })
    })

    it("a tap cut after VERIFY_PIN, the card's allowance armed by it, is finished by the next tap", async () => {
      cutOnceAfter(0x40)
      await renderScreen()
      await chooseAndTap("2468")
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUncertain()))
      expect(card.pin()).toBe("2468")
      expect(card.owner()).toBeUndefined()

      // Tap again: the PIN is set and the allowance armed, both by this sequence.
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      expect(screen.queryByTestId("setup-error")).toBeNull()
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
      expect(card.record()).toEqual({ set: true, mint: "https://mint.test" })
    })
  })

  // ENG-826: the wallet's record of the setup, kept across a restart.
  describe("the setup record (ENG-826)", () => {
    /** The card's answers, with `ins` answered and then its reply lost. */
    const losingAfter = (ins: number) => {
      const answer = card.transceive.getMockImplementation()!
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] === ins) throw new Error("Tag was lost")
        return response
      })
      return answer
    }
    /** An app restart: the screen gone, the store rebuilt from what reached disk. */
    const restart = (unmount: () => void, overrides: Partial<CashuCardState> = {}) => {
      unmount()
      testStore = newStore(disk)
      mockCard = { ...(mockCard as CashuCardState), ...overrides }
    }
    const pinTitle = () => screen.getByTestId("pin-step-title").props.children
    const setPinCount = () => order.filter((ins) => ins === "41").length

    it("a tap cut after SET_PIN, then a restart: one PIN entry to verify it, one tap finishes, and SET_PIN went out once", async () => {
      const answer = losingAfter(0x41)
      const { unmount } = await renderScreen()
      await chooseAndTap("2468")
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUncertain()))
      expect(card.pin()).toBe("2468")
      expect(disk?.setups?.[card.pubkey]).toMatchObject({
        status: "started",
        progress: { pinSent: true, recordSent: false, ownerSent: false },
      })

      card.transceive.mockImplementation(answer)
      restart(unmount, { pinState: "set" })
      renderPlain()
      // The PIN on the card is this wallet's own: not refused as one from before.
      await waitFor(() => expect(pinTitle()).toBe(LL.FlashcardV2.setUpResumePin()))
      expect(screen.queryByText(LL.FlashcardV2.setUpPinSet())).toBeNull()
      type("2468")
      fireEvent.press(screen.getByTestId("pin-next"))
      // No confirm: straight to the tap.
      expect(screen.getByTestId("setup-tap")).toBeTruthy()
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      expect(setPinCount()).toBe(1)
      expect(order).toContain("40")
      expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
      // The stored intent was resumed, not frozen again.
      expect(mockFreezeSetupIntent).toHaveBeenCalledTimes(1)
      expect(disk?.setups?.[card.pubkey]?.status).toBe("set-up")
      expect(JSON.stringify(disk)).not.toContain("2468")
    })

    it("a wrong PIN on the resume says how many tries are left and asks again", async () => {
      const answer = losingAfter(0x41)
      const { unmount } = await renderScreen()
      await chooseAndTap("2468")
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUncertain()))

      card.transceive.mockImplementation(answer)
      restart(unmount, { pinState: "set" })
      renderPlain()
      await waitFor(() => expect(pinTitle()).toBe(LL.FlashcardV2.setUpResumePin()))
      type("1357")
      fireEvent.press(screen.getByTestId("pin-next"))
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.wrongPin({ tries: 2 })))
      expect(pinTitle()).toBe(LL.FlashcardV2.setUpResumePin())
      expect(order).not.toContain("32")
      type("2468")
      fireEvent.press(screen.getByTestId("pin-next"))
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      expect(setPinCount()).toBe(1)
    })

    it("a read-back that differs stops before SET_OWNER, and the card is refused at the intro after a restart", async () => {
      const answer = card.transceive.getMockImplementation()!
      let reads = 0
      card.transceive.mockImplementation(async (apdu) => {
        const response = await answer(apdu)
        if (apdu[1] !== 0x16) return response
        reads += 1
        // The read-back names another unit than the one written.
        return reads === 2 ? [...response.slice(0, 2), 1, ...response.slice(3)] : response
      })
      const { unmount } = await renderScreen()
      fireEvent.press(screen.getByTestId("setup-no-pin"))
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() =>
        expect(errorText()).toBe(LL.FlashcardV2.setUpReadBackMismatch()),
      )
      expect(order).not.toContain("43")
      expect(card.owner()).toBeUndefined()
      expect(mockSaveOwnerKey).not.toHaveBeenCalled()
      expect(screen.getByTestId("setup-close")).toBeTruthy()
      expect(disk?.setups?.[card.pubkey]).toMatchObject({
        status: "mismatched",
        mismatch: ["unit"],
      })

      restart(unmount, { recordSet: true })
      order.length = 0
      renderPlain()
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpMismatchStored()))
      expect(screen.getByTestId("setup-close")).toBeTruthy()
      expect(order).toEqual([])
    })

    it("the happy path asks for nothing more: one tap press, and the record is set-up", async () => {
      await renderScreen()
      fireEvent.press(screen.getByTestId("setup-no-pin"))
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      // Before SET_CARD, before SET_OWNER, and the set-up record after.
      expect(mockFlushPersisted).toHaveBeenCalledTimes(3)
      expect(disk?.setups?.[card.pubkey]).toMatchObject({
        status: "set-up",
        heldByCard: { mint: "https://mint.test" },
      })
    })

    it("a record that does not reach disk writes nothing to the card, and says to try again", async () => {
      const { PersistWriteError } = jest.requireActual("@app/store/redux")
      mockFlushPersisted.mockRejectedValue(new PersistWriteError("write-failed"))
      await renderScreen()
      await chooseAndTap("2468")
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpFailed()))
      // The reads before any write, and nothing written.
      expect(order).toEqual(["1", "16"])
      expect(card.pin()).toBeUndefined()
      expect(screen.getByTestId("setup-tap")).toBeTruthy()
    })

    it("with no PIN, a tap cut after SET_CARD, then a restart: straight to the tap, the stored mint kept, and one tap finishes", async () => {
      const answer = losingAfter(0x32)
      const { unmount } = await renderScreen()
      fireEvent.press(screen.getByTestId("setup-no-pin"))
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(errorText()).toBe(LL.FlashcardV2.setUpUncertain()))

      card.transceive.mockImplementation(answer)
      restart(unmount, { recordSet: true })
      renderPlain()
      await waitFor(() =>
        expect(screen.getByTestId("setup-tap-note").props.children).toBe(
          LL.FlashcardV2.setUpResume(),
        ),
      )
      expect(screen.queryByTestId("setup-mint-change")).toBeNull()
      await act(async () => {
        fireEvent.press(screen.getByTestId("setup-tap"))
      })
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      expect(card.record()).toEqual({ set: true, mint: "https://mint.test" })
      expect(disk?.setups?.[card.pubkey]?.status).toBe("set-up")
    })
  })

  it("a cancelled sheet is no error, and nothing was written", async () => {
    mockRunResult = async () => {
      throw new NfcError.UserCancel()
    }
    await renderScreen()
    fireEvent.press(screen.getByTestId("setup-no-pin"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    expect(screen.queryByTestId("setup-error")).toBeNull()
    expect(screen.getByTestId("setup-tap")).toBeTruthy()
  })
})

// ENG-787: the mint a card is set up for.
describe("FlashcardV2SetupScreen: the card's mint", () => {
  const MINIBITS = "https://mint.minibits.cash/Bitcoin"
  let card: FakeCard

  beforeEach(() => {
    jest.clearAllMocks()
    card = createFakeCard(128, { owner: null, sealed: true, version: V22 })
    mockCard = cashuCardState({
      pubkey: card.pubkey,
      hasOwner: false,
      recordSet: false,
      record: cardRecord({ recordSet: false, mint: "" }),
      pinState: "unset",
      unspent: 0,
      balance: 0,
      ownerKeySource: undefined,
    })
    mockRunResult = runOn(card)
    mockOwnerKeyFor.mockResolvedValue(undefined)
    mockNewOwnerKey.mockResolvedValue(SEED_KEY)
    mockSaveOwnerKey.mockResolvedValue(undefined)
    mockRefreshTipHeader.mockResolvedValue(undefined)
    mockFetchKeysetUnits.mockResolvedValue({ "00aabbccddeeff00": "sat" })
  })

  const tapNoPin = async () => {
    fireEvent.press(screen.getByTestId("setup-no-pin"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-tap"))
    })
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled())
  }
  const choose = (testID: string) => fireEvent.press(screen.getByTestId(testID))
  const next = async () => {
    await act(async () => {
      fireEvent.press(screen.getByTestId("setup-mint-next"))
    })
  }
  const nextDisabled = () =>
    screen.getByTestId("setup-mint-next").props.accessibilityState?.disabled

  it("names the app's mint with one Change link, and writes it with no added press", async () => {
    await renderScreen()
    expect(screen.getByTestId("setup-mint-row").props.children).toBe(
      LL.FlashcardV2.setUpMintRow({ mint: isolatedMintName("https://mint.test") }),
    )
    expect(screen.getByTestId("setup-mint-change")).toBeTruthy()
    await tapNoPin()
    expect(card.record()).toEqual({ set: true, mint: "https://mint.test" })
    expect(mockFetchKeysetUnits).not.toHaveBeenCalled()
  })

  it("a card whose record already names a mint keeps it: no Change, and SET_CARD writes that mint again", async () => {
    mockCard = {
      ...(mockCard as CashuCardState),
      recordSet: true,
      record: cardRecord({ mint: `${MINIBITS}/` }),
    }
    await renderScreen()
    expect(screen.queryByTestId("setup-mint-change")).toBeNull()
    expect(screen.getByTestId("setup-mint-row").props.children).toBe(
      LL.FlashcardV2.setUpMintRow({ mint: isolatedMintName(MINIBITS) }),
    )
    await tapNoPin()
    expect(card.record()).toEqual({ set: true, mint: MINIBITS })
  })

  it("Change lists the mints, says which Flash can't fund, and SET_CARD writes the one chosen", async () => {
    await renderScreen()
    choose("setup-mint-change")
    expect(screen.getByTestId("setup-mint-title").props.children).toBe(
      LL.FlashcardV2.setUpMintTitle(),
    )
    expect(screen.getByText(LL.FlashcardV2.setUpMintIntro())).toBeTruthy()
    // The app's own mint is chosen to start with, and says so to a screen reader.
    expect(
      screen.getByTestId("setup-mint-option-mint.test").props.accessibilityState,
    ).toEqual({ checked: true })
    // Minibits, Macadamia and Cuba are off the fund list: each says so once.
    expect(screen.getAllByText(LL.FlashcardV2.setUpMintReadOnly())).toHaveLength(3)
    // The test's card mint is not forge, so even it carries the notice: once.
    expect(screen.getAllByTestId("setup-mint-choice-notice")).toHaveLength(1)
    expect(screen.getByTestId("setup-mint-choice-notice").props.children).toBe(
      LL.FlashcardV2.setUpMintNotice({ mint: isolatedMintName("https://mint.test") }),
    )

    choose("setup-mint-option-Minibits")
    expect(
      screen.getByTestId("setup-mint-option-Minibits").props.accessibilityState,
    ).toEqual({ checked: true })
    expect(screen.getByTestId("setup-mint-choice-notice").props.children).toBe(
      LL.FlashcardV2.setUpMintNotice({ mint: isolatedMintName(MINIBITS) }),
    )
    await next()

    expect(screen.getByTestId("setup-mint-row").props.children).toBe(
      LL.FlashcardV2.setUpMintRow({ mint: isolatedMintName(MINIBITS) }),
    )
    await tapNoPin()
    expect(card.record()).toEqual({ set: true, mint: MINIBITS })
    // A listed mint is taken as listed: nothing asked of it.
    expect(mockFetchKeysetUnits).not.toHaveBeenCalled()
  })

  it("choosing Flash (forge) carries no notice", async () => {
    await renderScreen()
    choose("setup-mint-change")
    choose("setup-mint-option-Flash")
    expect(screen.queryByTestId("setup-mint-choice-notice")).toBeNull()
    await next()
    await tapNoPin()
    expect(card.record()).toEqual({ set: true, mint: "https://forge.flashapp.me" })
  })

  it("Back changes nothing", async () => {
    await renderScreen()
    choose("setup-mint-change")
    choose("setup-mint-option-Minibits")
    choose("setup-mint-back")
    expect(screen.getByTestId("setup-mint-row").props.children).toBe(
      LL.FlashcardV2.setUpMintRow({ mint: isolatedMintName("https://mint.test") }),
    )
  })

  it("a written-in address: Continue waits for one a card can hold, and the field says why", async () => {
    await renderScreen()
    choose("setup-mint-change")
    choose("setup-mint-option-other")
    const field = screen.getByTestId("setup-mint-address")
    expect(field.props.value).toBe("https://")
    expect(field.props.autoCorrect).toBe(false)
    expect(field.props.autoCapitalize).toBe("none")
    expect(nextDisabled()).toBe(true)

    fireEvent.changeText(field, "https://mint.example/?q=1")
    fireEvent(field, "blur")
    expect(nextDisabled()).toBe(true)
    expect(screen.getByTestId("setup-mint-error").props.children).toBe(
      LL.FlashcardV2.setUpMintInvalid(),
    )

    fireEvent.changeText(field, `https://${"a".repeat(70)}.example`)
    fireEvent(field, "blur")
    expect(nextDisabled()).toBe(true)
    expect(screen.getByTestId("setup-mint-error").props.children).toBe(
      LL.FlashcardV2.setUpMintTooLong(),
    )
  })

  it("an address no mint answers at stays on the step, says so, and writes nothing", async () => {
    mockFetchKeysetUnits.mockRejectedValue(new Error("Network Error"))
    await renderScreen()
    choose("setup-mint-change")
    choose("setup-mint-option-other")
    fireEvent.changeText(screen.getByTestId("setup-mint-address"), "https://mnit.example")
    // Off the fund list, and not Flash's: said under the field, before Continue.
    expect(screen.getByTestId("setup-mint-address-read-only").props.children).toBe(
      LL.FlashcardV2.setUpMintReadOnly(),
    )
    expect(screen.getByTestId("setup-mint-address-notice").props.children).toBe(
      LL.FlashcardV2.setUpMintNotice({ mint: isolatedMintName("https://mnit.example") }),
    )
    await next()
    expect(mockFetchKeysetUnits).toHaveBeenCalledWith("https://mnit.example")
    expect(screen.getByTestId("setup-mint-error").props.children).toBe(
      LL.FlashcardV2.setUpMintNoAnswer(),
    )
    expect(screen.getByTestId("setup-mint-title")).toBeTruthy()
  })

  it("so does a mint that lists no sat keyset", async () => {
    mockFetchKeysetUnits.mockResolvedValue({ "00aabbccddeeff00": "usd" })
    await renderScreen()
    choose("setup-mint-change")
    choose("setup-mint-option-other")
    fireEvent.changeText(screen.getByTestId("setup-mint-address"), "https://usd.example")
    await next()
    expect(screen.getByTestId("setup-mint-error").props.children).toBe(
      LL.FlashcardV2.setUpMintNoAnswer(),
    )
  })

  it("an address that answers as a mint is written, as normalized", async () => {
    await renderScreen()
    choose("setup-mint-change")
    choose("setup-mint-option-other")
    fireEvent.changeText(
      screen.getByTestId("setup-mint-address"),
      "https://Mint.Example/Sats/",
    )
    await next()
    expect(mockFetchKeysetUnits).toHaveBeenCalledWith("https://mint.example/Sats")
    expect(screen.getByTestId("setup-mint-row").props.children).toBe(
      LL.FlashcardV2.setUpMintRow({
        mint: isolatedMintName("https://mint.example/Sats"),
      }),
    )
    expect(screen.getByTestId("setup-mint-row").props.children).toContain("mint.example")
    await tapNoPin()
    expect(card.record()).toEqual({ set: true, mint: "https://mint.example/Sats" })
  })
})
