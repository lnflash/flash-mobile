import { useEffect, useSyncExternalStore } from "react"
import { AppState, NativeEventEmitter, NativeModules } from "react-native"
import Config from "react-native-config"
export type VoicePackState = {
  phase: "missing" | "downloading" | "ready" | "failed"
  receivedBytes: number
  totalBytes: number
}
type Bridge = {
  packState: () => Promise<VoicePackState>
  downloadPack: (source: string) => Promise<VoicePackState>
  cancelPack: () => Promise<VoicePackState>
  removePack: () => Promise<VoicePackState>
  addListener: (event: string) => void
  removeListeners: (count: number) => void
}
const bridge = (): Bridge | undefined => NativeModules.SpeechOutputBridge
export const voicePackSource = (): string | undefined => {
  if (__DEV__) {
    const source = NativeModules.SourceCode
    const script = source?.getConstants?.().scriptURL ?? source?.scriptURL
    const host =
      typeof script === "string"
        ? /^https?:\/\/(\[[^\]]+\]|[^/:]+)/.exec(script)?.[1]
        : undefined
    if (host) return `http://${host}:18083/neural-v1`
  }
  // Production hosting is an explicit build setting; never invent a download URL or publish assets.
  const source = Config.FLASH_VOICE_PACK_BASE_URL
  return typeof source === "string" && /^https:\/\/[^?#]+$/.test(source)
    ? source.replace(/\/$/, "")
    : undefined
}
let snapshot: VoicePackState = { phase: "missing", receivedBytes: 0, totalBytes: 0 }
const listeners = new Set<() => void>()
let lastProgressAt = 0
const publish = (value: VoicePackState) => {
  if (
    !["missing", "downloading", "ready", "failed"].includes(value.phase) ||
    !Number.isFinite(value.totalBytes) ||
    !Number.isFinite(value.receivedBytes)
  )
    return
  if (value.phase === "downloading" && snapshot.phase === "downloading") {
    const percent = (state: VoicePackState) =>
      Math.round((state.receivedBytes / Math.max(1, state.totalBytes)) * 100)
    if (percent(value) === percent(snapshot) || Date.now() - lastProgressAt < 200) return
  }
  snapshot = value
  if (value.phase === "downloading") lastProgressAt = Date.now()
  listeners.forEach((listener) => listener())
}
const run = async (work?: Promise<VoicePackState>) => {
  if (work) {
    const value = await work
    publish(value)
    return value
  }
}
export const voicePack = {
  get: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  refresh: () => run(bridge()?.packState?.()),
  download: () => {
    const source = voicePackSource()
    const native = bridge()
    if (!source || !native?.downloadPack)
      return Promise.reject(new Error("Voice pack unavailable"))
    return run(native.downloadPack(source))
  },
  cancel: () => run(bridge()?.cancelPack?.()),
  remove: () => run(bridge()?.removePack?.()),
}
export const useVoicePack = () => {
  const state = useSyncExternalStore(voicePack.subscribe, voicePack.get)
  useEffect(() => {
    let mounted = true
    voicePack.refresh().catch(() => undefined)
    const native = bridge()
    const listener = native?.packState
      ? new NativeEventEmitter(native).addListener(
          "SpeechPackEvent",
          (value: VoicePackState) => {
            if (mounted) publish(value)
          },
        )
      : undefined
    const app = AppState.addEventListener("change", (value) => {
      if (value === "active") voicePack.refresh().catch(() => undefined)
      else voicePack.cancel().catch(() => undefined)
    })
    return () => {
      mounted = false
      listener?.remove()
      app.remove()
    }
  }, [])
  return {
    ...state,
    supported: Boolean(bridge()?.packState),
    sourceAvailable: Boolean(voicePackSource()),
  }
}
