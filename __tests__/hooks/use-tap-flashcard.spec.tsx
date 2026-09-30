/**
 * ENG-616: every card tap in the app is routed in one place, by what was
 * tapped, and the two "open my card" entry points share one rule.
 */
import { act, renderHook } from "@testing-library/react-native"

import type { FlashcardReadResult } from "@app/contexts/Flashcard"
import {
  type TapFlashcardOptions,
  useOpenFlashcard,
  useTapFlashcard,
} from "@app/hooks/use-tap-flashcard"

const mockNavigate = jest.fn()
const mockReadFlashcard = jest.fn<Promise<FlashcardReadResult>, []>()
let mockFlashcard: { lnurl?: string; cashuCard?: { pubkey: string } } = {}

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))
jest.mock("@app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({ ...mockFlashcard, readFlashcard: mockReadFlashcard }),
}))

const CASHU_CARD = { pubkey: "02" + "ab".repeat(32) } as FlashcardReadResult["cashuCard"]

beforeEach(() => {
  jest.clearAllMocks()
  mockFlashcard = {}
})

const tap = async (options?: TapFlashcardOptions) => {
  const { result } = renderHook(() => useTapFlashcard(options))
  let read: FlashcardReadResult = {}
  await act(async () => {
    read = await result.current()
  })
  return read
}

describe("useTapFlashcard", () => {
  it("opens the Cashu screen when the tap read a Cashu card", async () => {
    mockReadFlashcard.mockResolvedValue({ cashuCard: CASHU_CARD })

    const read = await tap()

    expect(mockReadFlashcard).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2")
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(read.cashuCard).toBe(CASHU_CARD)
  })

  it("opens the BoltCard screen when the tap read a BoltCard", async () => {
    mockReadFlashcard.mockResolvedValue({ boltCard: true })

    await tap()

    expect(mockNavigate).toHaveBeenCalledWith("Card")
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it("goes nowhere when the tap read nothing (cancelled, unreadable, NFC off)", async () => {
    mockReadFlashcard.mockResolvedValue({})

    await tap()

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe("useTapFlashcard({ openBoltCard: false }): the Home tile's sync", () => {
  // On main that control re-read the card and refreshed the tile in place;
  // the tile body is what opens Card.
  it("refreshes a BoltCard in place: the tap reads it and opens nothing", async () => {
    mockReadFlashcard.mockResolvedValue({ boltCard: true })

    const read = await tap({ openBoltCard: false })

    expect(mockReadFlashcard).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(read).toEqual({ boltCard: true })
  })

  it("still opens the Cashu screen for a Cashu card, which nothing else shows", async () => {
    mockReadFlashcard.mockResolvedValue({ cashuCard: CASHU_CARD })

    await tap({ openBoltCard: false })

    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2")
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it("goes nowhere when the tap read nothing", async () => {
    mockReadFlashcard.mockResolvedValue({})

    await tap({ openBoltCard: false })

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe("useOpenFlashcard: one rule for the Home tile and the Settings row", () => {
  const open = async () => {
    const { result } = renderHook(() => useOpenFlashcard())
    await act(async () => {
      await result.current()
    })
  }

  it("opens a linked BoltCard without a tap", async () => {
    mockFlashcard = { lnurl: "lnurl1CARD" }

    await open()

    expect(mockNavigate).toHaveBeenCalledWith("Card")
    expect(mockReadFlashcard).not.toHaveBeenCalled()
  })

  it("puts the linked BoltCard first when the phone also holds a Cashu card", async () => {
    // The Home tile only exists for a linked BoltCard and shows its balance,
    // so it must open that card; Settings follows the same rule.
    mockFlashcard = { lnurl: "lnurl1CARD", cashuCard: CASHU_CARD }

    await open()

    expect(mockNavigate).toHaveBeenCalledWith("Card")
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it("opens the Cashu card read this session when no BoltCard is linked", async () => {
    mockFlashcard = { cashuCard: CASHU_CARD }

    await open()

    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2")
    expect(mockReadFlashcard).not.toHaveBeenCalled()
  })

  it("asks for a tap, routed by what was tapped, when it holds no card", async () => {
    mockReadFlashcard.mockResolvedValue({ cashuCard: CASHU_CARD })

    await open()

    expect(mockReadFlashcard).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2")
  })
})
