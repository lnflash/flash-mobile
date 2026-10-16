import * as React from "react"
import { Alert, Text } from "react-native"
import { render, screen, waitFor } from "@testing-library/react-native"

import { BreezProvider } from "@app/contexts/BreezContext"
import { useBreez } from "@app/hooks/useBreez"
import { breezBtcRail } from "@app/payments/btc-rail"
import { BreezSdkNotInitializedError } from "@app/utils/breez-sdk/sdk-errors"

const mockInitializeBreezSDK = jest.fn()
const mockGetInfo = jest.fn()
const mockGetLightningAddress = jest.fn()
const mockRegisterLightningAddress = jest.fn()
const mockMarkSwitchedOff = jest.fn()
const mockMarkSwitchedOn = jest.fn()

// Only what BreezProvider imports. The Liquid-to-Spark migration is gone, so
// a provider that still reached for it would find nothing here and fail.
jest.mock("@app/utils/breez-sdk", () => ({
  initializeBreezSDK: () => mockInitializeBreezSDK(),
  getInfo: () => mockGetInfo(),
  getLightningAddress: () => mockGetLightningAddress(),
  registerLightningAddress: (...args: unknown[]) => mockRegisterLightningAddress(...args),
  markBreezSDKSwitchedOff: () => mockMarkSwitchedOff(),
  markBreezSDKSwitchedOn: () => mockMarkSwitchedOn(),
  // Read by breezBtcRail's reads, which the provider's balance goes through.
  // Switched on: the provider reads the wallet only in advanced mode.
  assertBreezSDKSwitchedOn: () => undefined,
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

  it("switches the BTC wallet off when advanced mode is off", async () => {
    // ENG-687: nothing stops the SDK when advanced mode goes off, and a start
    // may still be retrying. The switch is what has the BTC rail answer
    // `disabled`, not a balance or "couldn't start", as the screens hide the
    // wallet.
    mockPersistentState = { isAdvanceMode: false }

    render(
      <BreezProvider>
        <Probe />
      </BreezProvider>,
    )

    expect(await screen.findByText("ready:0:")).toBeTruthy()
    expect(mockMarkSwitchedOff).toHaveBeenCalledTimes(1)
    expect(mockMarkSwitchedOn).not.toHaveBeenCalled()
  })

  it("switches the BTC wallet on before it starts the SDK", async () => {
    mockPersistentState = { isAdvanceMode: true, breezBalance: 0 }

    render(
      <BreezProvider>
        <Probe />
      </BreezProvider>,
    )

    expect(await screen.findByText("ready:2100:btc-wallet-1")).toBeTruthy()
    expect(mockMarkSwitchedOff).not.toHaveBeenCalled()
    expect(mockMarkSwitchedOn).toHaveBeenCalledTimes(1)
    expect(mockMarkSwitchedOn.mock.invocationCallOrder[0]).toBeLessThan(
      mockInitializeBreezSDK.mock.invocationCallOrder[0],
    )
  })

  it("switches the wallet back on when advanced mode returns while a start is still connecting", async () => {
    // On, off and on again before the first start answers. The second turn-on
    // finds that start in flight and leaves it be, and must still switch the
    // wallet back on.
    let finishStart: (started: boolean) => void = () => undefined
    mockInitializeBreezSDK.mockReturnValue(
      new Promise((resolve) => {
        finishStart = resolve
      }),
    )
    mockPersistentState = { isAdvanceMode: true, breezBalance: 0 }
    // A new element each time, so the provider renders again with the
    // persistent state as it now is.
    const tree = () => (
      <BreezProvider>
        <Probe />
      </BreezProvider>
    )
    const { rerender } = render(tree())
    expect(await screen.findByText("loading:0:")).toBeTruthy()

    mockPersistentState = { isAdvanceMode: false, breezBalance: 0 }
    rerender(tree())
    mockPersistentState = { isAdvanceMode: true, breezBalance: 0 }
    rerender(tree())

    expect(mockMarkSwitchedOff).toHaveBeenCalledTimes(1)
    expect(mockMarkSwitchedOn).toHaveBeenCalledTimes(2)
    expect(mockMarkSwitchedOn.mock.invocationCallOrder[1]).toBeGreaterThan(
      mockMarkSwitchedOff.mock.invocationCallOrder[0],
    )
    // The first start is still the only one.
    expect(mockInitializeBreezSDK).toHaveBeenCalledTimes(1)

    finishStart(true)
    expect(await screen.findByText("ready:2100:btc-wallet-1")).toBeTruthy()
  })

  it("reads its balance through the BTC rail, so it and getBalanceSats report the same sats", async () => {
    // ENG-687, one BTC balance source: the SDK answers balanceSats as a
    // bigint, and the home screen and the assistant must turn the same
    // answer into the same number.
    mockPersistentState = { isAdvanceMode: true, breezBalance: 0 }
    mockGetInfo.mockResolvedValue({
      balanceSats: BigInt(123456),
      tokenBalances: new Map(),
    })

    render(
      <BreezProvider>
        <Probe />
      </BreezProvider>,
    )

    expect(await screen.findByText("ready:123456:btc-wallet-1")).toBeTruthy()
    await expect(breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "ok",
      sats: 123456,
    })
    const saved = mockUpdateState.mock.calls.map(([update]) => update({}))
    expect(saved).toEqual([{ breezBalance: 123456 }])
  })

  it("keeps the last balance when the wallet is not running at the read", async () => {
    // initializeBreezSDK() answered, but by the read the SDK instance is gone
    // (disconnected in between). getInfo() used to throw out of the init path
    // here, which raised "BTC wallet initialization failed" and skipped the
    // Lightning address. The rail reports `disabled` instead, and the
    // provider keeps the figure it had rather than writing a zero over it.
    mockPersistentState = { isAdvanceMode: true, breezBalance: 777 }
    mockGetInfo.mockRejectedValue(new BreezSdkNotInitializedError())

    render(
      <BreezProvider>
        <Probe />
      </BreezProvider>,
    )

    expect(await screen.findByText("ready:777:btc-wallet-1")).toBeTruthy()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(mockUpdateState).not.toHaveBeenCalled()
  })

  it("still reports any other read failure as before", async () => {
    mockPersistentState = { isAdvanceMode: true, breezBalance: 777 }
    mockGetInfo.mockRejectedValue(new Error("connection reset"))

    render(
      <BreezProvider>
        <Probe />
      </BreezProvider>,
    )

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "BTC wallet initialization failed",
        "Error: connection reset",
      ),
    )
    expect(mockUpdateState).not.toHaveBeenCalled()
  })
})
