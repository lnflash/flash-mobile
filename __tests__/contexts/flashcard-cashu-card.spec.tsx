import React from "react"
import { act, render, waitFor } from "@testing-library/react-native"
import { Text } from "react-native"
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager"
import axios from "axios"

import { FlashcardProvider } from "@app/contexts/Flashcard"
import { useFlashcard } from "@app/hooks/useFlashcard"
import { IsAuthedContextProvider } from "@app/graphql/is-authed-context"
import { PersistentStateContext } from "@app/store/persistent-state"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { buildSelectApdu } from "@app/utils/cashu-card"

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
import { toastShow } from "@app/utils/toast"

// Exercises handleTag's orchestration — the only code that decides whether a
// Cashu card is ever read — against the mocked NFC manager. The parser and
// APDU client have their own spec; this one pins the call site:
//   - the transceive used is the manager's isoDepHandler (not a phantom field
//     on the tag), reached only when the request resolved with IsoDep
//   - one requestTechnology per tap, whatever the card turns out to be
//   - a cancelled request ends the tap; it never opens a second session

const ok = (data: number[]) => [...data, 0x90, 0x00]
const SW_FILE_NOT_FOUND = [0x6a, 0x82]
const INS_SELECT = 0xa4

// A BoltCard payload; values are placeholders.
const CARD_PAYLOAD = "lnurlw://card.test.flashapp.me/boltcard?p=PARAM_P&c=PARAM_C"
const BALANCE_HTML = `<a href="lightning:lnurl1CARD">pay</a><dt>1,234 SATS</dt>`
const NDEF_TAG = { id: "04AABBCC", ndefMessage: [{ payload: [1, 2, 3] }] }
// A JavaCard with no NDEF application on it.
const ISO_DEP_ONLY_TAG = { id: "08AABBCC" }

/** Answers like a real Cashu card: SELECT, GET_INFO and GET_BALANCE all succeed. */
const cashuCard = async (bytes: number[]) => {
  switch (bytes[1]) {
    case INS_SELECT:
      return ok([0, 2])
    case 0x01:
      return ok([0, 2, 32, 1, 7, 0x07, 1, 0])
    case 0x11:
      return ok([0, 0, 0x01, 0xf4])
    default:
      throw new Error("unsupported")
  }
}

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const getTag = NfcManager.getTag as jest.Mock
const cancelTechnologyRequest = NfcManager.cancelTechnologyRequest as jest.Mock

type Snapshot = ReturnType<typeof useFlashcard>
let latest: Snapshot | undefined

const Probe = () => {
  latest = useFlashcard()
  return <Text>{latest.balanceInSats ?? "no-balance"}</Text>
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

/**
 * Renders the provider and taps once. readFlashcard does not await handleTag,
 * so the tap is "done" once the session has been released (the finally
 * block), which is also the invariant every test here cares about: exactly
 * one release per tap.
 */
const tapOnce = async () => {
  renderProvider()
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
  await act(async () => {
    await latest?.readFlashcard(false)
  })
  await waitFor(() => expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1))
}

describe("FlashcardProvider Cashu card orchestration", () => {
  // First render pays the provider's module-load cost (rneui, nfc, animatable).
  jest.setTimeout(30000)

  let warn: jest.SpyInstance

  beforeEach(() => {
    latest = undefined
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    requestTechnology.mockReset()
    transceive.mockReset()
    getTag.mockReset()
    ;(NfcManager.isSupported as jest.Mock).mockResolvedValue(true)
    ;(NfcManager.isEnabled as jest.Mock).mockResolvedValue(true)
    ;(Ndef.text.decodePayload as jest.Mock).mockReturnValue(CARD_PAYLOAD)
    ;(axios.get as jest.Mock).mockResolvedValue({ data: BALANCE_HTML })
  })

  afterEach(() => {
    warn.mockRestore()
    jest.clearAllMocks()
  })

  it("reads a Cashu card through the manager's IsoDep handler when the request resolves IsoDep", async () => {
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(ISO_DEP_ONLY_TAG)
    transceive.mockImplementation(cashuCard)

    await tapOnce()

    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(requestTechnology).toHaveBeenCalledWith([NfcTech.IsoDep, NfcTech.Ndef])
    // The applet SELECT goes out first, verbatim, over the manager's handler.
    expect(transceive.mock.calls[0][0]).toEqual(buildSelectApdu())
    expect(transceive).toHaveBeenCalledTimes(3)
    expect(toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        message: "Cashu card: 500 sats (v0.2)",
      }),
    )
    // The BoltCard flow does not run for a Cashu card.
    expect(axios.get).not.toHaveBeenCalled()
    expect(latest?.balanceInSats).toBeUndefined()
  })

  it("does not touch the IsoDep channel when the tag connected as Ndef", async () => {
    requestTechnology.mockResolvedValue(NfcTech.Ndef)
    getTag.mockResolvedValue(NDEF_TAG)

    await tapOnce()

    expect(transceive).not.toHaveBeenCalled()
    await waitFor(() => expect(latest?.balanceInSats).toBe(1234))
    expect(requestTechnology).toHaveBeenCalledTimes(1)
  })

  it("falls through to the NDEF flow on the same tap when the applet SELECT is refused", async () => {
    // An NTAG 424 BoltCard is a Type-4 tag: it connects as IsoDep too, and
    // answers both SELECT forms with 6A82 because the Cashu AID is unknown.
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(NDEF_TAG)
    transceive.mockResolvedValue(SW_FILE_NOT_FOUND)

    await tapOnce()

    await waitFor(() => expect(latest?.balanceInSats).toBe(1234))
    // One session, one tag read, one release — no second request for Ndef.
    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(getTag).toHaveBeenCalledTimes(1)
    expect(cancelTechnologyRequest).toHaveBeenCalledTimes(1)
    // Both SELECT forms were tried, nothing more.
    expect(transceive).toHaveBeenCalledTimes(2)
    expect(transceive.mock.calls.every((call) => call[0][1] === INS_SELECT)).toBe(true)
    expect(toastShow).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" }),
    )
  })

  it("a cancelled request ends the tap without opening a second session", async () => {
    // iOS: the user dismisses the sheet; Android: the modal's Cancel. Either
    // way the pending request rejects.
    requestTechnology.mockRejectedValue(new Error("UserCancel"))

    await tapOnce()

    expect(requestTechnology).toHaveBeenCalledTimes(1)
    expect(getTag).not.toHaveBeenCalled()
    expect(transceive).not.toHaveBeenCalled()
    expect(axios.get).not.toHaveBeenCalled()
    expect(toastShow).not.toHaveBeenCalled()
  })

  it("a Cashu card that fails mid-read is not re-read as a BoltCard", async () => {
    // SELECT succeeded, so this is our card; a later status failure is a
    // transport error, not a reason to parse the tag as NDEF.
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue(NDEF_TAG)
    transceive.mockImplementation(async (bytes: number[]) =>
      bytes[1] === INS_SELECT ? ok([0, 2]) : [0x6f, 0x00],
    )

    await tapOnce()

    expect(axios.get).not.toHaveBeenCalled()
    expect(toastShow).not.toHaveBeenCalled()
    expect(latest?.balanceInSats).toBeUndefined()
  })
})
