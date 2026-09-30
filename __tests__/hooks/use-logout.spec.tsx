/**
 * useLogout — cleanUp must wipe the ENG-608 ID captures from disk.
 *
 * `resetAccountUpgrade` drops every path the slice held, so if the files are
 * still under <documents>/idv/ nothing references them again: photos of a
 * government ID left in an iOS-backed-up directory for the next account on
 * the phone. The directory has to go, and it has to go before the slice
 * forgets it existed.
 */
import { renderHook, act } from "@testing-library/react-native"

const mockDispatch = jest.fn()
const mockResetState = jest.fn()
const mockResetFlashcard = jest.fn()
const mockForgetCashuCard = jest.fn()
const mockCacheReset = jest.fn(() => Promise.resolve())
const mockDisconnect = jest.fn(() => Promise.resolve())
const mockRemoveIdentityDir = jest.fn(() => Promise.resolve())
const mockUserLogoutMutation = jest.fn()

jest.mock("@app/store/redux", () => ({
  useAppDispatch: () => mockDispatch,
}))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({ resetState: mockResetState }),
}))
jest.mock("@app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({
    resetFlashcard: mockResetFlashcard,
    forgetCashuCard: mockForgetCashuCard,
  }),
}))
jest.mock("@apollo/client", () => ({
  useApolloClient: () => ({ cache: { reset: mockCacheReset } }),
}))
jest.mock("@app/graphql/generated", () => ({
  useUserLogoutMutation: () => [mockUserLogoutMutation],
}))
jest.mock("@app/utils/breez-sdk", () => ({
  disconnectToSDK: () => mockDisconnect(),
}))
jest.mock("@app/utils/identity-files", () => ({
  removeIdentityDir: () => mockRemoveIdentityDir(),
}))
jest.mock("@app/utils/storage/secureStorage", () => ({
  __esModule: true,
  default: {
    removeIsBiometricsEnabled: jest.fn(() => Promise.resolve()),
    removePin: jest.fn(() => Promise.resolve()),
    removePinAttempts: jest.fn(() => Promise.resolve()),
  },
}))

import useLogout from "@app/hooks/use-logout"

beforeEach(() => {
  jest.clearAllMocks()
})

describe("useLogout cleanUp", () => {
  it("wipes the idv directory before the slice forgets the captures", async () => {
    const order: string[] = []
    mockRemoveIdentityDir.mockImplementation(() => {
      order.push("removeIdentityDir")
      return Promise.resolve()
    })
    mockDispatch.mockImplementation((action: { type: string }) => {
      order.push(action.type)
    })

    const { result } = renderHook(() => useLogout())
    await act(async () => {
      await result.current.cleanUp()
    })

    expect(mockRemoveIdentityDir).toHaveBeenCalledTimes(1)
    expect(order.indexOf("removeIdentityDir")).toBeGreaterThanOrEqual(0)
    expect(order.indexOf("removeIdentityDir")).toBeLessThan(
      order.indexOf("accountUpgrade/resetAccountUpgrade"),
    )
    expect(mockResetState).toHaveBeenCalledTimes(1)
    expect(mockResetFlashcard).toHaveBeenCalledTimes(1)
  })

  it("forgets every Cashu card this phone read, so the next account starts with none (ENG-616)", async () => {
    const { result } = renderHook(() => useLogout())
    await act(async () => {
      await result.current.cleanUp()
    })

    // The card on screen, and the persisted record of every card read.
    expect(mockForgetCashuCard).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "flashcardV2/resetFlashcardV2" }),
    )
  })
})
