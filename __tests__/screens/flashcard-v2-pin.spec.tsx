/**
 * ENG-616: the set / change PIN screen. The PINs are typed on the pad, the
 * two new entries must match, and everything the card does with them happens
 * inside one tap — VERIFY then CHANGE, or SET alone. The PIN never leaves the
 * screen: nothing is stored, and no message carries the digits. What a
 * blocked PIN does depends on the card's firmware (ENG-615), and the copy
 * says which. A tap that fails before any PIN reaches the card keeps the PINs
 * typed, and a tap lost after SET_PIN went out is settled by the next one.
 *
 * ENG-633: the same screen removes the PIN on a card that answers CLEAR_PIN
 * (applet 0.5): the current PIN, a confirmation that says what a card with no
 * PIN is, then VERIFY then CLEAR in one tap.
 */
import * as React from "react"
import { AccessibilityInfo } from "react-native"
import { NfcError } from "react-native-nfc-manager"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import type { CardOperationOptions } from "../../app/contexts/Flashcard"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import { FlashcardV2PinScreen } from "../../app/screens/card-screen/flashcard-v2-pin"
import {
  AppletNotSelectedError,
  CardError,
  CardInfo,
  WrongCardError,
  Transceiver,
} from "../../app/utils/cashu-card"
import { createFakeCard } from "../helpers/fake-cashu"

loadLocale("en")

const PUBKEY = "02" + "ab".repeat(32)
const mockGoBack = jest.fn()
const mockToast = jest.fn()
// Whether this card's firmware freezes a blocked card (true) or, like v0.2.0,
// switches the PIN check off (false). No shipped version freezes yet, so the
// freezing branch is reached through the mock.
let mockBlockFreezes = false
let mockMode: "set" | "change" | "remove" = "change"
let mockPinState: "unset" | "set" = "set"
// Whether the card on screen answers CLEAR_PIN (GET_INFO capability bit 3).
let mockClearPin = false
// Captures the operation the screen hands the provider, so a spec can run it
// against a scripted card and see the exact APDUs.
let capturedOp: ((t: Transceiver) => Promise<void>) | undefined
let capturedPubkey: string | undefined
let capturedOptions: CardOperationOptions | undefined
// What the provider does with the op: nothing (success) unless a spec says.
let mockRunResult: (
  op: (t: Transceiver) => Promise<void>,
  options?: CardOperationOptions,
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
jest.mock("@app/utils/cashu-card", () => ({
  ...jest.requireActual("@app/utils/cashu-card"),
  blockedPinGatesSpend: () => mockBlockFreezes,
}))
jest.mock("@app/utils/toast", () => ({
  toastShow: (...args: unknown[]) => mockToast(...args),
}))
jest.mock("@app/hooks", () => ({
  useFlashcard: () => ({
    cashuCard: {
      pubkey: PUBKEY,
      pinState: mockPinState,
      balance: 0,
      version: "0.2",
      clearPin: mockClearPin,
    },
    runCardOperation: async (
      op: (t: Transceiver) => Promise<void>,
      pubkey: string,
      options?: CardOperationOptions,
    ) => {
      capturedOp = op
      capturedPubkey = pubkey
      capturedOptions = options
      await mockRunResult(op, options)
    },
  }),
}))

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

/** Runs the captured op against a recording card and returns the APDUs sent. */
const runCapturedOp = async (
  answer: (apdu: number[]) => number[] = () => [0x90, 0x00],
) => {
  const sent: number[][] = []
  await capturedOp?.(async (apdu) => {
    sent.push(apdu)
    return answer(apdu)
  })
  return sent
}

/** GET_INFO as the provider's re-read after a refusal would report it. */
const reread = (pinState: CardInfo["pinState"]): CardInfo => ({
  version: "0.2",
  maxSlots: 32,
  unspent: 1,
  spent: 7,
  empty: 24,
  secp256k1Native: true,
  schnorr: true,
  clearPin: false,
  pinState,
})

const VERIFY_1234 = [0xb0, 0x40, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34]
const CHANGE_1234_5678 = [
  0xb0, 0x42, 0x00, 0x00, 0x09, 0x04, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
]
const SET_2468 = [0xb0, 0x41, 0x00, 0x00, 0x04, 0x32, 0x34, 0x36, 0x38]
const SET_5678 = [0xb0, 0x41, 0x00, 0x00, 0x04, 0x35, 0x36, 0x37, 0x38]
const CLEAR_1234 = [0xb0, 0x43, 0x00, 0x00, 0x05, 0x04, 0x31, 0x32, 0x33, 0x34]
const INS_SET_PIN = 0x41
const INS_CHANGE_PIN = 0x42
const INS_CLEAR_PIN = 0x43
const OK = [0x90, 0x00]
const ALREADY_SET = [0x69, 0x85]

/**
 * A provider whose tap reaches the card on screen and runs the screen's
 * operation against it, as `runCardOperation` does once the card is
 * identified. `answer` is the card: it answers each APDU, or throws where the
 * tap is lost. Every APDU that goes out is pushed onto `sent`.
 */
const tapReaching =
  (answer: (apdu: number[]) => number[], sent: number[][] = []) =>
  async (op: (t: Transceiver) => Promise<void>) => {
    await op(async (apdu) => {
      sent.push(apdu)
      return answer(apdu)
    })
  }

/** A card that answers `sw` to the command `ins` and 9000 to anything else. */
const answering = (ins: number, sw: number[], sent?: number[][]) =>
  tapReaching((apdu) => (apdu[1] === ins ? sw : OK), sent)

/** A tap lost, with `lost` thrown, when the command `ins` goes out. */
const cutShortAt = (ins: number, lost: Error = new Error("Tag was lost")) =>
  tapReaching((apdu) => {
    if (apdu[1] === ins) throw lost
    return OK
  })

const SET_UNCERTAIN =
  "The tap was cut short while the card was saving the PIN. It may already use this PIN: confirm it and tap the card again to finish."
const CHANGE_UNCERTAIN =
  "The tap was cut short while the card was saving the new PIN. It may already use the new PIN: try the new one first."
const ALREADY_HAS_PIN = "This card already has a PIN. Change it instead."

/**
 * The last-try outcome ends the flow on this screen: the whole message in
 * the status area (a toast would cut it at two lines), no pad to type on, and
 * the card screen only once the holder presses Close.
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

const FROZEN =
  "The PIN has been entered wrong too many times. The card is blocked and must be replaced."
const OPEN =
  "The PIN has been entered wrong too many times, and on this card's software that switches the PIN check off: anyone holding the card can spend its balance. Move the value off it."

describe("FlashcardV2PinScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    capturedOp = undefined
    capturedPubkey = undefined
    capturedOptions = undefined
    mockRunResult = async () => {}
    mockMode = "change"
    mockPinState = "set"
    mockBlockFreezes = false
    mockClearPin = false
  })

  it("change: asks current, new, confirm, then verifies and changes in one tap", async () => {
    renderScreen()

    expect(title()).toBe("Current PIN")
    type("1234")
    next()
    expect(title()).toBe("New PIN")
    type("5678")
    next()
    expect(title()).toBe("Confirm new PIN")
    type("5678")
    await act(async () => {
      next()
    })

    await waitFor(() => expect(capturedOp).toBeDefined())
    expect(capturedPubkey).toBe(PUBKEY)
    // A 9000 to CHANGE_PIN proves a PIN is set even if the re-read is lost.
    expect(capturedOptions?.assume).toEqual({ pinState: "set" })
    const sent = await runCapturedOp()
    expect(sent).toEqual([VERIFY_1234, CHANGE_1234_5678])
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }))
    // A toast is not announced, so a screen reader hears the outcome directly.
    expect(announce).toHaveBeenCalledWith("PIN changed.")
    // The confirmation says what happened, and nothing about the PIN.
    const toasted = JSON.stringify(mockToast.mock.calls)
    expect(toasted).not.toContain("1234")
    expect(toasted).not.toContain("5678")
  })

  it("set: no current PIN step, SET_PIN alone, with the one-way warning shown", async () => {
    mockMode = "set"
    mockPinState = "unset"
    renderScreen()

    expect(title()).toBe("New PIN")
    // v0.2.0: the warning must not promise that three wrong entries freeze it.
    expect(screen.getByText(/never removed/)).toBeTruthy()
    expect(screen.getByText(/switch the PIN check off/)).toBeTruthy()
    expect(screen.queryByText(/block the card for good/)).toBeNull()
    type("2468")
    next()
    type("2468")
    await act(async () => {
      next()
    })

    // A 9000 to SET_PIN proves a PIN is set even if the re-read is lost, so
    // the card screen stops offering "Set PIN".
    expect(capturedOptions?.assume).toEqual({ pinState: "set" })
    const sent = await runCapturedOp()
    expect(sent).toEqual([[0xb0, 0x41, 0x00, 0x00, 0x04, 0x32, 0x34, 0x36, 0x38]])
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(announce).toHaveBeenCalledWith(
      "PIN set. The card now asks for it before it spends or loads.",
    )
  })

  it("set: on firmware that freezes a blocked card, the warning says so", () => {
    mockMode = "set"
    mockPinState = "unset"
    mockBlockFreezes = true
    renderScreen()

    expect(screen.getByText(/block the card for good/)).toBeTruthy()
    expect(screen.queryByText(/switch the PIN check off/)).toBeNull()
  })

  it("will not continue on fewer than 4 digits", () => {
    renderScreen()
    type("123")
    next()
    expect(title()).toBe("Current PIN")
  })

  it("a mismatched confirmation goes back to the new PIN and taps nothing", async () => {
    renderScreen()
    type("1234")
    next()
    type("5678")
    next()
    type("5679")
    next()

    expect(pinError()).toBe("The PINs don't match")
    expect(title()).toBe("New PIN")
    expect(capturedOp).toBeUndefined()
  })

  it("refuses a new PIN equal to the current one", () => {
    renderScreen()
    type("1234")
    next()
    type("1234")
    next()
    expect(pinError()).toBe("Choose a PIN different from the current one")
  })

  /** Change flow with current 1234 (or `current`), new and confirm 5678, then the tap. */
  const enterAndApply = async (current = "1234") => {
    renderScreen()
    type(current)
    next()
    type("5678")
    next()
    type("5678")
    await act(async () => {
      next()
    })
  }

  const firmwares = [
    {
      name: "v0.2.0 (a blocked PIN stops being checked)",
      freezes: false,
      wrong: "Wrong PIN. Tries left before the PIN check switches off: 2.",
      wrongOne: "Wrong PIN. Tries left before the PIN check switches off: 1.",
      blocked: OPEN,
    },
    {
      name: "firmware that freezes a blocked card",
      freezes: true,
      wrong: "Wrong PIN. Tries left before the card blocks: 2.",
      wrongOne: "Wrong PIN. Tries left before the card blocks: 1.",
      blocked: FROZEN,
    },
  ]

  firmwares.forEach(({ name, freezes, wrong, wrongOne, blocked }) => {
    describe(name, () => {
      beforeEach(() => {
        mockBlockFreezes = freezes
      })

      it("a wrong current PIN says how many tries are left and starts over", async () => {
        mockRunResult = async () => {
          throw new CardError(0x63c2, "VERIFY_PIN")
        }
        await enterAndApply("1111")

        await waitFor(() => expect(pinError()).toBe(wrong))
        expect(title()).toBe("Current PIN")
        expect(mockGoBack).not.toHaveBeenCalled()
      })

      it("one try left reads without a plural", async () => {
        mockRunResult = async () => {
          throw new CardError(0x63c1, "VERIFY_PIN")
        }
        await enterAndApply("1111")

        await waitFor(() => expect(pinError()).toBe(wrongOne))
      })

      it("6983 after a re-read that shows the PIN blocked: what a blocked PIN does on this firmware, and back to the card", async () => {
        mockRunResult = async (_op, options) => {
          options?.onReread?.(reread("blocked"))
          throw new CardError(0x6983, "VERIFY_PIN")
        }
        await enterAndApply("1111")

        await expectFlowEnded(blocked)
      })

      it("6983 with no re-read (the card left): what a blocked PIN does on this firmware", async () => {
        mockRunResult = async () => {
          throw new CardError(0x6983, "VERIFY_PIN")
        }
        await enterAndApply("1111")

        await expectFlowEnded(blocked)
      })

      // v0.2.0's frozen card: CHANGE_PIN spent the tries elsewhere and never
      // set pinState 2 (CashuApplet.java@v0.2.0:555-559), so VERIFY_PIN answers
      // 6983 while GET_INFO still says "set" and every spend is refused.
      it("6983 while the card still reports its PIN set: the card is frozen", async () => {
        mockRunResult = async (_op, options) => {
          options?.onReread?.(reread("set"))
          throw new CardError(0x6983, "VERIFY_PIN")
        }
        await enterAndApply("1111")

        await expectFlowEnded(FROZEN)
      })

      // 63C0 is only ever v0.2.0's CHANGE_PIN spending the last try, which
      // freezes the card rather than switching its PIN check off.
      it("63C0 says the card is blocked, whatever the firmware", async () => {
        mockRunResult = async () => {
          throw new CardError(0x63c0, "CHANGE_PIN")
        }
        await enterAndApply("1111")

        await expectFlowEnded(FROZEN)
      })
    })
  })

  it("the blocked copy never claims this tap spent the last try", async () => {
    mockRunResult = async (_op, options) => {
      options?.onReread?.(reread("blocked"))
      throw new CardError(0x6983, "VERIFY_PIN")
    }
    await enterAndApply("1111")

    await waitFor(() => expect(screen.getByText("Close")).toBeTruthy())
    expect(pinError()).not.toMatch(/last try/)
  })

  // Each failure the card or the tap can produce, and the words it gets. None
  // carries a status word or developer text, and each leaves the holder on
  // this screen to try again. A failure before any PIN reached the card
  // (thrown here before the operation runs, as the provider does) keeps the
  // PINs typed: only the confirmation is retyped. The rest start over.
  const failures = [
    {
      name: "a card that already has a PIN (6985)",
      mode: "set" as const,
      error: new CardError(0x6985, "SET_PIN"),
      text: ALREADY_HAS_PIN,
      keepsPins: false,
    },
    {
      name: "a tag without the Cashu applet (a BoltCard)",
      mode: "change" as const,
      error: new AppletNotSelectedError(0x6a82, 0x6a82),
      text: "That isn't a Cashu card. Tap the card this screen is showing.",
      keepsPins: true,
    },
    {
      name: "a card locked against writes (6986)",
      mode: "change" as const,
      error: new CardError(0x6986, "CHANGE_PIN"),
      text: "This card is locked against changes, so its PIN can't be set or changed.",
      keepsPins: false,
    },
    {
      name: "any other refusal",
      mode: "change" as const,
      error: new CardError(0x6f00, "CHANGE_PIN"),
      text: "The card refused the change. Try again.",
      keepsPins: false,
    },
    {
      name: "a different card",
      mode: "change" as const,
      error: new WrongCardError("03ff"),
      text: "That is a different card. Tap the card this screen is showing.",
      keepsPins: true,
    },
    {
      name: "a tap lost before any PIN command went out",
      mode: "change" as const,
      error: new Error("Tag was lost"),
      text: "No Cashu card found. Hold the card steady and try again.",
      keepsPins: true,
    },
    {
      name: "a tap lost before SET_PIN went out",
      mode: "set" as const,
      error: new Error("Tag was lost"),
      text: "No Cashu card found. Hold the card steady and try again.",
      keepsPins: true,
    },
  ]

  failures.forEach(({ name, mode, error, text, keepsPins }) => {
    const outcome = keepsPins ? "keeps the PINs typed" : "starts over"
    it(`${name}: says so in plain words and ${outcome}`, async () => {
      mockMode = mode
      mockPinState = mode === "set" ? "unset" : "set"
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
      mockRunResult = async () => {
        throw error
      }
      renderScreen()
      if (mode === "change") {
        type("1234")
        next()
      }
      type("5678")
      next()
      type("5678")
      await act(async () => {
        next()
      })

      await waitFor(() => expect(pinError()).toBe(text))
      const firstStep = mode === "set" ? "New PIN" : "Current PIN"
      expect(title()).toBe(keepsPins ? "Confirm new PIN" : firstStep)
      expect(pinError()).not.toMatch(/0x|6F00|6A82|6986|6985|failed/)
      expect(mockGoBack).not.toHaveBeenCalled()
      warn.mockRestore()
      if (!keepsPins) return

      // The PINs were kept: retype the confirmation and the next tap sends them.
      capturedOp = undefined
      mockRunResult = async () => {}
      type("5678")
      await act(async () => {
        next()
      })
      await waitFor(() => expect(capturedOp).toBeDefined())
      expect(await runCapturedOp()).toEqual(
        mode === "set" ? [SET_5678] : [VERIFY_1234, CHANGE_1234_5678],
      )
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    })
  })

  it("an unexpected refusal's status word goes to the log, not the screen", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    mockRunResult = async () => {
      throw new CardError(0x6f00, "CHANGE_PIN")
    }
    await enterAndApply()

    await waitFor(() =>
      expect(pinError()).toBe("The card refused the change. Try again."),
    )
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CHANGE_PIN.*CardError 6F00/))
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/1234|5678/)
    warn.mockRestore()
  })

  it("a cancelled sheet is no error: the confirmation is all there is to retype", async () => {
    mockRunResult = async () => {
      throw new NfcError.UserCancel()
    }
    await enterAndApply()

    await waitFor(() => expect(capturedOp).toBeDefined())
    expect(screen.queryByTestId("pin-error")).toBeNull()
    expect(title()).toBe("Confirm new PIN")
    expect(mockGoBack).not.toHaveBeenCalled()
    expect(mockToast).not.toHaveBeenCalled()

    // The current and new PINs were kept: retype the confirmation, tap again.
    capturedOp = undefined
    mockRunResult = async () => {}
    type("5678")
    await act(async () => {
      next()
    })
    await waitFor(() => expect(capturedOp).toBeDefined())
    expect(await runCapturedOp()).toEqual([VERIFY_1234, CHANGE_1234_5678])
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
  })

  it("a tap lost once CHANGE_PIN went out warns that the new PIN may already be in use", async () => {
    // VERIFY_PIN passes; the card leaves while answering CHANGE_PIN, which it
    // may already have applied.
    mockRunResult = async (op) => {
      await op(async (apdu) => {
        if (apdu[1] === 0x42) throw new Error("Tag was lost")
        return [0x90, 0x00]
      })
    }
    await enterAndApply()

    await waitFor(() =>
      expect(pinError()).toBe(
        "The tap was cut short while the card was saving the new PIN. It may already use the new PIN: try the new one first.",
      ),
    )
    // Which PIN is current is in doubt, so that is what is asked for again.
    expect(title()).toBe("Current PIN")
    expect(mockGoBack).not.toHaveBeenCalled()
  })

  it("a tap lost during VERIFY_PIN, before CHANGE_PIN went out, is only a lost card", async () => {
    mockRunResult = async (op) => {
      await op(async () => {
        throw new Error("Tag was lost")
      })
    }
    await enterAndApply()

    await waitFor(() =>
      expect(pinError()).toBe("No Cashu card found. Hold the card steady and try again."),
    )
    // VERIFY_PIN went out: a wrong current PIN may have cost a try, so it is
    // entered again rather than resent unseen.
    expect(title()).toBe("Current PIN")
  })

  it("a cancel that cuts off CHANGE_PIN is a lost answer, not a quiet cancel", async () => {
    // The old PIN may already be gone: a quiet retry would verify it again
    // and spend a try.
    mockRunResult = cutShortAt(INS_CHANGE_PIN, new NfcError.UserCancel())
    await enterAndApply()

    await waitFor(() => expect(pinError()).toBe(CHANGE_UNCERTAIN))
    expect(title()).toBe("Current PIN")
  })

  describe("a tap cut short after SET_PIN went out", () => {
    beforeEach(() => {
      mockMode = "set"
      mockPinState = "unset"
    })

    /** New PIN, confirmation, then the tap. */
    const setAndApply = async (pin = "2468") => {
      type(pin)
      next()
      type(pin)
      await act(async () => {
        next()
      })
    }

    /** Retypes the confirmation and taps again. */
    const confirmAgain = async (pin = "2468") => {
      type(pin)
      await act(async () => {
        next()
      })
    }

    /** Renders, sets 2468, and loses the tap on SET_PIN. */
    const loseTheFirstSet = async () => {
      mockRunResult = cutShortAt(INS_SET_PIN)
      renderScreen()
      await setAndApply()
      await waitFor(() => expect(pinError()).toBe(SET_UNCERTAIN))
    }

    // SET_PIN saves the PIN before it answers (CashuApplet.java@v0.2.0:538-539;
    // 0.3: 574-575), so a lost answer may hide a PIN the card already holds.
    it("keeps the new PIN and says the card may already use it", async () => {
      const sent: number[][] = []
      mockRunResult = tapReaching((apdu) => {
        if (apdu[1] === INS_SET_PIN) throw new Error("Tag was lost")
        return OK
      }, sent)
      renderScreen()
      await setAndApply()

      await waitFor(() => expect(pinError()).toBe(SET_UNCERTAIN))
      expect(sent).toEqual([SET_2468])
      expect(title()).toBe("Confirm new PIN")
      expect(mockGoBack).not.toHaveBeenCalled()
      expect(mockToast).not.toHaveBeenCalled()
    })

    it("a retry of the same PIN that the card answers 6985 to is the PIN set: the earlier write landed", async () => {
      await loseTheFirstSet()
      const sent: number[][] = []
      mockRunResult = answering(INS_SET_PIN, ALREADY_SET, sent)
      await confirmAgain()

      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      expect(sent).toEqual([SET_2468])
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          message: "PIN set. The card saved it during the tap that was cut short.",
        }),
      )
      // The retry is the one outcome a screen-reader user has no other way to hear.
      expect(announce).toHaveBeenCalledWith(
        "PIN set. The card saved it during the tap that was cut short.",
      )
      // A success, so the card screen stops offering Set PIN even when the
      // card leaves before the re-read.
      expect(capturedOptions?.assume).toEqual({ pinState: "set" })
    })

    it("a retry of the same PIN that the card accepts is a plain PIN set", async () => {
      await loseTheFirstSet()
      mockRunResult = answering(INS_SET_PIN, OK)
      await confirmAgain()

      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          message: "PIN set. The card now asks for it before it spends or loads.",
        }),
      )
    })

    it("a different PIN on the retry, refused with 6985, is a card that already has a PIN", async () => {
      await loseTheFirstSet()
      // A confirmation that doesn't match goes back to the new PIN.
      type("1357")
      next()
      expect(title()).toBe("New PIN")
      mockRunResult = answering(INS_SET_PIN, ALREADY_SET)
      await setAndApply("1357")

      await waitFor(() => expect(pinError()).toBe(ALREADY_HAS_PIN))
      expect(title()).toBe("New PIN")
      expect(mockGoBack).not.toHaveBeenCalled()
      expect(mockToast).not.toHaveBeenCalled()
    })

    it("after two cut-short taps with different PINs, a 6985 names neither", async () => {
      await loseTheFirstSet()
      type("1357")
      next()
      await setAndApply("1357")
      await waitFor(() => expect(pinError()).toBe(SET_UNCERTAIN))
      expect(title()).toBe("Confirm new PIN")

      // The card may hold 2468 or 1357.
      mockRunResult = answering(INS_SET_PIN, ALREADY_SET)
      await confirmAgain("1357")

      await waitFor(() => expect(pinError()).toBe(ALREADY_HAS_PIN))
      expect(mockGoBack).not.toHaveBeenCalled()
      expect(mockToast).not.toHaveBeenCalled()
    })

    it("a 6985 with no cut-short tap before it is a card that already had a PIN", async () => {
      mockRunResult = answering(INS_SET_PIN, ALREADY_SET)
      renderScreen()
      await setAndApply()

      await waitFor(() => expect(pinError()).toBe(ALREADY_HAS_PIN))
      expect(mockGoBack).not.toHaveBeenCalled()
      expect(mockToast).not.toHaveBeenCalled()
    })

    it("a cancel that cuts off SET_PIN is a lost answer, not a quiet cancel", async () => {
      mockRunResult = cutShortAt(INS_SET_PIN, new NfcError.UserCancel())
      renderScreen()
      await setAndApply()

      await waitFor(() => expect(pinError()).toBe(SET_UNCERTAIN))
      expect(title()).toBe("Confirm new PIN")
    })
  })

  it("screen readers hear the words, not the test ids", async () => {
    mockRunResult = async () => {
      throw new CardError(0x63c2, "VERIFY_PIN")
    }
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
    type("5678")
    next()
    type("5678")
    await act(async () => {
      next()
    })

    await waitFor(() => expect(screen.getByTestId("pin-error")).toBeTruthy())
    const error = screen.getByTestId("pin-error")
    expect(error.props.accessibilityLabel).toBeUndefined()
    // TalkBack reads the status area as it changes; VoiceOver is told.
    expect(screen.getByTestId("pin-status").props.accessibilityLiveRegion).toBe("polite")
    expect(announce).toHaveBeenCalledWith(error.props.children)
  })
})

// ENG-633: a card that answers CLEAR_PIN can have its PIN taken off again,
// so "never removed" would be false on it. The capability decides, and the
// firmware's blocked-PIN behaviour is still said alongside.
describe("FlashcardV2PinScreen set: on a card whose PIN can be removed (CLEAR_PIN), the warning says so", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    capturedOp = undefined
    capturedPubkey = undefined
    capturedOptions = undefined
    mockRunResult = async () => {}
    mockBlockFreezes = false
    mockMode = "set"
    mockPinState = "unset"
    mockClearPin = true
  })

  it("and still says three wrong entries switch the PIN check off on v0.2.0", () => {
    renderScreen()
    expect(screen.getByText(/changed or removed on this card/)).toBeTruthy()
    expect(screen.getByText(/switch the PIN check off/)).toBeTruthy()
    expect(screen.queryByText(/never removed/)).toBeNull()
    expect(screen.queryByText(/block the card for good/)).toBeNull()
  })

  it("and still says three wrong entries block the card on firmware that freezes it", () => {
    mockBlockFreezes = true
    renderScreen()
    expect(screen.getByText(/changed or removed on this card/)).toBeTruthy()
    expect(screen.getByText(/block the card for good/)).toBeTruthy()
    expect(screen.queryByText(/never removed/)).toBeNull()
    expect(screen.queryByText(/switch the PIN check off/)).toBeNull()
  })
})

describe("FlashcardV2PinScreen remove (ENG-633: CLEAR_PIN, applet 0.5)", () => {
  const REMOVED =
    "PIN removed. Anyone holding this card can now spend from it or load it."
  const REMOVED_EARLIER =
    "PIN removed. The card removed it during the tap that was cut short."
  const CLEAR_UNCERTAIN =
    "The tap was cut short while the card was removing the PIN. Tap the card again to finish: if the PIN is already gone, the card says so."
  const NO_PIN = "This card has no PIN to remove."
  const LOCKED_REMOVE =
    "This card is locked against changes, so its PIN can't be removed."
  const BEARER = "Anyone holding this card can spend from it or load it."

  beforeEach(() => {
    jest.clearAllMocks()
    capturedOp = undefined
    capturedPubkey = undefined
    capturedOptions = undefined
    mockRunResult = async () => {}
    mockBlockFreezes = false
    mockMode = "remove"
    mockPinState = "set"
    mockClearPin = true
  })

  /** Types the current PIN and reaches the confirmation step. */
  const enterCurrent = (current = "1234") => {
    renderScreen()
    expect(title()).toBe("Current PIN")
    type(current)
    next()
    expect(title()).toBe("Remove card PIN")
  }

  /** Presses Remove PIN: the tap. */
  const removeNow = async () => {
    await act(async () => {
      fireEvent.press(screen.getByText("Remove PIN"))
    })
  }

  it("asks the current PIN, then says plainly what a card with no PIN is before the tap", () => {
    enterCurrent()

    expect(screen.getByTestId("pin-remove-confirm")).toBeTruthy()
    expect(screen.getByText(BEARER)).toBeTruthy()
    expect(screen.getByText(/The card will stop asking for a PIN/)).toBeTruthy()
    expect(
      screen.getByText("Hold the card to the back of your phone to apply"),
    ).toBeTruthy()
    // No digits to type here: one button, and nothing has reached a card.
    expect(screen.queryByTestId("pin-1")).toBeNull()
    expect(screen.queryByText("Continue")).toBeNull()
    expect(screen.getByText("Remove PIN")).toBeTruthy()
    expect(capturedOp).toBeUndefined()
  })

  it("verifies then clears in one tap, assumes no PIN if the re-read is lost, and says the card is now a bearer card", async () => {
    enterCurrent()
    await removeNow()

    await waitFor(() => expect(capturedOp).toBeDefined())
    expect(capturedPubkey).toBe(PUBKEY)
    // A 9000 to CLEAR_PIN proves the PIN is gone even if the re-read is lost.
    expect(capturedOptions?.assume).toEqual({ pinState: "unset" })
    const sent = await runCapturedOp()
    expect(sent).toEqual([VERIFY_1234, CLEAR_1234])
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", message: REMOVED }),
    )
    expect(announce).toHaveBeenCalledWith(REMOVED)
    expect(JSON.stringify(mockToast.mock.calls)).not.toContain("1234")
  })

  it("against a card that follows the spec: VERIFY_PIN then CLEAR_PIN, and the card is left with no PIN", async () => {
    const card = createFakeCard(32, { pin: "1234", clearPin: true })
    mockRunResult = async (op) => {
      await op(card.transceive)
    }
    enterCurrent()
    await removeNow()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(card.ins()).toEqual([0x40, 0x43])
    expect(card.pin()).toBeUndefined()
    expect(announce).toHaveBeenCalledWith(REMOVED)
  })

  it("a wrong current PIN says how many tries are left and asks for it again", async () => {
    const card = createFakeCard(32, { pin: "1234", clearPin: true })
    mockRunResult = async (op) => {
      await op(card.transceive)
    }
    enterCurrent("1111")
    await removeNow()

    await waitFor(() =>
      expect(pinError()).toBe(
        "Wrong PIN. Tries left before the PIN check switches off: 2.",
      ),
    )
    expect(title()).toBe("Current PIN")
    // VERIFY_PIN refused it: CLEAR_PIN never went out, the PIN stays.
    expect(card.ins()).toEqual([0x40])
    expect(card.pin()).toBe("1234")
    expect(card.triesLeft()).toBe(2)
    expect(mockGoBack).not.toHaveBeenCalled()
    expect(mockToast).not.toHaveBeenCalled()
  })

  it("on firmware that freezes a blocked card, a wrong PIN counts toward the block the same way", async () => {
    mockBlockFreezes = true
    mockRunResult = async () => {
      throw new CardError(0x63c1, "VERIFY_PIN")
    }
    enterCurrent("1111")
    await removeNow()

    await waitFor(() =>
      expect(pinError()).toBe("Wrong PIN. Tries left before the card blocks: 1."),
    )
    expect(title()).toBe("Current PIN")
  })

  it("a blocked PIN ends the flow: no session can verify it, so nothing can clear it", async () => {
    mockRunResult = async (_op, options) => {
      options?.onReread?.({ ...reread("blocked"), clearPin: true })
      throw new CardError(0x6983, "VERIFY_PIN")
    }
    enterCurrent("1111")
    await removeNow()

    await expectFlowEnded(OPEN)
  })

  it("a tap lost once CLEAR_PIN went out keeps the PIN typed and says the card may already have none", async () => {
    const sent: number[][] = []
    mockRunResult = tapReaching((apdu) => {
      if (apdu[1] === INS_CLEAR_PIN) throw new Error("Tag was lost")
      return OK
    }, sent)
    enterCurrent()
    await removeNow()

    await waitFor(() => expect(pinError()).toBe(CLEAR_UNCERTAIN))
    expect(sent).toEqual([VERIFY_1234, CLEAR_1234])
    // Back at the confirmation, the current PIN still standing.
    expect(title()).toBe("Remove card PIN")
    expect(screen.getByText("Remove PIN")).toBeTruthy()
    expect(mockGoBack).not.toHaveBeenCalled()
    expect(mockToast).not.toHaveBeenCalled()
  })

  it("after a cut-short CLEAR_PIN, a 6984 from VERIFY_PIN on the retry is the PIN removed: the earlier clear landed", async () => {
    mockRunResult = cutShortAt(INS_CLEAR_PIN)
    enterCurrent()
    await removeNow()
    await waitFor(() => expect(pinError()).toBe(CLEAR_UNCERTAIN))

    const sent: number[][] = []
    mockRunResult = answering(0x40, [0x69, 0x84], sent)
    await removeNow()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(sent).toEqual([VERIFY_1234])
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", message: REMOVED_EARLIER }),
    )
    expect(announce).toHaveBeenCalledWith(REMOVED_EARLIER)
    expect(capturedOptions?.assume).toEqual({ pinState: "unset" })
  })

  it("after a cut-short CLEAR_PIN, a retry the card accepts is a plain PIN removed", async () => {
    mockRunResult = cutShortAt(INS_CLEAR_PIN)
    enterCurrent()
    await removeNow()
    await waitFor(() => expect(pinError()).toBe(CLEAR_UNCERTAIN))

    const sent: number[][] = []
    mockRunResult = tapReaching(() => OK, sent)
    await removeNow()

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(sent).toEqual([VERIFY_1234, CLEAR_1234])
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", message: REMOVED }),
    )
  })

  it("a 6984 with no cut-short tap before it is a card that has no PIN: the flow ends", async () => {
    mockRunResult = async (_op, options) => {
      options?.onReread?.({ ...reread("unset"), clearPin: true })
      throw new CardError(0x6984, "VERIFY_PIN")
    }
    enterCurrent()
    await removeNow()

    await expectFlowEnded(NO_PIN)
  })

  it("a card locked against writes (6986) says the PIN can't be removed and starts over", async () => {
    mockRunResult = async () => {
      throw new CardError(0x6986, "CLEAR_PIN")
    }
    enterCurrent()
    await removeNow()

    await waitFor(() => expect(pinError()).toBe(LOCKED_REMOVE))
    expect(title()).toBe("Current PIN")
    expect(pinError()).not.toMatch(/0x|6986|failed/)
  })

  it("a tap lost during VERIFY_PIN, before CLEAR_PIN went out, asks for the current PIN again", async () => {
    mockRunResult = cutShortAt(0x40)
    enterCurrent()
    await removeNow()

    await waitFor(() =>
      expect(pinError()).toBe("No Cashu card found. Hold the card steady and try again."),
    )
    expect(title()).toBe("Current PIN")
  })

  it("a cancelled sheet before any PIN reached the card is no error: the confirmation stays", async () => {
    mockRunResult = async () => {
      throw new NfcError.UserCancel()
    }
    enterCurrent()
    await removeNow()

    await waitFor(() => expect(capturedOp).toBeDefined())
    expect(screen.queryByTestId("pin-error")).toBeNull()
    expect(title()).toBe("Remove card PIN")
    expect(mockGoBack).not.toHaveBeenCalled()

    // The current PIN was kept: the next tap sends it.
    const sent: number[][] = []
    mockRunResult = tapReaching(() => OK, sent)
    await removeNow()
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(sent).toEqual([VERIFY_1234, CLEAR_1234])
  })

  it("a different card, or a tag without the applet, keeps the PIN typed", async () => {
    for (const error of [
      new WrongCardError("03ff"),
      new AppletNotSelectedError(0x6a82, 0x6a82),
    ]) {
      mockRunResult = async () => {
        throw error
      }
      enterCurrent()
      await removeNow()
      await waitFor(() => expect(screen.getByTestId("pin-error")).toBeTruthy())
      expect(title()).toBe("Remove card PIN")
      expect(mockGoBack).not.toHaveBeenCalled()
      screen.unmount()
    }
  })

  it("an unexpected refusal's status word goes to the log, not the screen", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    mockRunResult = async () => {
      throw new CardError(0x6d00, "CLEAR_PIN")
    }
    enterCurrent()
    await removeNow()

    await waitFor(() =>
      expect(pinError()).toBe("The card refused the change. Try again."),
    )
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CLEAR_PIN.*CardError 6D00/))
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/1234/)
    warn.mockRestore()
  })
})
