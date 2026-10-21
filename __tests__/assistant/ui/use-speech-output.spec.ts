import { act, renderHook } from "@testing-library/react-native"
import { AccessibilityInfo, AppState } from "react-native"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { useSpeechOutput } from "@app/assistant/ui/use-speech-output"
import {
  nativeSpeechOutput,
  SpeechOutputEvent,
} from "@app/assistant/ui/native-speech-output"
import { fakeRuntime } from "./thread-harness"
import type { ThreadEntry } from "@app/assistant/ui/thread-store"
let mockListener: (event: SpeechOutputEvent) => void
jest.mock("@app/assistant/ui/native-speech-output", () => ({
  nativeSpeechOutput: {
    available: jest.fn(async () => true),
    speak: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(),
    subscribe: jest.fn((listener) => {
      mockListener = listener
      return jest.fn()
    }),
  },
}))
jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react")
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  }
})
jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: { isSensorAvailable: jest.fn(), authenticate: jest.fn(), release: jest.fn() },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))
loadLocale("en")
const LL = i18nObject("en")
const help: ThreadEntry = { id: "one", kind: "help", topic: "funding" }
const make = () => {
  const { runtime } = fakeRuntime()
  const options = {
    enabled: true,
    runtime,
    LL,
    locale: "en",
    display: {
      displayCurrency: "USD",
      formatMoneyAmount: jest.fn(() => "amount"),
      formatCurrency: jest.fn(() => "price"),
    },
  }
  return { runtime, options, hook: renderHook(() => useSpeechOutput(options)) }
}
beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    value: "active",
    writable: true,
  })
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false)
})
it("supports manual playback and only accepts terminal events for its own playback", async () => {
  const { hook } = make()
  await act(async () => {
    await hook.result.current.play(help)
  })
  const first = (nativeSpeechOutput.speak as jest.Mock).mock.calls[0][0]
  await act(async () => {
    await hook.result.current.play({ ...help, id: "two" })
  })
  act(() => mockListener({ playbackId: first, type: "end" }))
  expect(hook.result.current.entryId).toBe("two")
  const second = (nativeSpeechOutput.speak as jest.Mock).mock.calls[1][0]
  act(() => mockListener({ playbackId: second, type: "end" }))
  expect(hook.result.current.entryId).toBeUndefined()
})
it("does not start playback after a pending voice check was canceled by a new hold", async () => {
  let resolve: (value: boolean) => void = () => undefined
  ;(nativeSpeechOutput.available as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<boolean>((done) => {
        resolve = done
      }),
  )
  const { hook } = make()
  let playback: Promise<void> | undefined
  await act(async () => {
    playback = hook.result.current.play(help)
  })
  await act(async () => {
    await hook.result.current.stop()
    resolve(true)
    await playback
  })
  expect(nativeSpeechOutput.speak).not.toHaveBeenCalled()
  expect(hook.result.current.entryId).toBeUndefined()
})
it("auto-reads new opted-in guidance for voice, typed and suggestion turns", async () => {
  const { runtime } = make()
  await act(async () => undefined)
  await act(async () => runtime.completedTurns.complete("voice", [help]))
  expect(nativeSpeechOutput.speak).not.toHaveBeenCalled()
  act(() => runtime.speechPreference.set(true))
  await act(async () =>
    runtime.completedTurns.complete("voice", [
      { id: "b", kind: "balances", stale: false, payload: { balances: [] } },
    ]),
  )
  expect(nativeSpeechOutput.speak).not.toHaveBeenCalled()
  await act(async () => runtime.completedTurns.complete("voice", [help]))
  expect(nativeSpeechOutput.speak).toHaveBeenCalledTimes(1)
  await act(async () => runtime.completedTurns.complete("text", [help]))
  expect(nativeSpeechOutput.speak).toHaveBeenCalledTimes(2)
})
it("does not replay a previous completion on remount and releases the engine on leaving", async () => {
  const { hook, runtime, options } = make()
  act(() => runtime.speechPreference.set(true))
  await act(async () => undefined)
  await act(async () => runtime.completedTurns.complete("voice", [help]))
  hook.unmount()
  expect(nativeSpeechOutput.dispose).toHaveBeenCalled()
  ;(nativeSpeechOutput.speak as jest.Mock).mockClear()
  renderHook(() => useSpeechOutput(options))
  await act(async () => undefined)
  expect(nativeSpeechOutput.speak).not.toHaveBeenCalled()
})
it("explains missing offline voices without speaking or requesting a model download", async () => {
  ;(nativeSpeechOutput.available as jest.Mock).mockResolvedValueOnce(false)
  const { hook } = make()
  await act(async () => {
    await hook.result.current.play(help)
  })
  expect(hook.result.current.problem).toBe("unavailable")
  expect(nativeSpeechOutput.speak).not.toHaveBeenCalled()
})

it("uses current voice and speed for playback without replaying when settings change", async () => {
  const { runtime, hook } = make()
  act(() => runtime.speechPreference.configure({ voiceId: "chosen", rate: 1.2 }))
  expect(nativeSpeechOutput.speak).not.toHaveBeenCalled()
  await act(async () => {
    await hook.result.current.play(help)
  })
  expect(nativeSpeechOutput.speak).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    { locale: "en-US", voiceId: "chosen", rate: 1.2 },
  )
})
