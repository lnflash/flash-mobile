import * as React from "react"
import { Alert, Text } from "react-native"
import { render, screen } from "@testing-library/react-native"

import { BreezProvider } from "@app/contexts/BreezContext"
import { useBreez } from "@app/hooks/useBreez"

const mockInitializeBreezSDK = jest.fn()
const mockGetInfo = jest.fn()
const mockGetLightningAddress = jest.fn()
const mockRegisterLightningAddress = jest.fn()

// Only what BreezProvider imports. The Liquid-to-Spark migration is gone, so
// a provider that still reached for it would find nothing here and fail.
jest.mock("@app/utils/breez-sdk", () => ({
  initializeBreezSDK: () => mockInitializeBreezSDK(),
  getInfo: () => mockGetInfo(),
  getLightningAddress: () => mockGetLightningAddress(),
  registerLightningAddress: (...args: unknown[]) => mockRegisterLightningAddress(...args),
}))

const mockUpdateState = jest.fn()
let mockPersistentState: Record<string, unknown> = {}
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    persistentState: mockPersistentState,
    updateState: mockUpdateState,
  }),
}))

jest.mock("@app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: { galoyInstance: { lnAddressHostname: "flashapp.me" } },
  }),
}))

jest.mock("@app/graphql/is-authed-context", () => ({ useIsAuthed: () => true }))

const mockUpdateExternalWallet = jest.fn()
jest.mock("@app/graphql/generated", () => ({
  useAddressScreenQuery: () => ({ data: { me: { username: "alice" } } }),
  useUpdateExternalWalletMutation: () => [mockUpdateExternalWallet],
}))

const Probe = () => {
  const { loading, btcWallet } = useBreez()
  return (
    <Text>{`${loading ? "loading" : "ready"}:${btcWallet.balance}:${btcWallet.id}`}</Text>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
  mockInitializeBreezSDK.mockResolvedValue(true)
  mockGetInfo.mockResolvedValue({ balanceSats: 2100, tokenBalances: new Map() })
  mockGetLightningAddress.mockResolvedValue({ lnurl: { bech32: "lnurl1existing" } })
  mockUpdateExternalWallet.mockResolvedValue({
    data: { updateExternalWallet: { errors: [], walletId: "btc-wallet-1" } },
  })
})

describe("BreezProvider", () => {
  it("starts the BTC wallet on a phone that never finished the Liquid migration, as on any other", async () => {
    // A phone that never completed the old Liquid-to-Spark migration still
    // has this flag saved. It used to send every launch through the Liquid
    // SDK and then read the balance again. It no longer means anything.
    mockPersistentState = {
      isAdvanceMode: true,
      breezBalance: 0,
      sparkMigrationCompleted: false,
    }

    render(
      <BreezProvider>
        <Probe />
      </BreezProvider>,
    )

    expect(await screen.findByText("ready:2100:btc-wallet-1")).toBeTruthy()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(mockInitializeBreezSDK).toHaveBeenCalledTimes(1)
    expect(mockGetInfo).toHaveBeenCalledTimes(1)
    expect(mockRegisterLightningAddress).not.toHaveBeenCalled()
    expect(mockUpdateExternalWallet).toHaveBeenCalledWith({
      variables: { input: { lnurlp: "lnurl1existing" } },
    })

    // Startup saves the balance and nothing else; the migration flag is
    // never written back.
    const saved = mockUpdateState.mock.calls.map(([update]) => update({}))
    expect(saved).toEqual([{ breezBalance: 2100 }])
  })

  it("leaves the BTC wallet alone when advanced mode is off", async () => {
    mockPersistentState = { isAdvanceMode: false, sparkMigrationCompleted: false }

    render(
      <BreezProvider>
        <Probe />
      </BreezProvider>,
    )

    expect(await screen.findByText("ready:0:")).toBeTruthy()
    expect(mockInitializeBreezSDK).not.toHaveBeenCalled()
    expect(mockGetInfo).not.toHaveBeenCalled()
    expect(mockUpdateState).not.toHaveBeenCalled()
  })
})
