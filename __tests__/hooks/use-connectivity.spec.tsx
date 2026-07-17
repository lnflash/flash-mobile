/**
 * useConnectivity — offline hysteresis + reconnect pulse.
 *
 * Contract under test:
 *  - `isOffline` latches only after reachability is continuously false for
 *    OFFLINE_DEBOUNCE_MS; shorter blips never surface. In particular a SINGLE
 *    failed NetInfo probe cycle (reachabilityShortTimeout 5s + probe RTT,
 *    see NetInfo.configure in app/graphql/client.tsx) must be absorbed.
 *  - `null` reachability ("probing / not determined") counts as online for
 *    the banner but is NOT a confirmed recovery.
 *  - Recovery clears `isOffline` immediately.
 *  - `justReconnected` pulses exactly once per real offline period, only on
 *    the confirmed (true) edge, observable by a consumer effect (the real
 *    contract — the flag self-resets after one render).
 */

import { useEffect } from "react"
import { renderHook, act } from "@testing-library/react-hooks"

const mockUseNetInfo = jest.fn()
jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => mockUseNetInfo(),
}))

import { useConnectivity, OFFLINE_DEBOUNCE_MS } from "@app/hooks/use-connectivity"

// One failed-probe recovery cycle: reachabilityShortTimeout (5s, configured
// in app/graphql/client.tsx) + a generous probe round-trip. The debounce must
// absorb this — the assertion below fails loudly if the constants decouple.
const FAILED_PROBE_CYCLE_MS = 5_200
const SETTLE_MS = OFFLINE_DEBOUNCE_MS + 2_000

const setReachable = (value: boolean | null) =>
  mockUseNetInfo.mockReturnValue({ isInternetReachable: value })

// Consumer harness mirroring how screens use the pulse: an effect keyed on
// justReconnected. The spy records each pulse a consumer would act on.
const renderConnectivity = (onReconnect: jest.Mock) =>
  renderHook(() => {
    const connectivity = useConnectivity()
    useEffect(() => {
      if (connectivity.justReconnected) {
        onReconnect()
      }
    }, [connectivity.justReconnected])
    return connectivity
  })

describe("useConnectivity", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockUseNetInfo.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("starts online", () => {
    setReachable(true)
    const { result } = renderConnectivity(jest.fn())
    expect(result.current.isOffline).toBe(false)
  })

  it("treats undetermined (null) reachability as online", () => {
    setReachable(null)
    const { result } = renderConnectivity(jest.fn())
    act(() => jest.advanceTimersByTime(SETTLE_MS))
    expect(result.current.isOffline).toBe(false)
  })

  it("absorbs a single failed probe cycle without latching or pulsing", () => {
    // A lone probe failure (one 502 during a deploy, a killed socket on
    // foreground) recovers at ~FAILED_PROBE_CYCLE_MS. That must stay inside
    // the debounce, or every isolated failure flashes the banner.
    expect(FAILED_PROBE_CYCLE_MS).toBeLessThan(OFFLINE_DEBOUNCE_MS)

    const onReconnect = jest.fn()
    setReachable(true)
    const { result, rerender } = renderConnectivity(onReconnect)

    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(FAILED_PROBE_CYCLE_MS))
    expect(result.current.isOffline).toBe(false)

    setReachable(true)
    rerender()
    act(() => jest.advanceTimersByTime(SETTLE_MS))

    expect(result.current.isOffline).toBe(false)
    // A blip that never latched must not pulse a reconnect either
    expect(onReconnect).not.toHaveBeenCalled()
  })

  it("latches offline after the debounce elapses", () => {
    setReachable(true)
    const { result, rerender } = renderConnectivity(jest.fn())

    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS - 1))
    expect(result.current.isOffline).toBe(false)

    act(() => jest.advanceTimersByTime(1))
    expect(result.current.isOffline).toBe(true)
  })

  it("clears offline immediately on recovery and pulses justReconnected once", () => {
    const onReconnect = jest.fn()
    setReachable(true)
    const { result, rerender } = renderConnectivity(onReconnect)

    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS))
    expect(result.current.isOffline).toBe(true)

    setReachable(true)
    rerender()

    expect(result.current.isOffline).toBe(false)
    expect(onReconnect).toHaveBeenCalledTimes(1)

    // The pulse self-resets and does not re-fire on later renders
    rerender()
    act(() => jest.advanceTimersByTime(SETTLE_MS))
    expect(onReconnect).toHaveBeenCalledTimes(1)
    expect(result.current.justReconnected).toBe(false)
  })

  it("pulses once per distinct offline period", () => {
    const onReconnect = jest.fn()
    setReachable(true)
    const { rerender } = renderConnectivity(onReconnect)

    for (let i = 0; i < 2; i += 1) {
      setReachable(false)
      rerender()
      act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS))
      setReachable(true)
      rerender()
    }

    expect(onReconnect).toHaveBeenCalledTimes(2)
  })

  it("does not pulse for a short blip after an earlier real offline period", () => {
    // Kills the mutant that drops `wasOfflineRef.current = false` on recovery:
    // a stale latch would make every later sub-debounce blip fire a refetch.
    const onReconnect = jest.fn()
    setReachable(true)
    const { result, rerender } = renderConnectivity(onReconnect)

    // real offline period → exactly one pulse
    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS))
    setReachable(true)
    rerender()
    expect(onReconnect).toHaveBeenCalledTimes(1)

    // later blip shorter than the debounce → must NOT pulse again
    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS - 1_000))
    setReachable(true)
    rerender()
    act(() => jest.advanceTimersByTime(SETTLE_MS))
    expect(result.current.isOffline).toBe(false)
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it("pulses at the confirmed edge of the real NetInfo recovery sequence (false→null→true)", () => {
    // With useNativeReachability:false, NetInfo emits null (probing) before
    // true on real recoveries. The pulse must wait for the confirmed edge.
    const onReconnect = jest.fn()
    setReachable(true)
    const { result, rerender } = renderConnectivity(onReconnect)

    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS))
    expect(result.current.isOffline).toBe(true)

    // probe running: banner clears, but no reconnect pulse yet
    setReachable(null)
    rerender()
    expect(result.current.isOffline).toBe(false)
    expect(onReconnect).not.toHaveBeenCalled()

    // probe confirms: exactly one pulse
    setReachable(true)
    rerender()
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it("keeps the latch through a failed probe (false→null→false) and re-latches", () => {
    const onReconnect = jest.fn()
    setReachable(true)
    const { result, rerender } = renderConnectivity(onReconnect)

    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS))
    expect(result.current.isOffline).toBe(true)

    // probe starts (null) but fails — back to false, still no pulse
    setReachable(null)
    rerender()
    setReachable(false)
    rerender()
    expect(onReconnect).not.toHaveBeenCalled()

    // continuous false re-latches the banner after the debounce
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS))
    expect(result.current.isOffline).toBe(true)

    // eventual confirmed recovery still pulses exactly once
    setReachable(true)
    rerender()
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it("restarts the debounce when reachability flaps around it", () => {
    setReachable(true)
    const { result, rerender } = renderConnectivity(jest.fn())

    // two sub-debounce false windows separated by a recovery: never a
    // continuous OFFLINE_DEBOUNCE_MS window
    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS - 1_000))
    setReachable(true)
    rerender()
    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(OFFLINE_DEBOUNCE_MS - 1_000))
    expect(result.current.isOffline).toBe(false)

    // but completing the window latches
    act(() => jest.advanceTimersByTime(1_000))
    expect(result.current.isOffline).toBe(true)
  })
})
