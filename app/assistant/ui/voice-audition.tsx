import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { AppState, NativeModules, ScrollView, TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { nativeSpeechOutput } from "./native-speech-output"
import { createAuditionDownload, AuditionFS } from "./voice-audition-download"
import { createAuditionTransfer } from "./voice-audition-transfer"
import { AUDITION_FILES } from "./voice-audition-files"
import { AUDITION_SCRIPTS, AUDITION_VOICES } from "./voice-audition-catalog"
let store: ReturnType<typeof createAuditionDownload> | undefined
const auditionStore = () => {
  if (!__DEV__) throw new Error("Audition unavailable")
  if (!store) {
    // Keep the existing filesystem module lazy; the regular voice menu never initializes a download.
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- Initialize file I/O only inside the explicit Debug audition.
    const fs = require("react-native-fs") as AuditionFS & {
      CachesDirectoryPath: string
      writeFile: (path: string, value: string, encoding: string) => Promise<void>
    }
    store = createAuditionDownload({
      fs: {
        ...fs,
        ...createAuditionTransfer({
          files: AUDITION_FILES,
          write: (path, value) => fs.writeFile(path, value, "base64"),
        }),
      },
      root: `${fs.CachesDirectoryPath}/flash-voice-audition`,
      files: AUDITION_FILES,
      baseUrl: () => {
        const source = NativeModules.SourceCode
        const script = source?.getConstants?.().scriptURL ?? source?.scriptURL
        const host =
          typeof script === "string"
            ? /^https?:\/\/(\[[^\]]+\]|[^/:]+)/.exec(script)?.[1]
            : undefined
        if (!host) throw new Error("Development server unavailable")
        return `http://${host}:18083`
      },
    })
  }
  return store
}
let nextSample = 0
export const VoiceAudition = ({
  LL,
  onBack,
}: {
  LL: TranslationFunctions
  onBack: () => void
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const [download] = useState(auditionStore)
  const state = useSyncExternalStore(download.subscribe, download.get)
  const [script, setScript] = useState<(typeof AUDITION_SCRIPTS)[number]>(
    AUDITION_SCRIPTS[0],
  )
  const [playing, setPlaying] = useState<string>()
  const [failed, setFailed] = useState(false)
  const generation = useRef(0)
  const active = useRef<string>()
  const mounted = useRef(true)
  const stop = useCallback(async () => {
    generation.current += 1
    active.current = undefined
    if (mounted.current) setPlaying(undefined)
    await nativeSpeechOutput.stop()
  }, [])
  useEffect(() => {
    mounted.current = true
    download.check()
    const unsubscribe = nativeSpeechOutput.subscribe((event) => {
      if (event.playbackId !== active.current || event.type === "started") return
      active.current = undefined
      setPlaying(undefined)
      if (event.type === "error") setFailed(true)
    })
    const app = AppState.addEventListener("change", (value) => {
      if (value === "active") {
        download.check()
      } else {
        download.cancel()
        stop().catch(() => undefined)
      }
    })
    return () => {
      mounted.current = false
      generation.current += 1
      unsubscribe()
      app.remove()
      download.cancel()
      nativeSpeechOutput.stop().catch(() => undefined)
    }
  }, [download, stop])
  const play = async (voice: (typeof AUDITION_VOICES)[number]) => {
    if (playing === voice.id) {
      await stop()
      return
    }
    generation.current += 1
    const epoch = generation.current
    nextSample += 1
    const id = `audition-${Date.now()}-${nextSample}`
    active.current = id
    setPlaying(voice.id)
    setFailed(false)
    try {
      await nativeSpeechOutput.stop()
      if (epoch !== generation.current || !mounted.current) return
      await nativeSpeechOutput.playSample(
        id,
        download.path(`${voice.id}-${script.id}.wav`),
      )
    } catch {
      if (epoch === generation.current && mounted.current) {
        active.current = undefined
        setPlaying(undefined)
        setFailed(true)
        nativeSpeechOutput.stop().catch(() => undefined)
      }
    }
  }
  const leave = async () => {
    download.cancel()
    await stop()
    onBack()
  }
  const busy = ["checking", "downloading", "canceling", "removing"].includes(state.phase)
  const bytes = AUDITION_FILES.reduce((sum, file) => sum + file.bytes, 0)
  return (
    <View style={styles.container} testID="ask-flash-voice-audition">
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={LL.AskFlashSpeech.auditionBack()}
          style={styles.back}
          onPress={() => leave().catch(() => setFailed(true))}
        >
          <Icon type="ionicon" name="chevron-back" size={24} color={colors.black} />
        </TouchableOpacity>
        <Text type="h2" bold style={styles.label}>
          {LL.AskFlashSpeech.auditionTitle()}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text type="p3" color={colors.grey1}>
          {LL.AskFlashSpeech.auditionDescription()}
        </Text>
        {state.phase === "ready" ? (
          <>
            <View style={styles.segments}>
              {AUDITION_SCRIPTS.map((sample) => (
                <TouchableOpacity
                  key={sample.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: script.id === sample.id }}
                  style={[styles.segment, script.id === sample.id && styles.selected]}
                  onPress={() => {
                    stop().catch(() => setFailed(true))
                    setScript(sample)
                  }}
                >
                  <Text type="p3">
                    {sample.id === "welcome"
                      ? LL.AskFlashSpeech.auditionWelcome()
                      : sample.id === "guidance"
                      ? LL.AskFlashSpeech.auditionGuidance()
                      : LL.AskFlashSpeech.auditionAmounts()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {AUDITION_VOICES.map((voice) => (
              <TouchableOpacity
                key={voice.id}
                testID={`ask-flash-audition-${voice.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${voice.name}, ${
                  playing === voice.id
                    ? LL.AskFlashSpeech.stop()
                    : LL.AskFlashSpeech.preview()
                }`}
                style={styles.voice}
                onPress={() => play(voice).catch(() => setFailed(true))}
              >
                <View style={styles.label}>
                  <Text type="p2" bold>
                    {voice.name}
                  </Text>
                  <Text type="p3" color={colors.grey1}>
                    {voice.language === "en-GB"
                      ? LL.AskFlashSpeech.accentGB()
                      : LL.AskFlashSpeech.accentUS()}
                  </Text>
                </View>
                <Icon
                  type="ionicon"
                  name={playing === voice.id ? "stop-circle" : "play-circle"}
                  size={32}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ))}
            <Text type="p3" color={colors.grey1}>
              {script.text}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.action}
              onPress={async () => {
                try {
                  await stop()
                  await download.remove()
                } catch {
                  setFailed(true)
                }
              }}
            >
              <Text type="p3">{LL.AskFlashSpeech.auditionDelete()}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.card}>
            <Text type="p2" bold>
              {LL.AskFlashSpeech.auditionDownloadTitle()}
            </Text>
            <Text type="p3">
              {LL.AskFlashSpeech.auditionDownloadSize({
                size: (bytes / 1_000_000).toFixed(1),
              })}
            </Text>
            {state.phase === "downloading" || state.phase === "canceling" ? (
              <>
                <Text
                  type="p3"
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: 100,
                    now: Math.round(state.progress * 100),
                  }}
                >
                  {Math.round(state.progress * 100)}%
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.action}
                  disabled={state.phase === "canceling"}
                  onPress={download.cancel}
                >
                  <Text type="p3">{LL.AskFlashSpeech.cancel()}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.primary}
                disabled={busy}
                onPress={() => download.download()}
              >
                <Text type="p3" bold color={colors.textInverse}>
                  {state.phase === "error"
                    ? LL.AskFlashSpeech.auditionRetry()
                    : LL.AskFlashSpeech.auditionDownload()}
                </Text>
              </TouchableOpacity>
            )}
            {state.phase === "error" ? (
              <Text type="p3" accessibilityRole="alert">
                {LL.AskFlashSpeech.auditionDownloadFailed()}
              </Text>
            ) : null}
          </View>
        )}
        {failed ? (
          <Text type="p3" accessibilityRole="alert">
            {LL.AskFlashSpeech.failed()}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  )
}
const useStyles = makeStyles(({ colors }) => ({
  container: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10 },
  back: { minHeight: 48, width: 44, justifyContent: "center" },
  label: { flex: 1, minWidth: 0, flexShrink: 1 },
  content: { gap: 12, paddingBottom: 16 },
  card: { backgroundColor: colors.grey5, borderRadius: 16, padding: 16, gap: 12 },
  action: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  primary: {
    minHeight: 48,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  segments: {
    flexDirection: "row",
    backgroundColor: colors.grey5,
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  selected: { backgroundColor: colors.layer },
  voice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
}))
