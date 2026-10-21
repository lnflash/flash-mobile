import { NativeModules } from "react-native"
import Config from "react-native-config"
import { voicePack, voicePackSource } from "@app/assistant/ui/voice-pack"

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
