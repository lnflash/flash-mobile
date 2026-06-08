import { act, renderHook } from "@testing-library/react-hooks"
import { useBridgeKyc } from "@app/hooks/useBridgeKyc"

const mockInitiateBridgeKyc = jest.fn()
const mockToggleActivityIndicator = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  useBridgeInitiateKycMutation: () => [mockInitiateBridgeKyc],
}))

jest.mock("@app/hooks/useActivityIndicator", () => ({
  useActivityIndicator: () => ({
    toggleActivityIndicator: mockToggleActivityIndicator,
  }),
}))

describe("useBridgeKyc", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("opens the Bridge KYC modal and navigates to the KYC web view after submit", async () => {
    const navigate = jest.fn()
    mockInitiateBridgeKyc.mockResolvedValue({
      data: {
        bridgeInitiateKyc: {
          errors: [],
          kycLink: {
            tosLink: "https://bridge.example/tos",
            kycLink: "https://bridge.example/kyc",
          },
        },
      },
    })

    const { result } = renderHook(() => useBridgeKyc({ navigation: { navigate } }))

    act(() => {
      result.current.openBridgeKycModal()
    })

    expect(result.current.bridgeKycModalVisible).toBe(true)

    await act(async () => {
      await result.current.submitBridgeKyc({
        fullName: "Dread Pirate",
        email: "dread@example.com",
        kycType: "individual",
      })
    })

    expect(result.current.bridgeKycModalVisible).toBe(false)
    expect(mockToggleActivityIndicator).toHaveBeenCalledWith(true)
    expect(mockToggleActivityIndicator).toHaveBeenCalledWith(false)
    expect(mockInitiateBridgeKyc).toHaveBeenCalledWith({
      variables: {
        input: {
          // eslint-disable-next-line camelcase
          full_name: "Dread Pirate",
          email: "dread@example.com",
          type: "individual",
        },
      },
    })
    expect(navigate).toHaveBeenCalledWith("BridgeKycWebView", {
      tosLink: "https://bridge.example/tos",
      kycLink: "https://bridge.example/kyc",
    })
  })
})
