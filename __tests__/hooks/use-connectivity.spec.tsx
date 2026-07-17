/**
 * useConnectivity — offline hysteresis + reconnect pulse.
 *
 * Contract under test:
 *  - `isOffline` latches only after reachability is continuously false for
 *    OFFLINE_DEBOUNCE_MS (3s); shorter blips never surface.
 *  - `null` reachability ("not determined yet") counts as online.
 *  - Recovery clears `isOffline` immediately.
 *  - `justReconnected` pulses exactly once per real offline→online
 *    transition, observable by a consumer effect (the real contract —
 *    the flag self-resets after one render).
 */

import { useEffect } from "react"
import { renderHook, act } from "@testing-library/react-hooks"

const mockUseNetInfo = jest.fn()
jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => mockUseNetInfo(),
}))

import { useConnectivity } from "@app/hooks/use-connectivity"

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
    act(() => jest.advanceTimersByTime(10_000))
    expect(result.current.isOffline).toBe(false)
  })

  it("does not latch offline for a blip shorter than the debounce", () => {
    const onReconnect = jest.fn()
    setReachable(true)
    const { result, rerender } = renderConnectivity(onReconnect)

    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(2_000))
    expect(result.current.isOffline).toBe(false)

    setReachable(true)
    rerender()
    act(() => jest.advanceTimersByTime(10_000))

    expect(result.current.isOffline).toBe(false)
    // A blip that never latched must not pulse a reconnect either
    expect(onReconnect).not.toHaveBeenCalled()
  })

  it("latches offline after the debounce elapses", () => {
    setReachable(true)
    const { result, rerender } = renderConnectivity(jest.fn())

    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(2_999))
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
    act(() => jest.advanceTimersByTime(3_000))
    expect(result.current.isOffline).toBe(true)

    setReachable(true)
    rerender()

    expect(result.current.isOffline).toBe(false)
    expect(onReconnect).toHaveBeenCalledTimes(1)

    // The pulse self-resets and does not re-fire on later renders
    rerender()
    act(() => jest.advanceTimersByTime(10_000))
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
      act(() => jest.advanceTimersByTime(3_000))
      setReachable(true)
      rerender()
    }

    expect(onReconnect).toHaveBeenCalledTimes(2)
  })

  it("restarts the debounce when reachability flaps around it", () => {
    setReachable(true)
    const { result, rerender } = renderConnectivity(jest.fn())

    // false for 2s → true → false for 2s: never a continuous 3s window
    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(2_000))
    setReachable(true)
    rerender()
    setReachable(false)
    rerender()
    act(() => jest.advanceTimersByTime(2_000))
    expect(result.current.isOffline).toBe(false)

    // but completing the window latches
    act(() => jest.advanceTimersByTime(1_000))
    expect(result.current.isOffline).toBe(true)
  })
})
