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
import { NfcError } from "react-native-nfc-manager"

import type { CardOperationOptions, CashuCardState } from "../../app/contexts/Flashcard"
import appTheme from "../../app/rne-theme/theme"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { FlashcardV2SetupScreen } from "../../app/screens/card-screen/flashcard-v2-setup"
import { Transceiver } from "../../app/utils/cashu-card"
import { ownerPublicKey } from "../../app/utils/cashu-card-owner"
import { FAKE_OWNER_KEY, FakeCard, createFakeCard } from "../helpers/fake-cashu"
import { cashuCardState } from "../helpers/cashu-card-state"
import { HEADER_VECTORS, headerBytes } from "../helpers/block-headers"

loadLocale("en")
const LL = i18nObject("en")

const mockGoBack = jest.fn()
const mockToast = jest.fn()
const mockNewOwnerKey = jest.fn()
const mockOwnerKeyFor = jest.fn()
const mockSaveOwnerKey = jest.fn()
const mockRefreshTipHeader = jest.fn()
let mockCard: CashuCardState | undefined
let capturedOptions: CardOperationOptions | undefined
let mockRunResult: (op: (t: Transceiver) => Promise<unknown>) => Promise<unknown>

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
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: (...args: unknown[]) => mockRefreshTipHeader(...args),
}))
jest.mock("@app/utils/cashu-card-owner-store", () => ({
  ...jest.requireActual("@app/utils/cashu-card-owner-store"),
  newOwnerKey: (...args: unknown[]) => mockNewOwnerKey(...args),
  ownerKeyFor: (...args: unknown[]) => mockOwnerKeyFor(...args),
  saveOwnerKey: (...args: unknown[]) => mockSaveOwnerKey(...args),
}))
jest.mock("@app/hooks", () => ({
  useFlashcard: () => ({
    cashuCard: mockCard,
    runCardOperation: async (
      op: (t: Transceiver) => Promise<unknown>,
      _pubkey: string,
      options?: CardOperationOptions,
    ) => {
      capturedOptions = options
      return mockRunResult(op)
    },
  }),
}))

const SEED_KEY = { privateKey: FAKE_OWNER_KEY, source: "seed", saved: false }
const hex = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("")

const renderScreen = async () => {
  render(
    <ThemeProvider
      theme={createTheme({
        mode: "light",
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      <FlashcardV2SetupScreen />
    </ThemeProvider>,
  )
  await waitFor(() => expect(screen.getByTestId("setup-intro")).toBeTruthy())
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

  beforeEach(() => {
    jest.clearAllMocks()
    capturedOptions = undefined
    order = []
    card = createFakeCard(128, { owner: null, sealed: true })
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
    mockRunResult = (op) => op(card.transceive)
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
    expect(order).toEqual(["1", "44", "41", "44", "40", "32", "saved", "43"])
    expect(mockSaveOwnerKey).toHaveBeenCalledWith(card.pubkey, SEED_KEY)
    expect(card.owner()).toBe(hex(ownerPublicKey(FAKE_OWNER_KEY)))
    expect(card.pin()).toBe("2468")
    expect(card.record()).toEqual({ set: true, mint: "https://mint.test" })
    expect(card.now()).toBe(HEADER_VECTORS[2].time)
    expect(capturedOptions).toEqual({
      assume: { hasOwner: true, recordSet: true, pinState: "set" },
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
    expect(order).toEqual(["1", "32", "saved", "43"])
    expect(card.pin()).toBeUndefined()
    expect(capturedOptions?.assume).toEqual({ hasOwner: true, recordSet: true })
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

  it("an open card that has a PIN from before must be given a new one: no Continue without a PIN", async () => {
    mockCard = { ...(mockCard as CashuCardState), pinState: "set" }
    await renderScreen()
    expect(screen.getByText(LL.FlashcardV2.setUpPinRequired())).toBeTruthy()
    expect(screen.queryByTestId("setup-no-pin")).toBeNull()
  })

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
    expect(card.ins()).toEqual([0x01, 0x44, 0x45])
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: LL.FlashcardV2.setUpAlreadyMine() }),
    )
  })

  it("resumes with the key saved for the card, not a new one", async () => {
    const saved = { privateKey: "33".repeat(32), source: "device", saved: true }
    mockOwnerKeyFor.mockResolvedValue(saved)
    await renderScreen()
    expect(mockNewOwnerKey).not.toHaveBeenCalled()
    expect(screen.getByTestId("setup-key-device")).toBeTruthy()
  })

  it("a card another phone already owns says so and ends the setup: nothing is written", async () => {
    card = createFakeCard(128, { owner: "11".repeat(32) })
    mockRunResult = (op) => op(card.transceive)
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
    expect(order).toEqual(["1"])
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
