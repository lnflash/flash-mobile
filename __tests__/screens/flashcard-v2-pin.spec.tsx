/**
 * ENG-616: the set / change PIN screen. The PINs are typed on the pad, the
 * two new entries must match, and everything the card does with them happens
 * inside one tap — VERIFY then CHANGE, or SET alone. The PIN never leaves the
 * screen: nothing is stored, and no message carries the digits. What three
 * wrong entries do depends on the card's firmware (ENG-615), and the copy
 * says which.
 */
import * as React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { loadLocale } from "../../app/i18n/i18n-util.sync"
import appTheme from "../../app/rne-theme/theme"
import { FlashcardV2PinScreen } from "../../app/screens/card-screen/flashcard-v2-pin"
import { CardError, WrongCardError, Transceiver } from "../../app/utils/cashu-card"

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
let mockRunResult: () => Promise<void> = async () => {}

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
    runCardOperation: async (op: (t: Transceiver) => Promise<void>, pubkey?: string) => {
      capturedOp = op
      capturedPubkey = pubkey
      await mockRunResult()
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

describe("FlashcardV2PinScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    capturedOp = undefined
    capturedPubkey = undefined
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
    const sent = await runCapturedOp()
    expect(sent).toEqual([
      [0xb0, 0x40, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34],
      [
        0xb0, 0x42, 0x00, 0x00, 0x09, 0x04, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
        0x38,
      ],
    ])
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

    expect(screen.getByTestId("pin-error").props.children).toBe("The PINs don't match")
    expect(title()).toBe("New PIN")
    expect(capturedOp).toBeUndefined()
  })

  it("refuses a new PIN equal to the current one", () => {
    renderScreen()
    type("1234")
    next()
    type("1234")
    next()
    expect(screen.getByTestId("pin-error").props.children).toBe(
      "Choose a PIN different from the current one",
    )
  })

  const enterWrongCurrentPin = async () => {
    renderScreen()
    type("1111")
    next()
    type("5678")
    next()
    type("5678")
    await act(async () => {
      next()
    })
  }
  const pinError = () => screen.getByTestId("pin-error").props.children

  const firmwares = [
    {
      name: "v0.2.0 (a blocked PIN stops being checked)",
      freezes: false,
      wrong: "Wrong PIN. 2 tries left before the PIN check switches off.",
      last: /PIN check is now off: anyone holding the card can spend/,
    },
    {
      name: "firmware that freezes a blocked card",
      freezes: true,
      wrong: "Wrong PIN. 2 tries left before the card blocks.",
      last: /now blocked and must be replaced/,
    },
  ]

  firmwares.forEach(({ name, freezes, wrong, last }) => {
    describe(name, () => {
      beforeEach(() => {
        mockBlockFreezes = freezes
      })

      it("a wrong current PIN says how many tries are left and starts over", async () => {
        mockRunResult = async () => {
          throw new CardError(0x63c2, "VERIFY_PIN")
        }
        await enterWrongCurrentPin()

        await waitFor(() => expect(pinError()).toBe(wrong))
        expect(title()).toBe("Current PIN")
        expect(mockGoBack).not.toHaveBeenCalled()
      })

      // 63C0 is CHANGE_PIN's exhausting answer on v0.2.0; 6983 is VERIFY_PIN's.
      ;[0x63c0, 0x6983].forEach((sw) => {
        it(`the last wrong try (${sw.toString(
          16,
        )}) says what the card now does`, async () => {
          mockRunResult = async () => {
            throw new CardError(sw, "VERIFY_PIN")
          }
          await enterWrongCurrentPin()

          await waitFor(() => expect(pinError()).toMatch(last))
          expect(mockGoBack).not.toHaveBeenCalled()
        })
      })
    })
  })

  it("a different card is named as such", async () => {
    mockRunResult = async () => {
      throw new WrongCardError("03ff")
    }
    renderScreen()
    type("1234")
    next()
    type("5678")
    next()
    type("5678")
    await act(async () => {
      next()
    })

    await waitFor(() =>
      expect(screen.getByTestId("pin-error").props.children).toMatch(/different card/),
    )
  })
})
