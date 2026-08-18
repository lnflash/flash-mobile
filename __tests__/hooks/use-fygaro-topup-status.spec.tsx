import { renderHook, act, waitFor } from "@testing-library/react-native"

const mockFetchStatus = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  useFygaroTopupStatusLazyQuery: () => [mockFetchStatus],
}))

import { useFygaroTopupStatus } from "@app/hooks/use-fygaro-topup-status"

const reply = (state: string, extra: Record<string, unknown> = {}) => ({
  data: { fygaroTopupStatus: { state, authorizedAmount: 6000, ...extra } },
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockFetchStatus.mockResolvedValue({ data: { fygaroTopupStatus: null } })
})

afterEach(() => {
  jest.useRealTimers()
})

describe("useFygaroTopupStatus", () => {
  it("starts by checking, not by claiming success", async () => {
    // The bug this replaces: the screen asserted a completed deposit off a
    // Fygaro redirect, before asking anyone.
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    expect(result.current.phase).toBe("checking")
  })

  it("resolves credited with the net that actually landed", async () => {
    mockFetchStatus.mockResolvedValue(reply("CREDITED", { netAmount: 5652 }))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await waitFor(() => expect(result.current.phase).toBe("credited"))
    expect(result.current).toEqual({ phase: "credited", netAmountCents: 5652 })
  })

  it("surfaces the server's reason on a held payment", async () => {
    mockFetchStatus.mockResolvedValue(
      reply("HELD_FOR_REVIEW", {
        reason: "This is more than your remaining daily top-up limit of $25.00.",
      }),
    )
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await waitFor(() => expect(result.current.phase).toBe("held"))
    expect(result.current).toMatchObject({
      reason: "This is more than your remaining daily top-up limit of $25.00.",
    })
  })

  it("NEVER spins past the fast window — it resolves to pending", async () => {
    // The contract: no spinner past 10s. A customer who has just been charged
    // is owed a definite answer, and "still loading" is not one.
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))
    expect(result.current.phase).toBe("checking")

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })

    expect(result.current.phase).toBe("pending")
  })

  it("still upgrades to credited after it has resolved to pending", async () => {
    // The transient webhook paths deliberately 500 so Fygaro retries, which can
    // take minutes. Resolving the screen must not stop us noticing the credit.
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })
    expect(result.current.phase).toBe("pending")

    mockFetchStatus.mockResolvedValue(reply("CREDITED", { netAmount: 5652 }))
    await act(async () => {
      jest.advanceTimersByTime(6_000)
    })

    expect(result.current.phase).toBe("credited")
  })

  it("stops polling the moment the answer is terminal (credited)", async () => {
    // A CREDITED at t≈1s used to keep the timers running for the full 70s:
    // ~9 more one-second polls and ~12 more five-second polls, every one a
    // network-only round trip, every one re-rendering the screen with a fresh
    // resolution object. There is no later answer to wait for.
    mockFetchStatus.mockResolvedValue(reply("CREDITED", { netAmount: 5652 }))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await waitFor(() => expect(result.current.phase).toBe("credited"))
    const callsAtResolution = mockFetchStatus.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(80_000)
    })

    expect(mockFetchStatus.mock.calls).toHaveLength(callsAtResolution)
    expect(result.current.phase).toBe("credited")
  })

  it("stops polling on HELD_FOR_REVIEW — retrying it achieves nothing by definition", async () => {
    // Held is terminal until a human acts. Twenty more round trips cannot
    // change it, and each one re-rendered the screen for no reason.
    mockFetchStatus.mockResolvedValue(
      reply("HELD_FOR_REVIEW", { reason: "under review" }),
    )
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await waitFor(() => expect(result.current.phase).toBe("held"))
    const callsAtResolution = mockFetchStatus.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(80_000)
    })

    expect(mockFetchStatus.mock.calls).toHaveLength(callsAtResolution)
  })

  it("stops polling on FAILED", async () => {
    mockFetchStatus.mockResolvedValue(reply("FAILED", { reason: "card declined" }))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await waitFor(() => expect(result.current.phase).toBe("failed"))
    const callsAtResolution = mockFetchStatus.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(80_000)
    })

    expect(mockFetchStatus.mock.calls).toHaveLength(callsAtResolution)
  })

  it("keeps polling after a NON-terminal answer, so a late credit is still noticed", async () => {
    // The other half of the contract: stopping early on "pending" would leave
    // the customer on "we're crediting it" forever after a webhook retry lands.
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })
    expect(result.current.phase).toBe("pending")
    const callsAtResolution = mockFetchStatus.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(20_000)
    })

    expect(mockFetchStatus.mock.calls.length).toBeGreaterThan(callsAtResolution)
  })

  it("resolves straight to pending with no checkout id, and asks nothing", async () => {
    // A legacy device-built link has no id to ask about. "We have your payment
    // and are crediting it" is the honest version of the old success screen.
    const { result } = renderHook(() => useFygaroTopupStatus(undefined))

    expect(result.current.phase).toBe("pending")
    expect(mockFetchStatus).not.toHaveBeenCalled()
  })

  it("a failed poll does not change what the customer is being shown", async () => {
    // A network blip tells us nothing about the payment. Showing "failed"
    // because WE could not ask would be inventing an outcome.
    mockFetchStatus.mockRejectedValue(new Error("offline"))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await act(async () => {
      jest.advanceTimersByTime(3_000)
    })

    expect(result.current.phase).toBe("checking")
  })

  it("stops polling once unmounted", async () => {
    const { unmount } = renderHook(() => useFygaroTopupStatus("intent-1"))
    await act(async () => {
      jest.advanceTimersByTime(2_000)
    })
    const callsBefore = mockFetchStatus.mock.calls.length
    unmount()

    await act(async () => {
      jest.advanceTimersByTime(20_000)
    })

    expect(mockFetchStatus.mock.calls).toHaveLength(callsBefore)
  })
})
