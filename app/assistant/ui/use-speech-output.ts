import { useCallback, useEffect, useRef, useState } from "react"
import { AccessibilityInfo, AppState } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import type { AssistantRuntime } from "./assistant-runtime"
import { nativeSpeechOutput } from "./native-speech-output"
import { PriceDisplay } from "./price-presentation"
import { spokenReplyFor, SpokenReply } from "./spoken-reply"
import type { ThreadEntry } from "./thread-store"
let nextPlayback = 0
export const useSpeechOutput = (options: {
  enabled: boolean
  runtime: AssistantRuntime
  LL: TranslationFunctions
  locale: string
  display: PriceDisplay
  bitcoinWalletEnabled: boolean
}) => {
  const latest = useRef(options)
  latest.current = options
  const mounted = useRef(true)
  const focused = useRef(false)
  const generation = useRef(0)
  const screenReader = useRef(true) // Fail silent until accessibility state is known.
  const active = useRef<{ id: string; entryId: string; automatic: boolean }>()
  const [entryId, setEntryId] = useState<string>()
  const [preparing, setPreparing] = useState(false)
  const [problem, setProblem] = useState<"unavailable" | "failed">()
  const clear = useCallback(() => {
    active.current = undefined
    if (mounted.current) {
      setEntryId(undefined)
      setPreparing(false)
    }
  }, [])
  const stop = useCallback(async () => {
    generation.current += 1
    clear()
    try {
      await nativeSpeechOutput.stop()
    } catch (error) {
      if (mounted.current) setProblem("failed")
      throw error
    }
  }, [clear])
  const dispose = useCallback(() => {
    generation.current += 1
    clear()
    nativeSpeechOutput.dispose()
  }, [clear])
  const play = useCallback(
    async (entry: ThreadEntry, automatic?: boolean, prepared?: SpokenReply) => {
      const { enabled, LL, locale, display, bitcoinWalletEnabled } = latest.current
      if (!enabled || !focused.current || AppState.currentState !== "active") return
      const reply =
        prepared ?? spokenReplyFor(entry, { LL, locale, display, bitcoinWalletEnabled })
      if (!reply || (automatic && (!reply.automatic || screenReader.current))) return
      generation.current += 1
      const epoch = generation.current
      nextPlayback += 1
      const id = `speech-${Date.now()}-${nextPlayback}`
      active.current = { id, entryId: entry.id, automatic: automatic === true }
      if (mounted.current) {
        setEntryId(entry.id)
        setPreparing(true)
        setProblem(undefined)
      }
      try {
        await nativeSpeechOutput.stop()
        if (generation.current !== epoch) return
        const supported = await nativeSpeechOutput.available(reply.locale)
        if (generation.current !== epoch || !focused.current || !latest.current.enabled)
          return
        if (!supported) {
          clear()
          setProblem("unavailable")
          return
        }
        const settings = latest.current.runtime.speechPreference.settings()
        await nativeSpeechOutput.speak(id, reply.text, {
          locale: reply.locale,
          ...settings,
        })
        if (generation.current === epoch && mounted.current) setPreparing(false)
      } catch {
        if (generation.current === epoch && mounted.current) {
          clear()
          setProblem("failed")
        }
        // Only this generation can stop output; an old rejection cannot stop a new reply.
        if (generation.current === epoch) nativeSpeechOutput.stop().catch(() => undefined)
      }
    },
    [clear],
  )
  useEffect(() => {
    mounted.current = true
    const unsubscribe = nativeSpeechOutput.subscribe((event) => {
      if (active.current?.id !== event.playbackId) return
      if (event.type === "started") setPreparing(false)
      else {
        clear()
        if (event.type === "error") setProblem("failed")
      }
    })
    AccessibilityInfo.isScreenReaderEnabled().then(
      (value) => {
        if (mounted.current) screenReader.current = value
      },
      () => undefined,
    )
    const reader = AccessibilityInfo.addEventListener("screenReaderChanged", (value) => {
      screenReader.current = value
      if (value && active.current?.automatic) dispose()
    })
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") dispose()
    })
    return () => {
      mounted.current = false
      dispose()
      unsubscribe()
      reader.remove()
      app.remove()
    }
  }, [clear, dispose])
  useFocusEffect(
    useCallback(() => {
      focused.current = true
      const unsubscribe = options.runtime.completedTurns.subscribe((turn) => {
        const { enabled, runtime, LL, locale, display, bitcoinWalletEnabled } =
          latest.current
        if (!enabled || !runtime.speechPreference.get() || screenReader.current) return
        const candidates = turn.entries.flatMap((entry) => {
          const spoken = spokenReplyFor(entry, {
            LL,
            locale,
            display,
            bitcoinWalletEnabled,
          })
          return spoken?.automatic ? [{ entry, spoken }] : []
        })
        const first = candidates[0]
        if (!first) return
        const text = candidates
          .filter(({ spoken }) => spoken.locale === first.spoken.locale)
          .map(({ spoken }) => spoken.text)
          .join(". ")
        if (text.length <= 4000) play(first.entry, true, { ...first.spoken, text })
      })
      return () => {
        focused.current = false
        unsubscribe()
        dispose()
      }
    }, [options.runtime, dispose, play]),
  )
  useEffect(() => {
    if (!options.enabled) dispose()
  }, [options.enabled, dispose])
  return { entryId, preparing, problem, play, stop, dispose }
}
