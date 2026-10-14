/**
 * ENG-702: the card screen's tidy, wired to the app. What it pins:
 *   - the mint's fee and the spent slots' verdicts are asked before the tap,
 *     and the owner key found before it, so the card session never waits on
 *     them;
 *   - the tap runs the tidy on the card on screen, with the PIN (verified
 *     before SPEND_ALL_BEGIN) only when the screen asked for it, and the
 *     change loaded under the owner's grant;
 *   - the re-read after it reads the pieces again (a tidy moves no balance);
 *   - "Not now" is remembered for the pieces it was said to.
 */
import * as React from "react"
import { Provider } from "react-redux"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { CashuCardState } from "../../app/contexts/Flashcard"
import { useCardTidy } from "../../app/hooks/use-card-tidy"
import { store } from "../../app/store/redux"
import { resetFlashcardV2 } from "../../app/store/redux/slices/flashcardV2Slice"
import type { TidyOffer } from "../../app/utils/cashu-card-topup"
import { cashuCardState } from "../helpers/cashu-card-state"

const mockRunCardOperation = jest.fn()
const mockRunTidy = jest.fn()
const mockVerifyCardPin = jest.fn()
const mockAllowLoad = jest.fn()
const mockOwnerKeyFor = jest.fn()
const mockReclaimVerdicts = jest.fn()
const mockFeePpk = jest.fn()

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

beforeEach(() => {
  jest.clearAllMocks()
  store.dispatch(resetFlashcardV2())
  mockFeePpk.mockResolvedValue(0)
  mockOwnerKeyFor.mockResolvedValue(OWNER)
  mockReclaimVerdicts.mockResolvedValue(VERDICTS)
  mockRunTidy.mockResolvedValue({ status: "tidied", record: {} })
  // The tap: the op run with a transceiver of its own.
  mockRunCardOperation.mockImplementation(async (op) => op(jest.fn()))
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
      feePpk: 0,
      verdicts: VERDICTS,
      verifyPin: undefined,
    })
    // The grant opens the load, with the owner's key.
    await args.openForLoading("transceive")
    expect(mockAllowLoad).toHaveBeenCalledWith("transceive", expect.any(Function))
  })

  it("verifies the PIN the screen asked for in the tap, in the form the card takes", async () => {
    const cashuCard = card()
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await result.current.tidy("1234")
    })
    const [, args] = mockRunTidy.mock.calls[0]
    await args.verifyPin("transceive")
    expect(mockVerifyCardPin).toHaveBeenCalledWith("transceive", "1234", {
      sealed: cashuCard.sealed,
      cardPubkey: cashuCard.pubkey,
    })
  })

  it("refuses to load with neither the owner's key nor the PIN on a card that has one", async () => {
    mockOwnerKeyFor.mockResolvedValue(undefined)
    const cashuCard = card({ pinState: "set" })
    const { result } = renderHook(() => useCardTidy(cashuCard), { wrapper })
    await act(async () => {
      await result.current.tidy()
    })
    const [, args] = mockRunTidy.mock.calls[0]
    await expect(args.openForLoading("transceive")).rejects.toMatchObject({
      reason: "not-owner",
    })
    expect(mockAllowLoad).not.toHaveBeenCalled()
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
})
