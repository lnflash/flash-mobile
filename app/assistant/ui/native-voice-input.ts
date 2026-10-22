/* eslint-disable react-native/split-platform-components -- This native adapter gates permissions by Platform.OS. */
import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from "react-native"

export type VoicePermission = "granted" | "denied" | "blocked" | "restricted"
export type VoiceEvent = {
  sessionId: string
  type: "started" | "interim" | "final" | "error" | "end"
  text?: string
}

type NativeVoice = {
  capability: (locale: string) => Promise<boolean>
  requestPermission: () => Promise<VoicePermission>
  start: (sessionId: string, locale: string, contextualStrings: string[]) => void
  stop: (sessionId: string) => void
  abort: (sessionId: string) => void
  addListener: (event: string) => void
  removeListeners: (count: number) => void
}

const bridge = (): NativeVoice | undefined => NativeModules.VoiceInputBridge

// Explicit English fallback: the app's display language never selects a model.
// en-JM cannot be assumed to have an installed offline model.
export const VOICE_LOCALE = "en-US"

export const nativeVoiceInput = {
  async available(): Promise<boolean> {
    try {
      return (await bridge()?.capability(VOICE_LOCALE)) === true
    } catch {
      return false
    }
  },
  async permission(): Promise<VoicePermission> {
    const native = bridge()
    if (!native) return "blocked"
    try {
      if (Platform.OS !== "android") return await native.requestPermission()
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      )
      if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted"
      return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? "blocked" : "denied"
    } catch {
      return "blocked"
    }
  },
  subscribe(listener: (event: VoiceEvent) => void): () => void {
    const native = bridge()
    if (!native) return () => undefined
    const subscription = new NativeEventEmitter(native).addListener(
      "VoiceInputEvent",
      listener,
    )
    return () => subscription.remove()
  },
  start(id: string, contextualStrings: readonly string[] = []): void {
    const native = bridge()
    if (!native) throw new Error("Voice unavailable")
    native.start(id, VOICE_LOCALE, [...contextualStrings].slice(0, 100))
  },
  stop(id: string): void {
    bridge()?.stop(id)
  },
  abort(id: string): void {
    bridge()?.abort(id)
  },
}
