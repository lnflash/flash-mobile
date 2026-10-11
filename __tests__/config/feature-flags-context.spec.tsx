/**
 * ENG-634: the signed-out startup gate on Remote Config is bounded.
 *
 * FeatureFlagContextProvider renders nothing for a signed-out app until Remote
 * Config is ready. Before the bound, "ready" meant fetchAndActivate() settled,
 * which on a slow or dead network took the fetch's 60 s HTTP timeout or never
 * happened, so the app sat on the splash. Now the gate opens on whichever comes
 * first: the fetch settling or REMOTE_CONFIG_GATE_MS. A fetch that lands after
 * the gate opened still updates the flags.
 *
 * Until the fetch lands, the flags are the ACTIVE values: what a previous
 * launch fetched and activated, else the hard-coded defaults. RN Firebase's JS
 * cache is empty (every key "static") until the native side answers
 * setDefaults, so a static key reads as its default, not as false.
 */
import * as React from "react"
import { Text } from "react-native"
import { act, render } from "@testing-library/react-native"
import { getRemoteConfig } from "@react-native-firebase/remote-config"

import {
  FeatureFlagContextProvider,
  REMOTE_CONFIG_GATE_MS,
  useFeatureFlags,
} from "../../app/config/feature-flags-context"

let mockCurrentLevel = "NonAuth"
jest.mock("@app/graphql/level-context", () => ({
  useLevel: () => ({ currentLevel: mockCurrentLevel }),
}))

jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({ appConfig: { galoyInstance: { id: "Main" } } }),
}))

// The mock in __mocks__/@react-native-firebase/remote-config.js is one shared
// object; each test sets what fetchAndActivate and getValue do.
const remoteConfig = getRemoteConfig() as unknown as {
  fetchAndActivate: jest.Mock
  getValue: jest.Mock
}

// Every key reads the opposite of its default once "fetched", so a fetched
// value is told apart from a default one.
const FETCHED: Record<string, boolean> = {
  deviceAccountEnabledRestAuth: false,
  bridgeTopupEnabled: true,
  cashuCardUsdEnabled: true,
}

// What RN Firebase's JS cache holds, as getValue reads it: undefined is a key
// it does not hold yet (source "static", asBoolean false).
let active: Record<string, boolean | undefined> = {}

type Deferred = { resolve: () => void; reject: (err: Error) => void }

const deferFetch = (): Deferred => {
  const deferred = {} as Deferred
  remoteConfig.fetchAndActivate.mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => {
        deferred.resolve = () => {
          // fetchAndActivate's constants replace the cache before it resolves.
          active = { ...FETCHED }
          resolve()
        }
        deferred.reject = reject
      }),
  )
  return deferred
}

const Flags = () => {
  const flags = useFeatureFlags()
  return (
    <Text testID="flags">
      {`device:${flags.deviceAccountEnabled} bridge:${flags.bridgeTopupEnabled} usd:${flags.cashuCardUsdEnabled}`}
    </Text>
  )
}

const DEFAULT_FLAGS = "device:true bridge:false usd:false"
const FETCHED_FLAGS = "device:false bridge:true usd:true"

const renderProvider = () =>
  render(
    <FeatureFlagContextProvider>
      <Flags />
    </FeatureFlagContextProvider>,
  )

// Let the provider's async effect run past an awaited promise.
const flush = () => act(async () => {})

describe("FeatureFlagContextProvider startup gate", () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    mockCurrentLevel = "NonAuth"
    remoteConfig.fetchAndActivate.mockReset()
    remoteConfig.getValue.mockReset()
    active = {}
    remoteConfig.getValue.mockImplementation((key: string) => ({
      asBoolean: () => active[key] ?? false,
      getSource: () => (active[key] === undefined ? "static" : "remote"),
    }))
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    jest.useRealTimers()
  })

  it("exports a gate of about five seconds", () => {
    expect(REMOTE_CONFIG_GATE_MS).toBe(5000)
  })

  it("renders children once a fast fetch resolves, with the fetched flags", async () => {
    const fetch = deferFetch()
    const screen = renderProvider()

    await flush()
    expect(screen.queryByTestId("flags")).toBeNull()

    await act(async () => {
      fetch.resolve()
    })

    expect(screen.getByTestId("flags").props.children).toBe(FETCHED_FLAGS)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("renders children with default flags after the gate when the fetch never resolves", async () => {
    deferFetch()
    const screen = renderProvider()

    await act(async () => {
      jest.advanceTimersByTime(REMOTE_CONFIG_GATE_MS - 1)
    })
    expect(screen.queryByTestId("flags")).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(1)
    })

    // Nothing was ever activated and nothing was fetched: every key is
    // "static" and reads as its default, so device stays true.
    expect(screen.getByTestId("flags").props.children).toBe(DEFAULT_FLAGS)
  })

  it("opens the gate on the previously activated values when the fetch never resolves", async () => {
    // A previous launch fetched and activated deviceAccountEnabledRestAuth =
    // false; this launch's fetch hangs.
    active = { deviceAccountEnabledRestAuth: false }
    deferFetch()
    const screen = renderProvider()

    await act(async () => {
      jest.advanceTimersByTime(REMOTE_CONFIG_GATE_MS)
    })

    expect(screen.getByTestId("flags").props.children).toBe(
      "device:false bridge:false usd:false",
    )
  })

  it("picks up the activated values once the native side loads them, before the gate", async () => {
    // First render: the JS cache is still empty, so the defaults.
    deferFetch()
    const screen = renderProvider()
    // Then setDefaults answers with a previous launch's activated values.
    active = { deviceAccountEnabledRestAuth: false, bridgeTopupEnabled: true }
    await flush()
    expect(screen.queryByTestId("flags")).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(REMOTE_CONFIG_GATE_MS)
    })

    expect(screen.getByTestId("flags").props.children).toBe(
      "device:false bridge:true usd:false",
    )
  })

  it("updates the flags when the fetch resolves after the gate opened", async () => {
    const fetch = deferFetch()
    const screen = renderProvider()

    await act(async () => {
      jest.advanceTimersByTime(REMOTE_CONFIG_GATE_MS)
    })
    expect(screen.getByTestId("flags").props.children).toBe(DEFAULT_FLAGS)

    await act(async () => {
      fetch.resolve()
    })

    expect(screen.getByTestId("flags").props.children).toBe(FETCHED_FLAGS)
  })

  it("opens the gate and keeps the defaults when the fetch rejects", async () => {
    const fetch = deferFetch()
    const screen = renderProvider()

    await act(async () => {
      fetch.reject(new Error("network down"))
    })

    expect(screen.getByTestId("flags").props.children).toBe(DEFAULT_FLAGS)
    expect(errorSpy).toHaveBeenCalledWith(
      "Error fetching remote config: ",
      expect.any(Error),
    )
  })

  it("keeps the previously activated values when the fetch rejects", async () => {
    active = { deviceAccountEnabledRestAuth: false }
    const fetch = deferFetch()
    const screen = renderProvider()

    await act(async () => {
      fetch.reject(new Error("network down"))
    })

    expect(screen.getByTestId("flags").props.children).toBe(
      "device:false bridge:false usd:false",
    )
  })

  it("renders children at once for a signed-in level, whatever the fetch does", () => {
    mockCurrentLevel = "ONE"
    deferFetch()

    const screen = renderProvider()

    expect(screen.getByTestId("flags").props.children).toBe(DEFAULT_FLAGS)
  })

  it("clears the gate timer on unmount and ignores a fetch that lands later", async () => {
    const fetch = deferFetch()
    const screen = renderProvider()
    expect(jest.getTimerCount()).toBe(1)

    screen.unmount()
    expect(jest.getTimerCount()).toBe(0)

    await act(async () => {
      fetch.resolve()
    })

    expect(errorSpy).not.toHaveBeenCalled()
  })
})
