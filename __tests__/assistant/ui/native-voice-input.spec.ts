/* eslint-disable react-native/split-platform-components -- Exercises both platform permission paths. */
import { NativeModules, PermissionsAndroid, Platform } from "react-native"
import { nativeVoiceInput, VOICE_LOCALE } from "@app/assistant/ui/native-voice-input"

const original = NativeModules.VoiceInputBridge
const originalOS = Platform.OS
beforeEach(() => {
  NativeModules.VoiceInputBridge = {
    capability: jest.fn(async () => true),
    requestPermission: jest.fn(async () => "granted"),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  }
})
afterEach(() => {
  NativeModules.VoiceInputBridge = original
  Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS })
  jest.restoreAllMocks()
})

it("missing or failing bridges leave typing available without a native crash", async () => {
  NativeModules.VoiceInputBridge = undefined
  await expect(nativeVoiceInput.available()).resolves.toBe(false)
  expect(() => nativeVoiceInput.subscribe(jest.fn())()).not.toThrow()
  await expect(nativeVoiceInput.permission()).resolves.toBe("blocked")
  NativeModules.VoiceInputBridge = {
    capability: jest.fn(async () => {
      throw new Error("unavailable")
    }),
  }
  await expect(nativeVoiceInput.available()).resolves.toBe(false)
})

it("selects an explicit English model and forwards immutable session identities", async () => {
  await expect(nativeVoiceInput.available()).resolves.toBe(true)
  expect(NativeModules.VoiceInputBridge.capability).toHaveBeenCalledWith(VOICE_LOCALE)
  nativeVoiceInput.start("hold-1")
  nativeVoiceInput.stop("hold-1")
  nativeVoiceInput.abort("hold-1")
  expect(NativeModules.VoiceInputBridge.start).toHaveBeenCalledWith("hold-1", "en-US")
  expect(NativeModules.VoiceInputBridge.stop).toHaveBeenCalledWith("hold-1")
  expect(NativeModules.VoiceInputBridge.abort).toHaveBeenCalledWith("hold-1")
})

for (const [answer, expected] of [
  ["granted", "granted"],
  ["denied", "denied"],
  ["never_ask_again", "blocked"],
] as const) {
  it(`normalizes Android microphone permission ${answer}`, async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" })
    jest
      .spyOn(PermissionsAndroid, "request")
      .mockResolvedValue(answer as Awaited<ReturnType<typeof PermissionsAndroid.request>>)
    await expect(nativeVoiceInput.permission()).resolves.toBe(expected)
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    )
    expect(NativeModules.VoiceInputBridge.requestPermission).not.toHaveBeenCalled()
  })
}
