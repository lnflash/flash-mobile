import React, { useEffect, useState, useSyncExternalStore } from "react"
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { nativeSpeechOutput, OfflineVoice } from "./native-speech-output"
import { useVoicePack, voicePack } from "./voice-pack"
import type { SpeechPreference } from "./speech-preference"

export const SpeechSettings = ({
  preference,
  locale,
  LL,
  onClose,
  onChange,
  onPreview,
  previewing,
  problem,
}: {
  preference: SpeechPreference
  locale: string
  LL: TranslationFunctions
  onClose: () => void
  onChange: () => void
  problem?: "unavailable" | "failed"
  previewing: boolean
  onPreview: (restart?: boolean) => void
}) => {
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const { height, fontScale } = useWindowDimensions()
  const { colors } = useTheme().theme
  const enabled = useSyncExternalStore(preference.subscribe, preference.get)
  const settings = useSyncExternalStore(preference.subscribe, preference.settings)
  const pack = useVoicePack()
  const [packError, setPackError] = useState(false)
  const [voices, setVoices] = useState<OfflineVoice[]>()
  useEffect(() => {
    let current = true
    const refresh = () =>
      nativeSpeechOutput.voices(locale).then((list) => {
        if (current) setVoices(list)
      })
    refresh()
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh()
    })
    return () => {
      current = false
      app.remove()
    }
  }, [locale, pack.phase])
  const select = (voiceId?: string) => {
    preference.configure({ ...settings, voiceId })
    onPreview(true)
  }
  const accentName = (language: string) => {
    const names: Record<string, string> = {
      "en-US": LL.AskFlashSpeech.accentUS(),
      "en-GB": LL.AskFlashSpeech.accentGB(),
      "en-AU": LL.AskFlashSpeech.accentAU(),
      "en-IE": LL.AskFlashSpeech.accentIE(),
      "en-IN": LL.AskFlashSpeech.accentIN(),
      "en-ZA": LL.AskFlashSpeech.accentZA(),
      "en-CA": LL.AskFlashSpeech.accentCA(),
      "en-NZ": LL.AskFlashSpeech.accentNZ(),
    }
    return names[language] ?? language
  }
  const visibleVoices =
    pack.phase === "ready" ? voices?.filter((voice) => voice.source === "pack") : []
  const hasPackVoices = Boolean(visibleVoices?.length)
  useEffect(() => {
    const curated = voices?.filter((voice) => voice.source === "pack")
    if (pack.phase !== "ready" || !curated?.length) return
    if (!curated.some((voice) => voice.id === settings.voiceId)) {
      preference.configure({ ...settings, voiceId: curated[0].id })
    }
  }, [pack.phase, voices, preference, settings])
  const selectedVoice =
    voices?.find((voice) => voice.id === settings.voiceId) ?? voices?.[0]
  const voiceRow = (voice?: OfflineVoice) => {
    const selected = voice ? settings.voiceId === voice.id : !settings.voiceId
    const title = voice?.name ?? LL.AskFlashSpeech.recommended()
    const subtitle = voice
      ? [
          accentName(voice.language),
          voice.source === "pack"
            ? ""
            : voice.quality >= 3
            ? LL.AskFlashSpeech.premium()
            : voice.quality >= 2
            ? LL.AskFlashSpeech.enhanced()
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : selectedVoice
      ? `${selectedVoice.name} · ${accentName(selectedVoice.language)}`
      : LL.AskFlashSpeech.voice()
    return (
      <TouchableOpacity
        key={voice?.id ?? "recommended"}
        testID="ask-flash-voice-choice"
        accessibilityRole="radio"
        accessibilityLabel={`${title}, ${subtitle}`}
        accessibilityState={{ checked: selected }}
        style={[styles.voiceRow, selected && styles.selectedRow]}
        onPress={() => select(voice?.id)}
      >
        <View style={styles.label}>
          <Text type="p2" bold>
            {title}
          </Text>
          <Text type="p3" color={colors.grey1}>
            {subtitle}
          </Text>
        </View>
        <Icon
          type="ionicon"
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={selected ? colors.primary : colors.grey3}
        />
      </TouchableOpacity>
    )
  }
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={LL.AskFlashSpeech.done()}
          onPress={onClose}
        />
        <View
          testID="ask-flash-voice-settings"
          style={[
            styles.container,
            {
              height: Math.min(
                height * (fontScale > 1.3 ? 0.92 : 0.74),
                height - insets.top - 12,
              ),
              paddingBottom: Math.max(insets.bottom, 12),
              paddingLeft: Math.max(insets.left, 20),
              paddingRight: Math.max(insets.right, 20),
            },
          ]}
        >
          <>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.label}>
                <Text type="h2" bold>
                  {LL.AskFlashSpeech.voice()}
                </Text>
                <Text type="p3" color={colors.grey1}>
                  {LL.AskFlashSpeech.sampleHint()}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={LL.AskFlashSpeech.setupTitle()}
                style={styles.iconButton}
                onPress={() =>
                  Alert.alert(
                    LL.AskFlashSpeech.setupTitle(),
                    LL.AskFlashSpeech.preferenceDescription(),
                  )
                }
              >
                <Icon
                  type="ionicon"
                  name="information-circle-outline"
                  size={22}
                  color={colors.grey1}
                />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.done}
                onPress={onClose}
              >
                <Text type="p3" bold color={colors.primary}>
                  {LL.AskFlashSpeech.done()}
                </Text>
              </TouchableOpacity>
            </View>
            {pack.supported && (pack.sourceAvailable || pack.phase === "ready") ? (
              <View style={styles.packCard}>
                <View style={styles.label}>
                  <Text type="p3" bold>
                    {LL.AskFlashSpeech.packTitle()}
                  </Text>
                  <Text type="p3" color={colors.grey1}>
                    {pack.phase === "ready"
                      ? LL.AskFlashSpeech.packReady()
                      : pack.phase === "downloading"
                      ? `${Math.round(
                          (pack.receivedBytes / Math.max(1, pack.totalBytes)) * 100,
                        )}%`
                      : LL.AskFlashSpeech.packSize({
                          size: (pack.totalBytes / 1_000_000).toFixed(1),
                        })}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.iconButton}
                  accessibilityLabel={
                    pack.phase === "ready"
                      ? LL.AskFlashSpeech.packRemove()
                      : pack.phase === "downloading"
                      ? LL.AskFlashSpeech.cancel()
                      : LL.AskFlashSpeech.packDownload()
                  }
                  onPress={() => {
                    setPackError(false)
                    if (pack.phase === "downloading")
                      voicePack.cancel().catch(() => setPackError(true))
                    else if (pack.phase === "ready") {
                      onChange()
                      voicePack
                        .remove()
                        .then(() => {
                          const latest = preference.settings()
                          if (latest.voiceId?.startsWith("flash:"))
                            preference.configure({ ...latest, voiceId: undefined })
                        })
                        .catch(() => setPackError(true))
                    } else
                      voicePack
                        .download()
                        .then((value) => {
                          if (value?.phase === "ready") {
                            preference.configure({
                              ...preference.settings(),
                              voiceId: "flash:af_heart",
                            })
                          }
                        })
                        .catch(() => setPackError(true))
                  }}
                >
                  <Icon
                    type="ionicon"
                    name={
                      pack.phase === "ready"
                        ? "trash-outline"
                        : pack.phase === "downloading"
                        ? "close-circle-outline"
                        : "download-outline"
                    }
                    size={22}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              </View>
            ) : null}
            {packError || pack.phase === "failed" ? (
              <Text type="p3" accessibilityRole="alert" style={styles.notice}>
                {LL.AskFlashSpeech.packFailed()}
              </Text>
            ) : null}
            <View style={styles.controls}>
              <View style={styles.controlRow}>
                <Text type="p3" style={styles.label}>
                  {LL.AskFlashSpeech.automatic()}
                </Text>
                <Switch
                  accessibilityLabel={LL.AskFlashSpeech.automatic()}
                  value={enabled}
                  trackColor={{ true: colors.primary }}
                  onValueChange={(value) => {
                    onChange()
                    preference.set(value)
                  }}
                />
              </View>
              <View style={[styles.controlRow, styles.divider]}>
                <Text type="p3" style={styles.label}>
                  {LL.AskFlashSpeech.speed()}
                </Text>
                <View style={styles.segments}>
                  {[0.8, 1, 1.2].map((rate) => (
                    <TouchableOpacity
                      key={rate}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: settings.rate === rate }}
                      style={[
                        styles.segment,
                        settings.rate === rate && styles.activeSegment,
                      ]}
                      onPress={() => {
                        onChange()
                        preference.configure({ ...settings, rate })
                      }}
                    >
                      <Text type="p3" bold={settings.rate === rate}>
                        {rate}×
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {hasPackVoices ? null : voiceRow()}
              {voices === undefined ? (
                <Text type="p3" style={styles.notice}>
                  {LL.AskFlashSpeech.loadingVoices()}
                </Text>
              ) : voices.length === 0 ? (
                <Text type="p3" style={styles.notice}>
                  {LL.AskFlashSpeech.unavailable()}
                </Text>
              ) : (
                visibleVoices?.map((voice) => voiceRow(voice))
              )}
              {settings.voiceId &&
              voices &&
              !voices.some((voice) => voice.id === settings.voiceId) ? (
                <Text type="p3" style={styles.notice}>
                  {LL.AskFlashSpeech.voiceMissing()}
                </Text>
              ) : null}
            </ScrollView>
            {problem ? (
              <Text type="p3" style={styles.notice} accessibilityRole="alert">
                {problem === "unavailable"
                  ? LL.AskFlashSpeech.unavailable()
                  : LL.AskFlashSpeech.failed()}
              </Text>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !voices?.length }}
              style={[styles.preview, !voices?.length && styles.disabled]}
              disabled={!voices?.length}
              onPress={() => onPreview()}
            >
              <Icon
                type="ionicon"
                name={previewing ? "stop" : "play"}
                size={18}
                color={colors.textInverse}
              />
              <Text type="p3" bold color={colors.textInverse}>
                {previewing ? LL.AskFlashSpeech.stop() : LL.AskFlashSpeech.preview()}
              </Text>
            </TouchableOpacity>
          </>
        </View>
      </View>
    </Modal>
  )
}
const useStyles = makeStyles(({ colors }) => ({
  overlay: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  container: {
    width: "100%",
    maxWidth: 520,
    minWidth: 0,
    backgroundColor: colors.layer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.grey4,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  packCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.grey5,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: 14 },
  label: { flex: 1, minWidth: 0, flexShrink: 1 },
  iconButton: {
    width: 44,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  done: { minHeight: 48, paddingLeft: 8, justifyContent: "center" },
  controls: { backgroundColor: colors.grey5, borderRadius: 16, paddingHorizontal: 14 },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 54,
    paddingVertical: 3,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.grey4 },
  segments: {
    flexDirection: "row",
    backgroundColor: colors.grey4,
    borderRadius: 10,
    padding: 3,
    flexShrink: 1,
  },
  segment: {
    minWidth: 48,
    minHeight: 42,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  activeSegment: { backgroundColor: colors.layer },
  scroll: {
    marginTop: 12,
    flex: 1,
    width: "100%",
    borderRadius: 16,
    backgroundColor: colors.grey5,
  },
  content: { padding: 4 },
  voiceRow: {
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
  },
  selectedRow: { backgroundColor: colors.layer },
  notice: { padding: 12, flexShrink: 1 },
  preview: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  disabled: { opacity: 0.5 },
}))
