import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"

import { logAssistantVoiceUsed } from "@app/utils/analytics"
import { nativeVoiceInput, VoiceEvent } from "./native-voice-input"

export type VoicePhase =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "finalizing"
  | "error"
export type VoiceProblem = "permission" | "unavailable" | "failed"
type Session = {
  id: string
  held: boolean
  native: boolean
  ended: boolean
  final?: string
  failed: boolean
  startedAt?: number
  captureEndedAt?: number
}
let nextSession = 0

/** One hold owns the preview until it is released and the native session ends. */
export const useVoiceInput = ({
  enabled,
  busy,
  onSubmit,
  beforeCapture,
  contextualStrings,
}: {
  enabled: boolean
  busy: boolean
  beforeCapture?: () => Promise<void>
  contextualStrings?: readonly string[]
  onSubmit: (text: string) => boolean
}) => {
  const [phase, setPhase] = useState<VoicePhase>("idle")
  const [available, setAvailable] = useState<boolean>()
  const [preview, setPreview] = useState("")
  const [problem, setProblem] = useState<VoiceProblem>()
  const [showFinishing, setShowFinishing] = useState(false)
  const session = useRef<Session>()
  const latest = useRef({ enabled, busy, onSubmit, beforeCapture, contextualStrings })
  latest.current = { enabled, busy, onSubmit, beforeCapture, contextualStrings }
  const mounted = useRef(true)
  const focused = useRef(false)
  const deadline = useRef<ReturnType<typeof setTimeout>>()
  const checkGeneration = useRef(0)

  const clearDeadline = useCallback(() => {
    if (deadline.current) clearTimeout(deadline.current)
    deadline.current = undefined
  }, [])

  const reset = useCallback(() => {
    clearDeadline()
    session.current = undefined
    if (mounted.current) {
      setPhase("idle")
      setPreview("")
    }
  }, [clearDeadline])

  const cancel = useCallback(() => {
    const current = session.current
    if (!current) return
    current.held = false
    current.failed = true
    if (mounted.current) {
      setPhase("idle")
      setPreview("")
    }
    if (!current.native || current.ended) {
      reset()
      return
    }
    // Quarantine the native session until end; a new hold cannot reuse it.
    try {
      nativeVoiceInput.abort(current.id)
    } catch {
      /* Fail closed below. */
    }
    clearDeadline()
    deadline.current = setTimeout(() => {
      if (session.current !== current) return
      // A bridge that failed to terminate must not accept another session.
      if (mounted.current) setAvailable(false)
      reset()
    }, 6000)
  }, [clearDeadline, reset])

  const finish = useCallback(
    (current: Session) => {
      if (session.current !== current || current.held || !current.ended) return
      const text = current.final?.trim()
      const canSubmit =
        !current.failed &&
        text &&
        latest.current.enabled &&
        !latest.current.busy &&
        focused.current &&
        AppState.currentState === "active"
      reset() // Claim completion before calling any user code.
      if (canSubmit && latest.current.onSubmit(text)) {
        try {
          logAssistantVoiceUsed({
            ms:
              (current.captureEndedAt ?? Date.now()) - (current.startedAt ?? Date.now()),
            chars: text.length,
          })
        } catch {
          /* Telemetry must never affect submission. */
        }
      }
    },
    [reset],
  )

  const refresh = useCallback(async () => {
    checkGeneration.current += 1
    const generation = checkGeneration.current
    if (!latest.current.enabled || !focused.current || session.current) return
    const supported = await nativeVoiceInput.available()
    if (
      mounted.current &&
      generation === checkGeneration.current &&
      latest.current.enabled
    ) {
      setAvailable(supported)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const unsubscribe = nativeVoiceInput.subscribe((event: VoiceEvent) => {
      const current = session.current
      if (!current || event.sessionId !== current.id || current.ended) return
      if (event.type === "end") {
        current.ended = true
        current.captureEndedAt ??= Date.now()
        clearDeadline()
        if (current.failed) reset()
        else finish(current)
        return
      }
      if (current.failed) return
      switch (event.type) {
        case "started":
          current.startedAt = Date.now()
          if (current.held) setPhase("listening")
          try {
            ReactNativeHapticFeedback.trigger("impactLight")
          } catch {
            /* Optional feedback. */
          }
          break
        case "interim":
          setPreview(event.text ?? "")
          break
        case "final":
          current.final = event.text ?? ""
          setPreview(current.final)
          break
        case "error":
          current.failed = true
          setPreview("")
          if (event.text !== "no-speech" && event.text !== "interrupted") {
            setProblem(
              event.text === "permission"
                ? "permission"
                : event.text === "unavailable"
                ? "unavailable"
                : "failed",
            )
            if (event.text === "unavailable" || event.text === "permission")
              setAvailable(false)
          }
          setPhase("error")
          break
      }
    })
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "background") cancel()
      if (state === "active") refresh()
    })
    return () => {
      mounted.current = false
      checkGeneration.current += 1
      cancel()
      clearDeadline()
      session.current = undefined
      unsubscribe()
      appState.remove()
    }
  }, [cancel, clearDeadline, finish, refresh, reset])

  useFocusEffect(
    useCallback(() => {
      focused.current = true
      if (enabled) refresh()
      return () => {
        focused.current = false
        cancel()
      }
    }, [enabled, cancel, refresh]),
  )

  useEffect(() => {
    if (!enabled || busy) cancel()
    if (!enabled) {
      checkGeneration.current += 1
      setAvailable(false)
    }
  }, [enabled, busy, cancel])

  useEffect(() => {
    setShowFinishing(false)
    if (phase !== "finalizing") return
    const timer = setTimeout(() => setShowFinishing(true), 300)
    return () => clearTimeout(timer)
  }, [phase])

  const start = useCallback(async () => {
    if (
      session.current ||
      !available ||
      !latest.current.enabled ||
      latest.current.busy ||
      !focused.current ||
      AppState.currentState !== "active"
    )
      return
    nextSession += 1
    const current: Session = {
      id: `voice-${nextSession}`,
      held: true,
      native: false,
      ended: false,
      failed: false,
    }
    session.current = current
    setProblem(undefined)
    setPreview("")
    setPhase("requesting-permission")
    if (latest.current.beforeCapture) {
      try {
        await latest.current.beforeCapture()
      } catch {
        if (session.current === current) {
          setProblem("failed")
          reset()
        }
        return
      }
      if (session.current !== current || !current.held || !mounted.current) return
    }
    const permission = await nativeVoiceInput.permission()
    if (session.current !== current || !mounted.current) return
    if (permission !== "granted") {
      setProblem("permission")
      if (permission !== "denied") setAvailable(false)
      reset()
      return
    }
    if (
      !current.held ||
      current.failed ||
      !focused.current ||
      latest.current.busy ||
      !latest.current.enabled
    ) {
      reset()
      return
    }
    current.native = true
    // Native also enforces its own recording/finalization deadlines.
    deadline.current = setTimeout(cancel, 65000)
    try {
      nativeVoiceInput.start(current.id, latest.current.contextualStrings)
    } catch {
      setAvailable(false)
      setProblem("unavailable")
      reset()
    }
  }, [available, cancel, reset])

  const release = useCallback(() => {
    const current = session.current
    if (!current || !current.held || current.failed) return
    current.held = false
    current.captureEndedAt ??= Date.now()
    if (!current.native) {
      reset()
      return
    }
    if (current.ended) {
      finish(current)
      return
    }
    setPhase("finalizing")
    clearDeadline()
    deadline.current = setTimeout(() => {
      setProblem("failed")
      cancel()
    }, 6000)
    try {
      nativeVoiceInput.stop(current.id)
    } catch {
      setProblem("failed")
      cancel()
    }
  }, [cancel, clearDeadline, finish, reset])

  const active =
    phase === "requesting-permission" || phase === "listening" || phase === "finalizing"
  return {
    phase,
    available,
    active,
    preview,
    problem,
    showFinishing,
    start,
    release,
    cancel,
  }
}
