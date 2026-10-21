import { NativeEventEmitter, NativeModules } from "react-native"

export type SpeechOutputEvent = { playbackId: string; type: "started" | "end" | "error" }
export type OfflineVoice = {
  id: string
  name: string
  language: string
  quality: number
  source?: "pack"
}
type NativeSpeech = {
  playSample: (id: string, path: string) => Promise<void>
  voices: (locale: string) => Promise<OfflineVoice[]>
  addListener: (name: string) => void
  removeListeners: (count: number) => void
  capability: (locale: string) => Promise<boolean>
  speak: (
    id: string,
    text: string,
    locale: string,
    voiceId: string,
    rate: number,
  ) => Promise<void>
  stop: () => Promise<void>
  dispose: () => void
}
const bridge = (): NativeSpeech | undefined => NativeModules.SpeechOutputBridge
const bounded = async <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Speech timeout")), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
export const nativeSpeechOutput = {
  playSample: async (id: string, path: string): Promise<void> => {
    const native = bridge()
    if (!__DEV__ || !native?.playSample) throw new Error("Sample unavailable")
    await bounded(native.playSample(id, path), 2000)
  },
  voices: async (locale: string): Promise<OfflineVoice[]> => {
    try {
      return await bounded(bridge()?.voices(locale) ?? Promise.resolve([]), 5000)
    } catch {
      return []
    }
  },
  available: async (locale: string): Promise<boolean> => {
    try {
      return await bounded(bridge()?.capability(locale) ?? Promise.resolve(false), 5000)
    } catch {
      return false
    }
  },
  speak: async (
    id: string,
    text: string,
    {
      locale,
      voiceId = "",
      rate = 1,
    }: { locale: string; voiceId?: string; rate?: number },
  ): Promise<void> => {
    const native = bridge()
    if (!native || !text.trim() || text.length > 4000)
      throw new Error("Speech unavailable")
    await bounded(native.speak(id, text, locale, voiceId, rate), 2000)
  },
  stop: async (): Promise<void> => {
    await bounded(bridge()?.stop() ?? Promise.resolve(), 1500)
  },
  dispose: (): void => {
    try {
      bridge()?.dispose()
    } catch {
      /* Text remains usable. */
    }
  },
  subscribe: (listener: (event: SpeechOutputEvent) => void): (() => void) => {
    const native = bridge()
    if (!native) return () => undefined
    const subscription = new NativeEventEmitter(native).addListener(
      "SpeechOutputEvent",
      listener,
    )
    return () => subscription.remove()
  },
}
