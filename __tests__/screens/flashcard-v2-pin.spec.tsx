/**
 * ENG-616, ENG-675: the set / change PIN screen, card protocol 2.0. The PINs
 * are typed on the pad, the two entries must match, and everything the card
 * does with them happens inside one tap. On a card this phone owns there is
 * no current-PIN step: the owner's CHANGE_PIN sets the PIN with no old one
 * (and unblocks a blocked one), and a card with no PIN gets one under the
 * owner's grant (ALLOW_LOAD, then SET_PIN). The PIN goes sealed to a card that
 * takes it so. The PIN never leaves the screen: nothing is stored, and no
 * message carries the digits. A tap that fails before the PIN write keeps
 * the PINs typed, and one lost after it is settled by tapping again.
 *
 * Remove PIN (0.x CLEAR_PIN, ENG-633) is gone with 0.x: a 2.0 card's PIN is
 * changed, never removed, and its tests are replaced here by the owner's.
 */
import * as React from "react"
import { AccessibilityInfo } from "react-native"
import { NfcError } from "react-native-nfc-manager"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import type { CardOperationOptions, CashuCardState } from "../../app/contexts/Flashcard"
import appTheme from "../../app/rne-theme/theme"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { FlashcardV2PinScreen } from "../../app/screens/card-screen/flashcard-v2-pin"
import {
  AppletNotSelectedError,
  CardError,
  CardNeedsUpdateError,
  Transceiver,
  WrongCardError,
} from "../../app/utils/cashu-card"
import { FAKE_OWNER_KEY, FakeCard, createFakeCard } from "../helpers/fake-cashu"
import { cashuCardState } from "../helpers/cashu-card-state"

loadLocale("en")
const LL = i18nObject("en")

const mockGoBack = jest.fn()
const mockToast = jest.fn()
const mockOwnerKeyFor = jest.fn()
const mockSaveOwnerKey = jest.fn()
let mockMode: "set" | "change" = "change"
let mockCard: CashuCardState
// Captures the operation the screen hands the provider.
let capturedOp: ((t: Transceiver) => Promise<void>) | undefined
let capturedPubkey: string | undefined
let capturedOptions: CardOperationOptions | undefined
// What the provider does with the op: nothing (success) unless a spec says.
let mockRunResult: (
  op: (t: Transceiver) => Promise<void>,
) => Promise<void> = async () => {}

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { mode: mockMode } }),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/utils/toast", () => ({
  toastShow: (...args: unknown[]) => mockToast(...args),
}))
jest.mock("@app/utils/cashu-card-owner-store", () => ({
  ...jest.requireActual("@app/utils/cashu-card-owner-store"),
  ownerKeyFor: (...args: unknown[]) => mockOwnerKeyFor(...args),
  saveOwnerKey: (...args: unknown[]) => mockSaveOwnerKey(...args),
}))
jest.mock("@app/hooks", () => ({
  useFlashcard: () => ({
    cashuCard: mockCard,
    runCardOperation: async (
      op: (t: Transceiver) => Promise<void>,
      pubkey: string,
      options?: CardOperationOptions,
    ) => {
      capturedOp = op
      capturedPubkey = pubkey
      capturedOptions = options
      await mockRunResult(op)
    },
  }),
}))

const OWNER = { privateKey: FAKE_OWNER_KEY, source: "seed", saved: true }

const renderScreen = () =>
  render(
    <ThemeProvider
      theme={createTheme({
        mode: "light",
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      <FlashcardV2PinScreen />
    </ThemeProvider>,
  )

const type = (digits: string) => {
  for (const d of digits) fireEvent.press(screen.getByTestId(`pin-${d}`))
}
const next = () => fireEvent.press(screen.getByText("Continue"))
const title = () => screen.getByTestId("pin-step-title").props.children
const pinError = () => screen.getByTestId("pin-error").props.children
const announce = AccessibilityInfo.announceForAccessibility as jest.Mock

/** Types the new PIN and its confirmation, and taps. */
const enterAndTap = async (pin = "5678", confirm = pin) => {
  type(pin)
  next()
  type(confirm)
  await act(async () => {
    next()
  })
}

/** A provider whose tap reaches `card` and runs the screen's operation against it. */
const tapReaching = (card: FakeCard) => async (op: (t: Transceiver) => Promise<void>) => {
  await op(card.transceive)
}

/** The tap lost, with `lost` thrown, when the command `ins` goes out to `card`. */
const cutShortAt = (
  card: FakeCard,
  ins: number,
  lost: Error = new Error("Tag was lost"),
) =>
  tapReaching({
    ...card,
    transceive: jest.fn(async (apdu: number[]) => {
      if (apdu[1] === ins) {
        // The card took it; its answer never came back.
        await card.transceive(apdu)
        throw lost
      }
      return card.transceive(apdu)
    }) as FakeCard["transceive"],
  })

/**
 * The flow ends on this screen: the whole message in the status area, no pad
 * to type on, and the card screen only once the holder presses Close.
 */
const expectFlowEnded = async (message: string) => {
  await waitFor(() => expect(pinError()).toBe(message))
  expect(mockToast).not.toHaveBeenCalled()
  expect(screen.queryByTestId("pin-1")).toBeNull()
  expect(screen.queryByText("Continue")).toBeNull()
  expect(mockGoBack).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText("Close"))
  expect(mockGoBack).toHaveBeenCalledTimes(1)
}

describe("FlashcardV2PinScreen", () => {
  let card: FakeCard

  beforeEach(() => {
    jest.clearAllMocks()
    capturedOp = undefined
    capturedPubkey = undefined
    capturedOptions = undefined
    mockMode = "change"
    card = createFakeCard(128, { pin: "1234", sealed: true })
    mockCard = cashuCardState({ pubkey: card.pubkey, pinState: "set" })
    mockRunResult = tapReaching(card)
    mockOwnerKeyFor.mockResolvedValue(OWNER)
    mockSaveOwnerKey.mockResolvedValue(undefined)
  })

  it("change: no current PIN, new and confirm, then the owner's CHANGE_PIN in one tap, sealed", async () => {
    renderScreen()

    expect(title()).toBe("New PIN")
    expect(screen.getByTestId("pin-warning").props.children).toBe(
      LL.FlashcardV2.changePinBody(),
    )
    type("5678")
    next()
    expect(title()).toBe("Confirm new PIN")
    type("5678")
    await act(async () => {
      next()
    })

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(capturedPubkey).toBe(card.pubkey)
    // GET_INFO, the PIN key (GET_NONCE P1 = 1), then CHANGE_PIN sealed (P1 = 1).
    expect(card.ins()).toEqual([0x01, 0x44, 0x42])
    const change = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x42)
    expect(change?.[2]).toBe(0x01)
    expect(card.pin()).toBe("5678")
    // A 9000 to CHANGE_PIN proves a PIN is set and unblocked, even if the re-read is lost.
    expect(capturedOptions?.assume).toEqual({ pinState: "set", tries: 3 })
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }))
    expect(announce).toHaveBeenCalledWith(LL.FlashcardV2.pinChanged())
    // The confirmation says what happened, and nothing about the PIN.
    expect(JSON.stringify(mockToast.mock.calls)).not.toContain("5678")
  })

  it("change unblocks a blocked PIN: the owner needs no old PIN, and the tries are back", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await card.transceive([0xb0, 0x40, 0x00, 0x00, 0x04, 0x30, 0x30, 0x30, 0x30])
    }
    expect(card.triesLeft()).toBe(0)
    mockCard = cashuCardState({ pubkey: card.pubkey, pinState: "blocked" })
    renderScreen()

    await enterAndTap("8642")

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.pin()).toBe("8642")
    expect(card.triesLeft()).toBe(3)
  })

  it("change in the clear on a card that does not take its PIN sealed", async () => {
    card = createFakeCard(128, { pin: "1234", sealed: false })
    mockCard = cashuCardState({ pubkey: card.pubkey, sealed: false })
    mockRunResult = tapReaching(card)
    renderScreen()

    await enterAndTap()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    // GET_INFO, GET_NONCE (the owner's), CHANGE_PIN with P1 = 0.
    expect(card.ins()).toEqual([0x01, 0x44, 0x42])
    const change = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x42)
    expect(change?.[2]).toBe(0x00)
    expect(card.pin()).toBe("5678")
  })

  it("set, on a card this phone owns with no PIN: ALLOW_LOAD, then SET_PIN under the grant, with the warning shown", async () => {
    mockMode = "set"
    card = createFakeCard(128, { sealed: true })
    mockCard = cashuCardState({ pubkey: card.pubkey, pinState: "unset" })
    mockRunResult = tapReaching(card)
    renderScreen()

    expect(title()).toBe("New PIN")
    expect(screen.getByTestId("pin-warning").props.children).toBe(
      LL.FlashcardV2.setPinWarning(),
    )
    await enterAndTap("2468")

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    // GET_INFO, GET_NONCE + ALLOW_LOAD (the grant), GET_NONCE P1 = 1 + SET_PIN sealed.
    expect(card.ins()).toEqual([0x01, 0x44, 0x45, 0x44, 0x41])
    expect(card.pin()).toBe("2468")
    expect(announce).toHaveBeenCalledWith(LL.FlashcardV2.pinSet())
    // A seed-derived key the card took is saved for next time.
    expect(mockSaveOwnerKey).toHaveBeenCalledWith(card.pubkey, OWNER)
  })

  it("set, on an open card (no owner): SET_PIN alone, and no owner key is asked for", async () => {
    mockMode = "set"
    card = createFakeCard(128, { owner: null, sealed: false })
    mockCard = cashuCardState({
      pubkey: card.pubkey,
      pinState: "unset",
      hasOwner: false,
      ownerKeySource: undefined,
    })
    mockRunResult = tapReaching(card)
    renderScreen()

    await enterAndTap("2468")

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.ins()).toEqual([0x01, 0x41])
    expect(card.pin()).toBe("2468")
    expect(mockOwnerKeyFor).not.toHaveBeenCalled()
  })

  it("set, on a card whose PIN an earlier cut-short tap already wrote: the owner's CHANGE_PIN writes the PIN typed", async () => {
    mockMode = "set"
    card = createFakeCard(128, { pin: "9999", sealed: true })
    mockCard = cashuCardState({ pubkey: card.pubkey, pinState: "unset" })
    mockRunResult = tapReaching(card)
    renderScreen()

    await enterAndTap("2468")

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.ins()).toEqual([0x01, 0x44, 0x42])
    expect(card.pin()).toBe("2468")
  })

  it("will not continue on fewer than 4 digits", () => {
    renderScreen()
    type("123")
    next()
    expect(title()).toBe("New PIN")
  })

  it("a mismatched confirmation goes back to the new PIN and taps nothing", async () => {
    renderScreen()
    await enterAndTap("5678", "5679")
    expect(title()).toBe("New PIN")
    expect(pinError()).toBe(LL.FlashcardV2.pinMismatch())
    expect(capturedOp).toBeUndefined()
  })

  it("a phone that holds no key for the card says so, and writes nothing", async () => {
    mockOwnerKeyFor.mockResolvedValue(undefined)
    renderScreen()

    await enterAndTap()

    await expectFlowEnded(LL.FlashcardV2.notOwner())
    expect(card.ins()).toEqual([0x01])
    expect(card.pin()).toBe("1234")
  })

  it("a card that refuses this phone's proof (6A91: another phone owns it) says so, and the PIN stays", async () => {
    mockOwnerKeyFor.mockResolvedValue({ ...OWNER, privateKey: "11".repeat(32) })
    renderScreen()

    await enterAndTap()

    await expectFlowEnded(LL.FlashcardV2.notOwner())
    expect(card.pin()).toBe("1234")
  })

  const refusals: [string, number, string][] = [
    ["a card with no owner (6A90)", 0x6a90, LL.FlashcardV2.noOwner()],
    ["a card locked against writes (6986)", 0x6986, LL.FlashcardV2.cardLocked()],
  ]
  refusals.forEach(([name, sw, message]) => {
    it(`${name}: says so in plain words and ends the flow`, async () => {
      mockRunResult = async () => {
        throw new CardError(sw, "CHANGE_PIN")
      }
      renderScreen()
      await enterAndTap()
      await expectFlowEnded(message)
    })
  })

  it("a card that needs an update says so and ends the flow", async () => {
    mockRunResult = async () => {
      throw new CardNeedsUpdateError("0.x")
    }
    renderScreen()
    await enterAndTap()
    await expectFlowEnded(LL.FlashcardV2.needsUpdateBody())
  })

  const keepsPins: [string, Error, string][] = [
    ["a different card", new WrongCardError("03ff"), LL.FlashcardV2.wrongCard()],
    [
      "a tag without the applet",
      new AppletNotSelectedError(0x6a82, 0x6a82),
      LL.FlashcardV2.notCashuCard(),
    ],
  ]
  keepsPins.forEach(([name, error, message]) => {
    it(`${name}: says so, and keeps the PINs typed (only the confirmation to retype)`, async () => {
      mockRunResult = async () => {
        throw error
      }
      renderScreen()
      await enterAndTap()
      await waitFor(() => expect(pinError()).toBe(message))
      expect(title()).toBe("Confirm new PIN")
    })
  })

  it("an unexpected refusal's status word goes to the log, not the screen", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    mockRunResult = async () => {
      throw new CardError(0x6f00, "CHANGE_PIN")
    }
    renderScreen()
    await enterAndTap()
    await waitFor(() => expect(pinError()).toBe(LL.FlashcardV2.cardRefused()))
    expect(warn).toHaveBeenCalledWith("Cashu card refused CHANGE_PIN: CardError 6F00")
    expect(pinError()).not.toContain("6F00")
    warn.mockRestore()
  })

  it("a cancelled sheet before the PIN write is no error: the confirmation is all there is to retype", async () => {
    mockRunResult = async () => {
      throw new NfcError.UserCancel()
    }
    renderScreen()
    await enterAndTap()
    await waitFor(() => expect(title()).toBe("Confirm new PIN"))
    expect(screen.queryByTestId("pin-error")).toBeNull()
  })

  it("a tap lost before the PIN write went out is a lost card, and keeps the PINs", async () => {
    mockRunResult = cutShortAt(card, 0x01)
    renderScreen()
    await enterAndTap()
    await waitFor(() => expect(pinError()).toBe(LL.FlashcardV2.cardNotFound()))
    expect(title()).toBe("Confirm new PIN")
    expect(card.pin()).toBe("1234")
  })

  it("a tap lost once CHANGE_PIN went out says to tap again, keeps the PINs, and the retry settles it", async () => {
    mockRunResult = cutShortAt(card, 0x42)
    renderScreen()
    await enterAndTap()
    await waitFor(() => expect(pinError()).toBe(LL.FlashcardV2.pinChangeUncertain()))
    expect(title()).toBe("Confirm new PIN")
    // The card took it before the answer was lost.
    expect(card.pin()).toBe("5678")

    // Tapping again with the same PIN: the owner's CHANGE_PIN leaves the card
    // with the PIN it carries, whatever it held.
    mockRunResult = tapReaching(card)
    type("5678")
    await act(async () => {
      next()
    })
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.pin()).toBe("5678")
  })

  it("a tap lost once SET_PIN went out says the card may already use the PIN, and keeps it", async () => {
    mockMode = "set"
    card = createFakeCard(128, { sealed: true })
    mockCard = cashuCardState({ pubkey: card.pubkey, pinState: "unset" })
    mockRunResult = cutShortAt(card, 0x41)
    renderScreen()
    await enterAndTap("2468")
    await waitFor(() => expect(pinError()).toBe(LL.FlashcardV2.pinSetUncertain()))
    expect(title()).toBe("Confirm new PIN")
  })

  it("a cancel that cuts off the PIN write is a lost answer, not a quiet cancel", async () => {
    mockRunResult = cutShortAt(card, 0x42, new NfcError.UserCancel())
    renderScreen()
    await enterAndTap()
    await waitFor(() => expect(pinError()).toBe(LL.FlashcardV2.pinChangeUncertain()))
  })

  it("no message on screen or in a toast ever carries the PIN", async () => {
    mockRunResult = async () => {
      throw new CardError(0x6a91, "CHANGE_PIN")
    }
    renderScreen()
    await enterAndTap("97531")
    await waitFor(() => expect(screen.getByTestId("pin-error")).toBeTruthy())
    expect(pinError()).not.toContain("97531")
    expect(JSON.stringify(mockToast.mock.calls)).not.toContain("97531")
  })

  it("screen readers hear the words, not the test ids", async () => {
    mockRunResult = async () => {
      throw new CardError(0x6f00, "CHANGE_PIN")
    }
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    renderScreen()
    type("123")

    expect(screen.getByTestId("pin-step-title").props.accessibilityLabel).toBeUndefined()
    expect(screen.getByTestId("pin-step-title").props.accessibilityRole).toBe("header")
    expect(screen.getByTestId("pin-entry").props.accessibilityLabel).toBe(
      "Digits entered: 3",
    )
    const keys: [string, string][] = [
      ["pin-1", "1"],
      ["pin-0", "0"],
      ["pin-clear", "Clear"],
      ["pin-backspace", "Delete"],
    ]
    keys.forEach(([id, label]) => {
      const key = screen.getByTestId(id)
      expect(key.props.accessibilityRole).toBe("button")
      expect(key.props.accessibilityLabel).toBe(label)
    })

    type("4")
    next()
    type("1234")
    await act(async () => {
      next()
    })

    await waitFor(() => expect(screen.getByTestId("pin-error")).toBeTruthy())
    const error = screen.getByTestId("pin-error")
    expect(error.props.accessibilityLabel).toBeUndefined()
    // TalkBack reads the status area as it changes; VoiceOver is told.
    expect(screen.getByTestId("pin-status").props.accessibilityLiveRegion).toBe("polite")
    expect(announce).toHaveBeenCalledWith(error.props.children)
    warn.mockRestore()
  })
})
