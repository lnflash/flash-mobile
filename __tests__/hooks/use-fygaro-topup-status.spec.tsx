import { renderHook, act, waitFor } from "@testing-library/react-native"

const mockFetchStatus = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  useFygaroTopupStatusLazyQuery: () => [mockFetchStatus],
}))

import { useFygaroTopupStatus } from "@app/hooks/use-fygaro-topup-status"

const reply = (state: string, extra: Record<string, unknown> = {}) => ({
  data: { fygaroTopupStatus: { state, ...extra } },
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

  it("NEVER spins past the fast window — and does not claim receipt", async () => {
    // The contract: no spinner past 10s. A customer is owed a definite answer,
    // and "still loading" is not one. But with no PROCESSING observed, the
    // honest answer is "we haven't seen it" — a declined card closes the
    // payment page exactly as a successful one does.
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))
    expect(result.current.phase).toBe("checking")

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })

    expect(result.current.phase).toBe("unconfirmed")
  })

  it("still upgrades to credited after it has resolved", async () => {
    // The transient webhook paths deliberately 500 so Fygaro retries, which can
    // take minutes. Resolving the screen must not stop us noticing the credit.
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })
    expect(result.current.phase).toBe("unconfirmed")

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
    expect(result.current.phase).toBe("unconfirmed")
    const callsAtResolution = mockFetchStatus.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(20_000)
    })

    expect(mockFetchStatus.mock.calls.length).toBeGreaterThan(callsAtResolution)
  })

  it("resolves even when the request NEVER settles", async () => {
    // The deadline must not depend on the thing it is a deadline for. React
    // Native sets no default network timeout on Android and this app's HttpLink
    // passes no AbortController, so a stalled connection yields a promise that
    // hangs rather than rejects. With the resolution living inside the poll,
    // that left the customer on "Confirming your top-up" forever — on the
    // screen they land on immediately after being charged.
    mockFetchStatus.mockReturnValue(
      new Promise(() => {
        // Deliberately never settles.
      }),
    )
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))
    expect(result.current.phase).toBe("checking")

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })

    expect(result.current.phase).toBe("unconfirmed")
  })

  it("resolves straight to pending with no checkout id, and asks nothing", async () => {
    // A legacy device-built link has no id to ask about — but the app only
    // reaches this screen on a Fygaro SUCCESS redirect, which IS evidence the
    // card was charged. What it is not evidence of is Flash crediting the
    // wallet, which is the distinction this screen exists to draw. So
    // `pending`, not `unconfirmed`: the latter is for the signed path, where we
    // can actually ask and the server tells us it has seen nothing.
    const { result } = renderHook(() => useFygaroTopupStatus(undefined))

    expect(result.current.phase).toBe("pending")
    expect(mockFetchStatus).not.toHaveBeenCalled()
  })

  it("says PENDING only once the server has confirmed it has the payment", async () => {
    // PROCESSING means the provider told us the payment exists. That is the one
    // signal that licenses "we've received your payment".
    mockFetchStatus.mockResolvedValue(reply("PROCESSING"))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })

    expect(result.current.phase).toBe("pending")
  })

  it("upgrades unconfirmed to pending when a later poll confirms the payment", async () => {
    // The quiet poll catching up must be able to improve the answer — but only
    // ever in that direction.
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))
    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })
    expect(result.current.phase).toBe("unconfirmed")

    mockFetchStatus.mockResolvedValue(reply("PROCESSING"))
    await act(async () => {
      jest.advanceTimersByTime(6_000)
    })

    expect(result.current.phase).toBe("pending")
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

  it("still resolves when EVERY poll fails — a spinner is not an answer", async () => {
    // The other half of "a failed poll changes nothing": it must change nothing
    // ON SCREEN, and must not hold the spinner either. Returning early from the
    // catch skipped the fast-window check entirely, so on a flaky connection —
    // or against a backend older than this query, which rejects it outright —
    // the phase stayed `checking` right through to t=70s when the last timer
    // was cleared. A permanent spinner, on the screen a customer lands on
    // immediately after being charged.
    mockFetchStatus.mockRejectedValue(new Error("offline"))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await act(async () => {
      jest.advanceTimersByTime(11_000)
    })

    expect(result.current.phase).toBe("unconfirmed")
  })

  it("does not sit on `checking` once every timer is dead", async () => {
    // Past the slow window nothing will ever poll again, so whatever is on
    // screen at that point is final. It may not be a spinner.
    mockFetchStatus.mockRejectedValue(new Error("offline"))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await act(async () => {
      jest.advanceTimersByTime(101_000)
    })

    expect(result.current.phase).toBe("unconfirmed")
  })

  it("a poll that fails AFTER a terminal answer cannot un-resolve the screen", async () => {
    // Polling stops on terminal, but a request already in flight can still
    // reject afterwards. It must not drag a credited screen back to pending.
    mockFetchStatus.mockResolvedValue(reply("CREDITED", { netAmount: 5652 }))
    const { result } = renderHook(() => useFygaroTopupStatus("intent-1"))

    await waitFor(() => expect(result.current.phase).toBe("credited"))

    mockFetchStatus.mockRejectedValue(new Error("offline"))
    await act(async () => {
      jest.advanceTimersByTime(80_000)
    })

    expect(result.current).toEqual({ phase: "credited", netAmountCents: 5652 })
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
