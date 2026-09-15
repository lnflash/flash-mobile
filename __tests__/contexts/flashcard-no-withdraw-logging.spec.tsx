import React from "react"
import { act, render, waitFor } from "@testing-library/react-native"
import { Text } from "react-native"
import NfcManager, { Ndef } from "react-native-nfc-manager"
import { getParams } from "js-lnurl"
import axios from "axios"

import { FlashcardProvider } from "@app/contexts/Flashcard"
import { useFlashcard } from "@app/hooks/useFlashcard"
import { IsAuthedContextProvider } from "@app/graphql/is-authed-context"
import { PersistentStateContext } from "@app/store/persistent-state"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
import { toastShow } from "@app/utils/toast"

// Placeholder values only. Real cards carry a per-tap p/c pair and a k1 that
// together authorise a withdrawal, which is exactly why none of these may be
// written to the console.
const CARD_PAYLOAD = "lnurlw://card.test.flashapp.me/boltcard?p=PARAM_P&c=PARAM_C"
const K1 = "K1_WITHDRAW_SECRET"
const CALLBACK = "https://card.test.flashapp.me/boltcard/cb?k1=K1_WITHDRAW_SECRET"
const CARD_LNURL = "lnurl1CARDWITHDRAWLINK"
const BALANCE_HTML = `<a href="lightning:${CARD_LNURL}">pay</a><dt>1,234 SATS</dt>`

const SECRETS = [K1, CALLBACK, CARD_LNURL, "PARAM_P", "PARAM_C"]
const CONSOLE_METHODS = ["log", "warn", "error", "info", "debug"] as const

type Snapshot = ReturnType<typeof useFlashcard>
let latest: Snapshot | undefined
let readFlashcard: Snapshot["readFlashcard"] | undefined

const Probe = () => {
  const ctx = useFlashcard()
  latest = ctx
  readFlashcard = ctx.readFlashcard
  return <Text>{ctx.k1 ?? "no-k1"}</Text>
}

const renderProvider = () =>
  render(
    <ThemeProvider theme={theme}>
      <IsAuthedContextProvider value={true}>
        <PersistentStateContext.Provider
          value={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            persistentState: {} as any,
            updateState: jest.fn(),
            resetState: jest.fn(),
          }}
        >
          <FlashcardProvider>
            <Probe />
          </FlashcardProvider>
        </PersistentStateContext.Provider>
      </IsAuthedContextProvider>
    </ThemeProvider>,
  )

const consoleOutput = (spies: jest.SpyInstance[]) =>
  spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" ")))

describe("FlashcardProvider withdraw parameters", () => {
  // First render pays the provider's module-load cost (rneui, nfc, animatable).
  jest.setTimeout(30000)

  let spies: jest.SpyInstance[]

  beforeEach(() => {
    latest = undefined
    readFlashcard = undefined
    spies = CONSOLE_METHODS.map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    )
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.getTag as jest.Mock).mockResolvedValue({
      id: "04AABBCC",
      ndefMessage: [{ payload: [1, 2, 3] }],
    })
    ;(Ndef.text.decodePayload as jest.Mock).mockReturnValue(CARD_PAYLOAD)
  })

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore())
    jest.clearAllMocks()
  })

  it("captures k1 and callback for a payment tap without logging them", async () => {
    ;(getParams as jest.Mock).mockResolvedValue({
      tag: "withdrawRequest",
      k1: K1,
      callback: CALLBACK,
    })

    renderProvider()
    await waitFor(() => expect(readFlashcard).toBeDefined())
    await act(async () => {
      await readFlashcard?.(true)
    })

    await waitFor(() => expect(latest?.k1).toBe(K1))
    expect(latest?.callback).toBe(CALLBACK)
    expect(NfcManager.cancelTechnologyRequest).toHaveBeenCalled()

    const output = consoleOutput(spies)
    for (const secret of SECRETS) {
      expect(output.some((line) => line.includes(secret))).toBe(false)
    }
  })

  it("parses the balance page for a balance tap without logging the card link", async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({ data: BALANCE_HTML })

    renderProvider()
    await waitFor(() => expect(readFlashcard).toBeDefined())
    await act(async () => {
      await readFlashcard?.(false)
    })

    await waitFor(() => expect(latest?.balanceInSats).toBe(1234))
    expect(latest?.lnurl).toBe(CARD_LNURL)
    expect((axios.get as jest.Mock).mock.calls[0][0]).toBe(
      "https://card.test.flashapp.me/boltcards/balance?p=PARAM_P&c=PARAM_C",
    )

    const output = consoleOutput(spies)
    for (const secret of SECRETS) {
      expect(output.some((line) => line.includes(secret))).toBe(false)
    }
  })

  it("logs only a class name and status when the balance page fetch fails", async () => {
    // Synthetic axios-style failure whose message AND config carry the card URL.
    const failure = Object.assign(
      new Error(`Request to ${CARD_PAYLOAD} failed: ${CALLBACK}`),
      {
        name: "AxiosError",
        config: {
          url: "https://card.test.flashapp.me/boltcards/balance?p=PARAM_P&c=PARAM_C",
        },
        response: { status: 500 },
      },
    )
    ;(axios.get as jest.Mock).mockRejectedValue(failure)

    renderProvider()
    await waitFor(() => expect(readFlashcard).toBeDefined())
    await act(async () => {
      await readFlashcard?.(false)
    })

    expect(console.warn).toHaveBeenCalledWith(
      "NFC balance page fetch failed:",
      "AxiosError status=500",
    )
    for (const secret of SECRETS) {
      expect(consoleOutput(spies).some((line) => line.includes(secret))).toBe(false)
    }
  })

  it("logs only a class name when the withdraw params lookup throws an Error", async () => {
    ;(getParams as jest.Mock).mockRejectedValue(
      new Error(`Failed to fetch ${CARD_PAYLOAD} (k1=${K1}, callback=${CALLBACK})`),
    )

    renderProvider()
    await waitFor(() => expect(readFlashcard).toBeDefined())
    await act(async () => {
      await readFlashcard?.(true)
    })

    expect(console.warn).toHaveBeenCalledWith(
      "NFC withdraw params lookup failed:",
      "Error",
    )
    for (const secret of SECRETS) {
      expect(consoleOutput(spies).some((line) => line.includes(secret))).toBe(false)
    }
  })

  it("logs only a type name when the withdraw params lookup throws a string", async () => {
    ;(getParams as jest.Mock).mockRejectedValue(`${CARD_PAYLOAD} ${K1} ${CALLBACK}`)

    renderProvider()
    await waitFor(() => expect(readFlashcard).toBeDefined())
    await act(async () => {
      await readFlashcard?.(true)
    })

    expect(console.warn).toHaveBeenCalledWith(
      "NFC withdraw params lookup failed:",
      "string",
    )
    for (const secret of SECRETS) {
      expect(consoleOutput(spies).some((line) => line.includes(secret))).toBe(false)
    }
  })

  it("shows fixed text when the tag is not a withdraw request", async () => {
    ;(getParams as jest.Mock).mockResolvedValue({
      tag: "payRequest",
      callback: CALLBACK,
      reason: `not a withdraw tag: ${CARD_PAYLOAD}`,
    })

    renderProvider()
    await waitFor(() => expect(readFlashcard).toBeDefined())
    await act(async () => {
      await readFlashcard?.(true)
    })

    expect(toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: "This card is not set up as a Flashcard. Please tap a Flashcard.",
      }),
    )
    const shown = (toastShow as jest.Mock).mock.calls.map((c) => JSON.stringify(c[0]))
    for (const secret of SECRETS) {
      expect(shown.some((m) => m.includes(secret))).toBe(false)
      expect(consoleOutput(spies).some((line) => line.includes(secret))).toBe(false)
    }
    expect(latest?.k1).toBeUndefined()
  })

  it("shows fixed text when the lnurl lookup returns an error object", async () => {
    ;(getParams as jest.Mock).mockResolvedValue({
      status: "ERROR",
      reason: `Failed to fetch ${CARD_PAYLOAD} ${CALLBACK}`,
    })

    renderProvider()
    await waitFor(() => expect(readFlashcard).toBeDefined())
    await act(async () => {
      await readFlashcard?.(true)
    })

    const shown = (toastShow as jest.Mock).mock.calls.map((c) => JSON.stringify(c[0]))
    expect(shown.length).toBeGreaterThan(0)
    for (const secret of SECRETS) {
      expect(shown.some((m) => m.includes(secret))).toBe(false)
    }
  })
})
