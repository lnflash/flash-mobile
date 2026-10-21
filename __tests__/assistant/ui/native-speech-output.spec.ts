import { NativeModules } from "react-native"
import { nativeSpeechOutput } from "@app/assistant/ui/native-speech-output"
const original = NativeModules.SpeechOutputBridge
afterEach(() => {
  NativeModules.SpeechOutputBridge = original
  jest.useRealTimers()
})
it("missing native speech leaves text usable without loading an engine", async () => {
  NativeModules.SpeechOutputBridge = undefined
  expect(await nativeSpeechOutput.available("en-US")).toBe(false)
  await expect(nativeSpeechOutput.stop()).resolves.toBeUndefined()
  expect(() => nativeSpeechOutput.subscribe(jest.fn())()).not.toThrow()
  expect(() => nativeSpeechOutput.dispose()).not.toThrow()
})
it("bounds a stalled capability request instead of hanging the answer", async () => {
  jest.useFakeTimers()
  NativeModules.SpeechOutputBridge = {
    capability: jest.fn(
      () =>
        new Promise(() => {
          /* Deliberately pending to test the timeout. */
        }),
    ),
  }
  const capability = nativeSpeechOutput.available("en-US")
  jest.advanceTimersByTime(5001)
  expect(await capability).toBe(false)
})
it("passes explicit locale, text and playback identity and refuses overlong speech", async () => {
  const speak = jest.fn(async () => undefined)
  NativeModules.SpeechOutputBridge = { speak }
  await nativeSpeechOutput.speak("play-1", "Local help", { locale: "en-US" })
  expect(speak).toHaveBeenCalledWith("play-1", "Local help", "en-US", "", 1)
  await expect(
    nativeSpeechOutput.speak("play-2", "x".repeat(4001), { locale: "en-US" }),
  ).rejects.toThrow()
  expect(speak).toHaveBeenCalledTimes(1)
})

it("passes the chosen installed voice and relative speed to native playback", async () => {
  const speak = jest.fn(async () => undefined)
  NativeModules.SpeechOutputBridge = { speak }
  await nativeSpeechOutput.speak("preview", "Hello", {
    locale: "en-US",
    voiceId: "installed-voice",
    rate: 0.8,
  })
  expect(speak).toHaveBeenCalledWith("preview", "Hello", "en-US", "installed-voice", 0.8)
})
it("lists native offline voices and tolerates missing enumeration support", async () => {
  NativeModules.SpeechOutputBridge = undefined
  expect(await nativeSpeechOutput.voices("en-US")).toEqual([])
  const voices = [{ id: "voice", name: "Voice", language: "en-US", quality: 2 }]
  NativeModules.SpeechOutputBridge = { voices: jest.fn(async () => voices) }
  expect(await nativeSpeechOutput.voices("en-US")).toEqual(voices)
})
it("plays an explicit Debug sample through the same native output bridge", async () => {
  const playSample = jest.fn(async () => undefined)
  NativeModules.SpeechOutputBridge = { playSample }
  await nativeSpeechOutput.playSample(
    "sample-1",
    "/cache/flash-voice-audition/v1/af_heart-welcome.wav",
  )
  expect(playSample).toHaveBeenCalledWith(
    "sample-1",
    "/cache/flash-voice-audition/v1/af_heart-welcome.wav",
  )
  NativeModules.SpeechOutputBridge = undefined
  await expect(
    nativeSpeechOutput.playSample("missing", "/cache/sample.wav"),
  ).rejects.toThrow("Sample unavailable")
})
