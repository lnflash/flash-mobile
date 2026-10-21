import { act, renderHook, waitFor } from "@testing-library/react-native"
import { AppState } from "react-native"

jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react")
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  }
})
jest.mock("react-native-haptic-feedback", () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
}))
jest.mock("@app/utils/analytics", () => ({ logAssistantVoiceUsed: jest.fn() }))
jest.mock("@app/assistant/ui/native-voice-input", () => ({
  nativeVoiceInput: {
    available: jest.fn(async () => true),
    permission: jest.fn(async () => "granted"),
    subscribe: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
}))

import { nativeVoiceInput, VoiceEvent } from "@app/assistant/ui/native-voice-input"
import { useVoiceInput } from "@app/assistant/ui/use-voice-input"
import { logAssistantVoiceUsed } from "@app/utils/analytics"

const native = jest.mocked(nativeVoiceInput)
let listener: (event: VoiceEvent) => void
let appListener: (state: string) => void
let submit: jest.Mock
const emit = (type: VoiceEvent["type"], text?: string, sessionId?: string) => {
  const id = sessionId ?? native.start.mock.calls.at(-1)?.[0] ?? "missing"
  act(() => listener({ sessionId: id, type, text }))
}
const render = async (enabled = true) => {
  const hook = renderHook(
    ({ busy, on }) => useVoiceInput({ enabled: on, busy, onSubmit: submit }),
    { initialProps: { busy: false, on: enabled } },
  )
  if (enabled) await waitFor(() => expect(hook.result.current.available).toBe(true))
  return hook
}
const start = async (hook: Awaited<ReturnType<typeof render>>) => {
  await act(() => hook.result.current.start())
  emit("started")
}

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    value: "active",
    writable: true,
  })
  native.available.mockResolvedValue(true)
  native.permission.mockResolvedValue("granted")
  native.subscribe.mockImplementation((callback) => {
    listener = callback
    return jest.fn()
  })
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
    appListener = callback as typeof appListener
    return { remove: jest.fn() }
  })
  submit = jest.fn(() => true)
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it("shows interim text and sends once only after release and terminal finalization", async () => {
  const hook = await render()
  expect(hook.result.current.phase).toBe("idle")
  await start(hook)
  emit("interim", "what's my")
  expect(hook.result.current.preview).toBe("what's my")
  emit("final", "what's my balance")
  expect(submit).not.toHaveBeenCalled()
  act(() => hook.result.current.release())
  expect(native.stop).toHaveBeenCalledTimes(1)
  expect(submit).not.toHaveBeenCalled()
  emit("end")
  emit("final", "duplicate")
  emit("end")
  expect(submit).toHaveBeenCalledTimes(1)
  expect(submit).toHaveBeenCalledWith("what's my balance")
  expect(logAssistantVoiceUsed).toHaveBeenCalledWith(
    expect.objectContaining({ chars: 17 }),
  )
  expect(hook.result.current.phase).toBe("idle")
})

it("buffers a final and end before release without sending early", async () => {
  const hook = await render()
  await start(hook)
  emit("final", "bitcoin price")
  emit("end")
  expect(submit).not.toHaveBeenCalled()
  act(() => hook.result.current.release())
  expect(submit).toHaveBeenCalledWith("bitcoin price")
})

it("waits for delayed finals, and only shows finishing after 300 ms", async () => {
  const hook = await render()
  await start(hook)
  jest.useFakeTimers()
  act(() => hook.result.current.release())
  expect(hook.result.current.showFinishing).toBe(false)
  act(() => jest.advanceTimersByTime(300))
  expect(hook.result.current.showFinishing).toBe(true)
  emit("final", "balance")
  emit("end")
  expect(submit).toHaveBeenCalledWith("balance")
})

it("silence and errors clear the preview and send nothing", async () => {
  const hook = await render()
  await start(hook)
  emit("interim", "noise")
  emit("error", "no-speech")
  emit("end")
  expect(hook.result.current.active).toBe(false)
  expect(hook.result.current.preview).toBe("")
  expect(submit).not.toHaveBeenCalled()
  await start(hook)
  emit("error", "failure")
  emit("end")
  expect(hook.result.current.problem).toBe("failed")
  expect(hook.result.current.phase).toBe("idle")
})

it("does not begin after release during permission or reuse the old permission completion", async () => {
  let grant!: (value: "granted") => void
  native.permission.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve
      }),
  )
  const hook = await render()
  act(() => {
    hook.result.current.start()
  })
  expect(hook.result.current.phase).toBe("requesting-permission")
  act(() => hook.result.current.release())
  await act(async () => grant("granted"))
  expect(native.start).not.toHaveBeenCalled()
  expect(hook.result.current.phase).toBe("idle")
})

it("blocked permission disables voice with Settings recovery", async () => {
  const hook = await render()
  native.permission.mockResolvedValue("blocked")
  await act(() => hook.result.current.start())
  expect(hook.result.current.available).toBe(false)
  expect(hook.result.current.problem).toBe("permission")
  expect(native.start).not.toHaveBeenCalled()
  act(() => appListener("active"))
  await waitFor(() => expect(hook.result.current.available).toBe(true))
  expect(hook.result.current.problem).toBe("permission")
  native.permission.mockResolvedValue("granted")
  await start(hook)
  expect(hook.result.current.problem).toBeUndefined()
})

it("unsupported devices and flag off never start recording", async () => {
  native.available.mockResolvedValue(false)
  const hook = renderHook(() =>
    useVoiceInput({ enabled: true, busy: false, onSubmit: submit }),
  )
  await act(() => hook.result.current.start())
  expect(native.start).not.toHaveBeenCalled()
  hook.unmount()
  native.available.mockClear()
  const off = await render(false)
  await act(() => off.result.current.start())
  expect(native.available).not.toHaveBeenCalled()
  expect(native.start).not.toHaveBeenCalled()
})
;["busy", "flag", "background", "unmount"].forEach((reason) => {
  it(`cancels on ${reason} and ignores late results`, async () => {
    const hook = await render()
    await start(hook)
    const id = native.start.mock.calls[0][0]
    act(() => {
      if (reason === "busy") hook.rerender({ busy: true, on: true })
      if (reason === "flag") hook.rerender({ busy: false, on: false })
      if (reason === "background") appListener("background")
      if (reason === "unmount") hook.unmount()
    })
    expect(native.abort).toHaveBeenCalledWith(id)
    emit("final", "late send", id)
    emit("end", undefined, id)
    expect(submit).not.toHaveBeenCalled()
  })
})

it("serializes holds through cancellation and rejects old session callbacks", async () => {
  const hook = await render()
  await start(hook)
  const first = native.start.mock.calls[0][0]
  act(() => hook.result.current.cancel())
  await act(() => hook.result.current.start())
  expect(native.start).toHaveBeenCalledTimes(1)
  emit("end", undefined, first)
  await start(hook)
  emit("final", "stale", first)
  act(() => hook.result.current.release())
  emit("final", "new ask")
  emit("end")
  expect(submit).toHaveBeenCalledWith("new ask")
  expect(submit).toHaveBeenCalledTimes(1)
})

it("aborts on finalization timeout without submitting a partial result", async () => {
  const hook = await render()
  await start(hook)
  emit("interim", "unfinished")
  jest.useFakeTimers()
  act(() => hook.result.current.release())
  act(() => jest.advanceTimersByTime(6000))
  expect(native.abort).toHaveBeenCalled()
  expect(hook.result.current.problem).toBe("failed")
  expect(submit).not.toHaveBeenCalled()
})

it("waits for native playback to stop before requesting mic access or starting capture", async () => {
  let resolve: () => void = () => undefined
  const beforeCapture = jest.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  const hook = renderHook(() =>
    useVoiceInput({ enabled: true, busy: false, onSubmit: submit, beforeCapture }),
  )
  await waitFor(() => expect(hook.result.current.available).toBe(true))
  let starting: Promise<void> | undefined
  await act(async () => {
    starting = hook.result.current.start()
  })
  expect(beforeCapture).toHaveBeenCalledTimes(1)
  expect(native.permission).not.toHaveBeenCalled()
  expect(native.start).not.toHaveBeenCalled()
  await act(async () => {
    resolve()
    await starting
  })
  expect(native.permission).toHaveBeenCalledTimes(1)
  expect(native.start).toHaveBeenCalledTimes(1)
})
it("does not capture if a hold is released during the audio handoff", async () => {
  let resolve: () => void = () => undefined
  const hook = renderHook(() =>
    useVoiceInput({
      enabled: true,
      busy: false,
      onSubmit: submit,
      beforeCapture: () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    }),
  )
  await waitFor(() => expect(hook.result.current.available).toBe(true))
  let starting: Promise<void> | undefined
  await act(async () => {
    starting = hook.result.current.start()
  })
  act(() => hook.result.current.release())
  await act(async () => {
    resolve()
    await starting
  })
  expect(native.permission).not.toHaveBeenCalled()
  expect(native.start).not.toHaveBeenCalled()
  expect(submit).not.toHaveBeenCalled()
})
it("keeps capture stopped if playback cancellation fails", async () => {
  const hook = renderHook(() =>
    useVoiceInput({
      enabled: true,
      busy: false,
      onSubmit: submit,
      beforeCapture: async () => {
        throw new Error("stop failed")
      },
    }),
  )
  await waitFor(() => expect(hook.result.current.available).toBe(true))
  await act(async () => {
    await hook.result.current.start()
  })
  expect(hook.result.current.problem).toBe("failed")
  expect(native.start).not.toHaveBeenCalled()
  expect(native.permission).not.toHaveBeenCalled()
})
