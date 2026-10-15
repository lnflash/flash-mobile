/**
 * ENG-702: the card screen's tidy, wired to the app. What it pins:
 *   - the mint's fee and the spent slots' verdicts are asked before the tap,
 *     and the owner key found before it, so the card session never waits on
 *     them; the keyset the fee was asked for goes into the tap with it;
 *   - a tidy still owed is finished without asking the mint's fee: its fee is
 *     in its record, and its keyset may be rotated out;
 *   - the tap runs the tidy on the card on screen, with the PIN (verified
 *     before SPEND_ALL_BEGIN) only when the screen asked for it, and the
 *     change loaded under the owner's grant;
 *   - the re-read after it reads the pieces again (a tidy moves no balance);
 *   - a card that would take no load (no owner key, no PIN) is refused
 *     before the tap, never after SIGN has burned its pieces;
 *   - "Not now" is remembered for the pieces it was said to;
 *   - only a tidy still owed holds the offer back; one kept for a human
 *     (`needs-card`) does not, and "Dismiss" moves it to the archive;
 *   - "Finish" (`finishOnly`) only finishes a tidy still owed: with none left
 *     (a minter pass gave it up since the list was read) it taps nothing,
 *     and never starts a tidy the owner was not offered;
 *   - a tap that leaves a tidy signed, or throws, nudges the minter, which
 *     swaps it without the card.
 */
import * as Keychain from "react-native-keychain"
import * as React from "react"
import { Provider } from "react-redux"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { CashuCardState } from "../../app/contexts/Flashcard"
import { tidyProgressText, useCardTidy } from "../../app/hooks/use-card-tidy"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { store } from "../../app/store/redux"
import { resetFlashcardV2 } from "../../app/store/redux/slices/flashcardV2Slice"
import type { RunTidyArgs, TidyOffer, TidyRecord } from "../../app/utils/cashu-card-topup"
import { cashuCardState } from "../helpers/cashu-card-state"

const mockRunCardOperation = jest.fn()
const mockRunTidy = jest.fn()
const mockVerifyCardPin = jest.fn()
const mockAllowLoad = jest.fn()
const mockOwnerKeyFor = jest.fn()
const mockReclaimVerdicts = jest.fn()
const mockFeePpk = jest.fn()
const mockNudge = jest.fn()
const mockReport = jest.fn()

jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("../../app/hooks/use-card-top-up", () => ({
  nudgeTopUpMinter: () => mockNudge(),
}))
jest.mock("../../app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({ runCardOperation: mockRunCardOperation }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}))
jest.mock("@app/utils/cashu-card", () => ({
  ...jest.requireActual("@app/utils/cashu-card"),
  verifyCardPin: (...args: unknown[]) => mockVerifyCardPin(...args),
}))
jest.mock("@app/utils/cashu-card-owner", () => ({
  ...jest.requireActual("@app/utils/cashu-card-owner"),
  allowLoad: (...args: unknown[]) => mockAllowLoad(...args),
}))
jest.mock("@app/utils/cashu-card-owner-store", () => ({
  ...jest.requireActual("@app/utils/cashu-card-owner-store"),
  ownerKeyFor: (...args: unknown[]) => mockOwnerKeyFor(...args),
}))
jest.mock("@app/utils/cashu-card-topup", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup"),
  runTidy: (...args: unknown[]) => mockRunTidy(...args),
  reclaimVerdicts: (...args: unknown[]) => mockReclaimVerdicts(...args),
}))
jest.mock("@app/utils/cashu-card-topup/connected", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup/connected"),
  topUpMint: () => ({ url: "https://mint.test", feePpk: mockFeePpk }),
}))

loadLocale("en")
const LL = i18nObject("en")

const C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
const KEYSET = "0059534ce0bfa19a"
const OFFER: TidyOffer = {
  kind: "offer",
  fee: 0,
  outputs: 5,
  complete: true,
  needsPin: false,
  fingerprint: "pieces-1",
}
const SPENT = {
  slot: 7,
  status: "spent" as const,
  keysetId: KEYSET,
  amount: 2,
  nonce: "77".repeat(32),
  C,
  date: 0,
}

const card = (overrides: Partial<CashuCardState> = {}): CashuCardState =>
  cashuCardState({
    tidyOffer: OFFER,
    spentSlots: [SPENT],
    unspentSlots: [16, 8].map((amount, slot) => ({
      slot,
      status: "unspent" as const,
      keysetId: KEYSET,
      amount,
      nonce: (slot + 1).toString(16).padStart(64, "0"),
      C,
      date: 0,
    })),
    ...overrides,
  })

const wrapper = ({ children }: React.PropsWithChildren) => (
  <Provider store={store}>{children}</Provider>
)

const OWNER = { privateKey: "42".repeat(32), source: "device", saved: true }
const VERDICTS = new Map([[SPENT.nonce, "SPENT"]])

const TOPUPS = "flashcard-v2-topups"
const ARCHIVE = "flashcard-v2-tidy-archive"

/** A tidy saved for the card on screen, in `state`. */
const saved = (id: string, state: TidyRecord["state"], pubkey: string): TidyRecord => ({
  kind: "tidy",
  version: 1,
  id,
  cardPubkey: pubkey,
  mintUrl: "https://mint.test",
  keysetId: KEYSET,
  fee: 0,
  inputs: [],
  outputs: [{ amount: 1 }],
  signature: "33".repeat(64),
  loadStarted: false,
  state,
  createdAt: 1,
  updatedAt: 1,
})

const saveTidies = (records: TidyRecord[]) =>
  Keychain.setInternetCredentials(
    TOPUPS,
    "topups",
    JSON.stringify({ format: 3, records }),
  )

beforeEach(async () => {
  jest.clearAllMocks()
  await Keychain.resetInternetCredentials({ server: TOPUPS })
  await Keychain.resetInternetCredentials({ server: ARCHIVE })
  store.dispatch(resetFlashcardV2())
  mockFeePpk.mockResolvedValue(0)
  mockOwnerKeyFor.mockResolvedValue(OWNER)
  mockReclaimVerdicts.mockResolvedValue(VERDICTS)
  mockRunTidy.mockResolvedValue({ status: "tidied", record: {} })
  // The tap: the op run with a transceiver of its own, and the provider's
  // progress reporter.
  mockRunCardOperation.mockImplementation(async (op) => op(jest.fn(), mockReport))
})

describe("useCardTidy", () => {
  it("asks the mint and finds the owner key before the tap, then tidies the card on screen under the owner's grant", async () => {
    const cashuCard = card()
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })

    await act(async () => {
      await expect(result.current.tidy()).resolves.toEqual({
        status: "tidied",
        record: {},
      })
    })

    expect(mockFeePpk).toHaveBeenCalledWith(KEYSET)
    expect(mockReclaimVerdicts).toHaveBeenCalledWith(
      expect.anything(),
      cashuCard.pubkey,
      [SPENT],
    )
    expect(mockRunCardOperation).toHaveBeenCalledWith(
      expect.any(Function),
      cashuCard.pubkey,
      { rereadSlots: true },
    )
    const [, args] = mockRunTidy.mock.calls[0]
    expect(args).toMatchObject({
      card: { pubkey: cashuCard.pubkey, maxSlots: cashuCard.maxSlots },
      keysetId: KEYSET,
      feePpk: 0,
      verdicts: VERDICTS,
      verifyPin: undefined,
    })
    // The grant opens the load, with the owner's key.
    await args.openForLoading("transceive")
    expect(mockAllowLoad).toHaveBeenCalledWith("transceive", expect.any(Function))
  })

  it("finishes a tidy still owed with the mint's fee never asked: its keyset is rotated out", async () => {
    const cashuCard = card()
    await saveTidies([saved("owed", "swapped", cashuCard.pubkey)])
    mockFeePpk.mockRejectedValue(new Error("keyset 0059534ce0bfa19a is not active"))
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await waitFor(() => expect(result.current.records).toHaveLength(1))

    await act(async () => {
      await expect(result.current.tidy()).resolves.toEqual({
        status: "tidied",
        record: {},
      })
    })

    expect(mockFeePpk).not.toHaveBeenCalled()
    expect(mockRunTidy).toHaveBeenCalledTimes(1)
    const [, args] = mockRunTidy.mock.calls[0]
    // No new tidy can start in this tap: no keyset's fee was asked.
    expect(args).toMatchObject({ keysetId: undefined, feePpk: 0 })
  })

  it("still asks the fee for a new tidy when the card's only tidy is kept for a human", async () => {
    const cashuCard = card()
    await saveTidies([saved("stuck", "needs-card", cashuCard.pubkey)])
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await result.current.tidy()
    })
    expect(mockFeePpk).toHaveBeenCalledWith(KEYSET)
    expect(mockRunTidy.mock.calls[0][1]).toMatchObject({ keysetId: KEYSET })
  })

  it("verifies the PIN the screen asked for in the tap, in the form the card takes", async () => {
    const cashuCard = card()
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await result.current.tidy({ pin: "1234" })
    })
    const [, args] = mockRunTidy.mock.calls[0]
    await args.verifyPin("transceive")
    expect(mockVerifyCardPin).toHaveBeenCalledWith("transceive", "1234", {
      sealed: cashuCard.sealed,
      cardPubkey: cashuCard.pubkey,
    })
  })

  it("refuses before the tap with neither the owner's key nor the PIN on a card that has one: nothing is burned", async () => {
    mockOwnerKeyFor.mockResolvedValue(undefined)
    const cashuCard = card({ pinState: "set" })
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await expect(result.current.tidy()).rejects.toMatchObject({
        reason: "not-owner",
      })
    })
    // No tap at all: SPEND_ALL_SIGN never reaches the card.
    expect(mockRunCardOperation).not.toHaveBeenCalled()
    expect(mockRunTidy).not.toHaveBeenCalled()
    expect(mockAllowLoad).not.toHaveBeenCalled()
  })

  it("refuses the same way when the owner key cannot be read from the Keychain", async () => {
    mockOwnerKeyFor.mockRejectedValue(new Error("Keychain read failed"))
    const cashuCard = card({ pinState: "set" })
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await expect(result.current.tidy()).rejects.toMatchObject({
        reason: "not-owner",
      })
    })
    expect(mockRunTidy).not.toHaveBeenCalled()
  })

  it("taps with the PIN and no owner key, and with neither on a card with no PIN", async () => {
    mockOwnerKeyFor.mockResolvedValue(undefined)
    const withPin = card({ pinState: "set" })
    const { result, rerender } = renderHook(({ c }) => useCardTidy(c), {
      wrapper,
      initialProps: { c: withPin },
    })
    await act(async () => {
      await result.current.tidy({ pin: "1234" })
    })
    expect(mockRunTidy).toHaveBeenCalledTimes(1)

    rerender({ c: card({ pinState: "unset" }) })
    await act(async () => {
      await result.current.tidy()
    })
    expect(mockRunTidy).toHaveBeenCalledTimes(2)
    const [, args] = mockRunTidy.mock.calls[1]
    await expect(args.openForLoading("transceive")).resolves.toBeUndefined()
  })

  it("shows the read's offer until Not now, which holds for those pieces only", async () => {
    let cashuCard = card()
    const { result, rerender } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await waitFor(() => expect(result.current.offer).toEqual(OFFER))

    act(() => result.current.notNow())
    await waitFor(() => expect(result.current.offer).toBeUndefined())

    cashuCard = card({ tidyOffer: { ...OFFER, fingerprint: "pieces-2" } })
    rerender({})
    expect(result.current.offer).toMatchObject({ fingerprint: "pieces-2" })
  })

  it("holds the offer back for a tidy still owed, not for one kept for a human", async () => {
    const cashuCard = card()
    await saveTidies([saved("stuck", "needs-card", cashuCard.pubkey)])
    const { result, unmount } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await waitFor(() => expect(result.current.records).toHaveLength(1))
    expect(result.current.offer).toEqual(OFFER)
    unmount()

    await saveTidies([
      saved("stuck", "needs-card", cashuCard.pubkey),
      saved("owed", "signed", cashuCard.pubkey),
    ])
    const owed = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await waitFor(() => expect(owed.result.current.records).toHaveLength(2))
    expect(owed.result.current.offer).toBeUndefined()
  })

  it("Finish with no tidy still owed taps nothing and starts no tidy: the listed one was given up since", async () => {
    const cashuCard = card()
    // The list showed it signed; a minter pass has since kept it for a human.
    await saveTidies([saved("gone", "needs-card", cashuCard.pubkey)])
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })

    await act(async () => {
      await expect(result.current.tidy({ finishOnly: true })).resolves.toEqual({
        status: "skipped",
        reason: "at-target",
      })
    })

    // No tap, so no SPEND_ALL_BEGIN; no fee asked for a tidy never offered.
    expect(mockRunCardOperation).not.toHaveBeenCalled()
    expect(mockRunTidy).not.toHaveBeenCalled()
    expect(mockFeePpk).not.toHaveBeenCalled()
    expect(result.current.records).toEqual([
      expect.objectContaining({ id: "gone", state: "needs-card" }),
    ])
  })

  it("Finish with a tidy still owed finishes it, with no keyset a new tidy could plan in", async () => {
    const cashuCard = card()
    await saveTidies([saved("owed", "signed", cashuCard.pubkey)])
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })

    await act(async () => {
      await result.current.tidy({ pin: "1234", finishOnly: true })
    })

    expect(mockRunTidy).toHaveBeenCalledTimes(1)
    expect(mockRunTidy.mock.calls[0][1]).toMatchObject({ keysetId: undefined })
    expect(mockFeePpk).not.toHaveBeenCalled()
  })

  it("nudges the minter when the tap throws: a tidy it signed is swapped without the card", async () => {
    const cashuCard = card()
    mockRunTidy.mockRejectedValue(new Error("Network request failed"))
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await expect(result.current.tidy()).rejects.toThrow("Network request failed")
    })
    expect(mockNudge).toHaveBeenCalledTimes(1)
  })

  it("nudges the minter when a tap that ran leaves a tidy signed, and not when none is left", async () => {
    const cashuCard = card()
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await result.current.tidy()
    })
    // Nothing saved: nothing for the minter.
    await act(async () => undefined)
    expect(mockNudge).not.toHaveBeenCalled()

    // The tap's swap did not come back: the tidy stays signed.
    mockRunTidy.mockImplementation(async () => {
      await saveTidies([saved("left", "signed", cashuCard.pubkey)])
      return { status: "unfinished", record: {} }
    })
    await act(async () => {
      await result.current.tidy()
    })
    await waitFor(() => expect(mockNudge).toHaveBeenCalledTimes(1))
  })

  it("dismisses a tidy kept for a human: off the list, into the archive with its signature", async () => {
    const cashuCard = card()
    await saveTidies([saved("stuck", "needs-card", cashuCard.pubkey)])
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await waitFor(() => expect(result.current.records).toHaveLength(1))

    await act(async () => {
      await result.current.dismiss(result.current.records[0])
    })

    expect(result.current.records).toEqual([])
    const archived = await Keychain.getInternetCredentials(ARCHIVE)
    expect(archived && JSON.parse(archived.password).records).toEqual([
      expect.objectContaining({ id: "stuck", signature: "33".repeat(64) }),
    ])
    const list = await Keychain.getInternetCredentials(TOPUPS)
    expect(list && JSON.parse(list.password)).toEqual({ format: 2, records: [] })
  })

  describe("progress (ENG-706)", () => {
    /** A tidy that reports making 3 of 7 and waits; `finish` settles it. */
    const reportingTidy = () => {
      const settle: { resolve?: () => void; reject?: (err: Error) => void } = {}
      mockRunTidy.mockImplementation(
        (_deps: unknown, args: RunTidyArgs) =>
          new Promise((resolve, reject) => {
            args.onProgress?.({ stage: "making", done: 3, total: 7 })
            settle.resolve = () => resolve({ status: "tidied", record: {} })
            settle.reject = reject
          }),
      )
      return settle
    }

    it("shows where the tap's tidy has got to, on the screen and the NFC sheet", async () => {
      const settle = reportingTidy()
      const { result } = renderHook(() => useCardTidy(card()), { wrapper })
      let tap: Promise<unknown> | undefined
      act(() => {
        tap = result.current.tidy()
      })

      await waitFor(() =>
        expect(result.current.progress).toEqual({ stage: "making", done: 3, total: 7 }),
      )
      expect(mockReport).toHaveBeenCalledWith(
        "Making pieces (3 of 7)… Keep holding the card",
      )

      await act(async () => {
        settle.resolve?.()
        await tap
      })
      expect(result.current.progress).toBeUndefined()
    })

    it("clears the progress when the tap throws", async () => {
      const settle = reportingTidy()
      const { result } = renderHook(() => useCardTidy(card()), { wrapper })
      let tap: Promise<unknown> | undefined
      act(() => {
        tap = result.current.tidy().catch(() => undefined)
      })
      await waitFor(() => expect(result.current.progress).toBeDefined())

      await act(async () => {
        settle.reject?.(new Error("Tag was lost"))
        await tap
      })
      expect(result.current.progress).toBeUndefined()
    })

    it("still tidies when its op is run without a reporter", async () => {
      mockRunTidy.mockImplementation(async (_deps: unknown, args: RunTidyArgs) => {
        args.onProgress?.({ stage: "reading" })
        return { status: "tidied", record: {} }
      })
      mockRunCardOperation.mockImplementation(async (op) => op(jest.fn()))
      const { result } = renderHook(() => useCardTidy(card()), { wrapper })
      await act(async () => {
        await expect(result.current.tidy()).resolves.toMatchObject({ status: "tidied" })
      })
      expect(mockRunTidy.mock.calls[0][1].onProgress).toEqual(expect.any(Function))
      expect(mockReport).not.toHaveBeenCalled()
    })

    it("words every stage", () => {
      expect(tidyProgressText({ stage: "reading" }, LL)).toBe("Reading the card…")
      expect(tidyProgressText({ stage: "making", done: 0, total: 5 }, LL)).toBe(
        "Making pieces (0 of 5)…",
      )
      expect(tidyProgressText({ stage: "mint" }, LL)).toBe("Waiting for the mint…")
      expect(tidyProgressText({ stage: "loading", done: 2, total: 5 }, LL)).toBe(
        "Loading pieces (2 of 5)…",
      )
      expect(tidyProgressText({ stage: "done" }, LL)).toBe(
        "Pieces loaded. Checking the card…",
      )
    })
  })
})
