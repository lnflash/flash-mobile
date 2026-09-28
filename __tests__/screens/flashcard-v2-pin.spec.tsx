/**
 * ENG-616: the set / change PIN screen. The PINs are typed on the pad, the
 * two new entries must match, and everything the card does with them happens
 * inside one tap — VERIFY then CHANGE, or SET alone. The PIN never leaves the
 * screen: nothing is stored, and no message carries the digits. What a
 * blocked PIN does depends on the card's firmware (ENG-615), and the copy
 * says which.
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

loadLocale("en")

const PUBKEY = "02" + "ab".repeat(32)
const mockGoBack = jest.fn()
const mockToast = jest.fn()
// Whether this card's firmware freezes a blocked card (true) or, like v0.2.0,
// switches the PIN check off (false). No shipped version freezes yet, so the
// freezing branch is reached through the mock.
let mockBlockFreezes = false
let mockMode: "set" | "change" = "change"
let mockPinState: "unset" | "set" = "set"
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
    cashuCard: { pubkey: PUBKEY, pinState: mockPinState, balance: 0, version: "0.2" },
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
  pinState,
})

const VERIFY_1234 = [0xb0, 0x40, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34]
const CHANGE_1234_5678 = [
  0xb0, 0x42, 0x00, 0x00, 0x09, 0x04, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
]

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

  /** The last-try outcome: the flow ends on a toast and the card screen, never a retry. */
  const expectFlowEnded = async (message: RegExp) => {
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", message: expect.stringMatching(message) }),
    )
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(message))
    expect(screen.queryByTestId("pin-error")).toBeNull()
  }

  const FROZEN = /blocked and must be replaced/
  const OPEN = /switches the PIN check off: anyone holding the card can spend/

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

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1))
    expect(JSON.stringify(mockToast.mock.calls)).not.toMatch(/last try/)
  })

  // Each failure the card or the tap can produce, and the words it gets. None
  // carries a status word or developer text, and each leaves the holder on
  // this screen to try again.
  const failures = [
    {
      name: "a card that already has a PIN (6985)",
      mode: "set" as const,
      error: new CardError(0x6985, "SET_PIN"),
      text: "This card already has a PIN. Change it instead.",
    },
    {
      name: "a tag without the Cashu applet (a BoltCard)",
      mode: "change" as const,
      error: new AppletNotSelectedError(0x6a82, 0x6a82),
      text: "That isn't a Cashu card. Tap the card this screen is showing.",
    },
    {
      name: "a card locked against writes (6986)",
      mode: "change" as const,
      error: new CardError(0x6986, "CHANGE_PIN"),
      text: "This card is locked against changes, so its PIN can't be set or changed.",
    },
    {
      name: "any other refusal",
      mode: "change" as const,
      error: new CardError(0x6f00, "CHANGE_PIN"),
      text: "The card refused the change. Try again.",
    },
    {
      name: "a different card",
      mode: "change" as const,
      error: new WrongCardError("03ff"),
      text: "That is a different card. Tap the card this screen is showing.",
    },
    {
      name: "a tap lost before any PIN command went out",
      mode: "change" as const,
      error: new Error("Tag was lost"),
      text: "No Cashu card found. Hold the card steady and try again.",
    },
  ]

  failures.forEach(({ name, mode, error, text }) => {
    it(`${name}: says so in plain words and starts over`, async () => {
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
      expect(title()).toBe(mode === "set" ? "New PIN" : "Current PIN")
      expect(pinError()).not.toMatch(/0x|6F00|6A82|6986|6985|failed/)
      expect(mockGoBack).not.toHaveBeenCalled()
      warn.mockRestore()
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
