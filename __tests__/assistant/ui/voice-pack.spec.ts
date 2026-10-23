import { DeviceEventEmitter, NativeModules } from "react-native"
import { act, renderHook } from "@testing-library/react-native"
import Config from "react-native-config"
import { useVoicePack, voicePack, voicePackSource } from "@app/assistant/ui/voice-pack"

const originalDev = __DEV__
const originalSource = Config.FLASH_VOICE_PACK_BASE_URL
const original = NativeModules.SpeechOutputBridge
const sourceCode = NativeModules.SourceCode
const missing = { phase: "missing", receivedBytes: 0, totalBytes: 102466705 }
const ready = { ...missing, phase: "ready", receivedBytes: missing.totalBytes }
afterEach(() => {
  NativeModules.SpeechOutputBridge = original
  NativeModules.SourceCode = sourceCode
  Object.defineProperty(globalThis, "__DEV__", { value: originalDev, writable: true })
  Config.FLASH_VOICE_PACK_BASE_URL = originalSource
  jest.useRealTimers()
})
it("does not start a download when inspecting or subscribing to a pack", async () => {
  const downloadPack = jest.fn()
  NativeModules.SpeechOutputBridge = {
    packState: jest.fn(async () => missing),
    downloadPack,
  }
  const listener = jest.fn()
  const unsubscribe = voicePack.subscribe(listener)
  await voicePack.refresh()
  expect(voicePack.get()).toEqual(missing)
  expect(listener).toHaveBeenCalledTimes(1)
  expect(downloadPack).not.toHaveBeenCalled()
  unsubscribe()
})
it("passes only the configured asset source and publishes native verified state", async () => {
  NativeModules.SourceCode = { scriptURL: "http://192.168.1.2:8081/index.bundle" }
  const downloadPack = jest.fn(async () => ready)
  NativeModules.SpeechOutputBridge = { downloadPack }
  expect(voicePackSource()).toBe("http://192.168.1.2:18083/neural-v1")
  await expect(voicePack.download()).resolves.toEqual(ready)
  expect(downloadPack).toHaveBeenCalledWith("http://192.168.1.2:18083/neural-v1")
  expect(voicePack.get()).toEqual(ready)
})
it("keeps cancellation distinct from a failed download and permits retry", async () => {
  NativeModules.SourceCode = { scriptURL: "http://localhost:8081/index.bundle" }
  NativeModules.SpeechOutputBridge = {
    downloadPack: jest.fn().mockResolvedValueOnce(missing).mockResolvedValueOnce(ready),
    cancelPack: jest.fn(async () => missing),
    removePack: jest.fn(async () => missing),
  }
  await voicePack.cancel()
  expect(voicePack.get().phase).toBe("missing")
  await voicePack.download()
  expect(voicePack.get().phase).toBe("missing")
  await voicePack.download()
  expect(voicePack.get().phase).toBe("ready")
  await voicePack.remove()
  expect(voicePack.get().phase).toBe("missing")
})
it("rejects unsupported downloads without changing usable installed state", async () => {
  NativeModules.SpeechOutputBridge = undefined
  await expect(voicePack.download()).rejects.toThrow("Voice pack unavailable")
})

it("never uses a development LAN source in Release and requires HTTPS hosting", () => {
  Object.defineProperty(globalThis, "__DEV__", { value: false, writable: true })
  NativeModules.SourceCode = { scriptURL: "http://192.168.1.2:8081/index.bundle" }
  Config.FLASH_VOICE_PACK_BASE_URL = undefined
  expect(voicePackSource()).toBeUndefined()
  Config.FLASH_VOICE_PACK_BASE_URL = "http://voices.example.test/pack"
  expect(voicePackSource()).toBeUndefined()
})
it("uses the explicit immutable HTTPS pack directory in Release", () => {
  Object.defineProperty(globalThis, "__DEV__", { value: false, writable: true })
  Config.FLASH_VOICE_PACK_BASE_URL = "https://voices.example.test/kokoro-en-v1/"
  expect(voicePackSource()).toBe("https://voices.example.test/kokoro-en-v1")
})

const mountProgress = async () => {
  jest.useFakeTimers()
  jest.setSystemTime(1000)
  NativeModules.SourceCode = { scriptURL: "http://localhost:8081/index.bundle" }
  NativeModules.SpeechOutputBridge = {
    packState: jest.fn(async () => missing),
    downloadPack: jest.fn(async () => ({ ...missing, phase: "downloading" })),
    cancelPack: jest.fn(async () => missing),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  }
  const hook = renderHook(() => useVoicePack())
  await act(async () => undefined)
  const emit = (receivedBytes: number, phase = "downloading") =>
    act(() =>
      DeviceEventEmitter.emit("SpeechPackEvent", {
        phase,
        receivedBytes,
        totalBytes: 1000,
      }),
    )
  return { hook, emit }
}

it("deduplicates percentages and bounds progress bursts to one update per 200 ms", async () => {
  const { hook, emit } = await mountProgress()
  const listener = jest.fn()
  const unsubscribe = voicePack.subscribe(listener)
  emit(0)
  expect(listener).toHaveBeenCalledTimes(1)
  jest.setSystemTime(1250)
  emit(1) // Still rounds to zero percent, despite the elapsed interval.
  expect(listener).toHaveBeenCalledTimes(1)
  emit(10)
  expect(listener).toHaveBeenCalledTimes(2)
  jest.setSystemTime(1449)
  emit(300)
  expect(voicePack.get().receivedBytes).toBe(10)
  expect(listener).toHaveBeenCalledTimes(2)
  jest.setSystemTime(1450)
  emit(400)
  for (let received = 401; received < 1000; received += 1) emit(received)
  expect(voicePack.get().receivedBytes).toBe(400)
  expect(listener).toHaveBeenCalledTimes(3)
  unsubscribe()
  hook.unmount()
})

it("publishes terminal transitions immediately and starts a fresh window after cancel/retry", async () => {
  const { hook, emit } = await mountProgress()
  await act(async () => {
    await voicePack.download()
  })
  jest.setSystemTime(1250)
  emit(250)
  expect(hook.result.current.receivedBytes).toBe(250)
  await act(async () => {
    await voicePack.cancel()
  })
  expect(hook.result.current.phase).toBe("missing")
  await act(async () => {
    await voicePack.download()
  })
  expect(hook.result.current).toMatchObject({ phase: "downloading", receivedBytes: 0 })
  emit(1000, "ready")
  expect(hook.result.current.phase).toBe("ready")
  emit(0, "failed")
  expect(hook.result.current.phase).toBe("failed")
  emit(0, "missing")
  expect(hook.result.current.phase).toBe("missing")
  expect(NativeModules.SpeechOutputBridge.downloadPack).toHaveBeenCalledTimes(2)
  hook.unmount()
  emit(500)
  expect(voicePack.get().phase).toBe("missing")
})
