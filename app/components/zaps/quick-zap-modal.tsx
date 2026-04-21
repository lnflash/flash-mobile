import React, { useEffect, useRef, useState } from "react"
import {
  Modal,
  Pressable,
  TextInput,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import AsyncStorage from "@react-native-async-storage/async-storage"
import Icon from "react-native-vector-icons/Ionicons"

const STORAGE_KEY = "@quick_zap_presets"
const INITIAL_PRESETS = [21, 100, 500, 1000]

type Props = {
  visible: boolean
  initialAmount?: number | null
  recipientName?: string
  onClose: () => void
  onZap: (amount: number, saveAsDefault: boolean) => Promise<void>
}

export const QuickZapModal: React.FC<Props> = ({
  visible,
  initialAmount,
  recipientName,
  onClose,
  onZap,
}) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()

  const inputRef = useRef<TextInput>(null)
  const inFlightRef = useRef(false)
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : "")
  const [saveAsDefault, setSaveAsDefault] = useState(true)
  const [loading, setLoading] = useState(false)
  const [presets, setPresets] = useState<number[]>([])

  // Load presets from storage on mount; seed with defaults only if nothing stored yet
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setPresets(JSON.parse(raw))
        } catch {
          setPresets(INITIAL_PRESETS)
        }
      } else {
        setPresets(INITIAL_PRESETS)
      }
    })
  }, [])

  // Reset input when modal opens
  useEffect(() => {
    if (visible) {
      setAmount(initialAmount ? String(initialAmount) : "")
      setLoading(false)
      inFlightRef.current = false
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible])

  const sats = Number(amount) || 0
  const canAddToPresets = sats > 0 && !presets.includes(sats)

  const savePresets = (next: number[]) => {
    setPresets(next)
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const handleAddPreset = () => {
    if (!canAddToPresets) return
    savePresets([...presets, sats])
  }

  const handleRemovePreset = (preset: number) => {
    savePresets(presets.filter((p) => p !== preset))
  }

  const handleZap = async () => {
    if (sats <= 0 || inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    try {
      await onZap(sats, saveAsDefault)
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Send Zap</Text>
              {recipientName ? (
                <Text style={styles.subtitle}>to {recipientName}</Text>
              ) : null}
            </View>

            {/* Amount input */}
            <View style={styles.amountRow}>
              <TextInput
                ref={inputRef}
                style={[styles.amountInput, { color: colors.primary3 }]}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.grey3}
                maxLength={8}
              />
              <Text style={styles.satsLabel}>sats</Text>
            </View>

            {/* Preset chips — scroll horizontally so custom amounts don't overflow */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presets}
            >
              {presets.map((preset) => {
                const active = sats === preset
                return (
                  <Pressable
                    key={preset}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? colors.primary : colors.grey4,
                        backgroundColor: active ? colors.primary + "22" : "transparent",
                      },
                    ]}
                    onPress={() => setAmount(String(preset))}
                    onLongPress={() => handleRemovePreset(preset)}
                  >
                    <Text
                      style={[styles.chipText, { color: active ? colors.primary : colors.grey2 }]}
                    >
                      {preset}
                    </Text>
                    <Icon name="close-circle" size={13} color={colors.grey3} style={styles.chipX} />
                  </Pressable>
                )
              })}

              {/* Add current amount as a preset */}
              {canAddToPresets && (
                <Pressable
                  style={[styles.chip, styles.chipAdd, { borderColor: colors.primary }]}
                  onPress={handleAddPreset}
                >
                  <Icon name="add" size={14} color={colors.primary} />
                  <Text style={[styles.chipText, { color: colors.primary, marginLeft: 2 }]}>
                    {sats}
                  </Text>
                </Pressable>
              )}
            </ScrollView>

            <Text style={styles.hintText}>Long press a custom amount to remove it</Text>

            {/* Save as default */}
            <Pressable style={styles.defaultRow} onPress={() => setSaveAsDefault((v) => !v)}>
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: colors.primary,
                    backgroundColor: saveAsDefault ? colors.primary : "transparent",
                  },
                ]}
              />
              <Text style={styles.defaultText}>Save as default quick zap</Text>
            </Pressable>

            {/* Zap button */}
            <Pressable
              style={[
                styles.zapBtn,
                {
                  backgroundColor: sats > 0 ? colors.primary : colors.grey4,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleZap}
              disabled={sats <= 0 || loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.zapBtnText}>
                  {sats > 0 ? `Zap ${sats} sats` : "Enter an amount"}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const useStyles = makeStyles(({ colors, mode }) => ({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: mode === "dark" ? colors.grey5 : "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: { marginBottom: 24 },
  title: { fontSize: 20, fontWeight: "700", color: colors.primary3 },
  subtitle: { fontSize: 14, color: colors.grey2, marginTop: 2 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingBottom: 8,
  },
  amountInput: { flex: 1, fontSize: 40, fontWeight: "700", padding: 0 },
  satsLabel: { fontSize: 18, fontWeight: "600", color: colors.grey2, marginLeft: 8 },
  presets: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
    paddingRight: 4,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chipAdd: {
    borderStyle: "dashed",
  },
  chipText: { fontWeight: "600", fontSize: 15 },
  chipX: { marginLeft: 4 },
  hintText: { fontSize: 11, color: colors.grey3, marginBottom: 18 },
  defaultRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    marginRight: 10,
  },
  defaultText: { fontSize: 14, color: colors.grey2 },
  zapBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  zapBtnText: { color: "white", fontSize: 16, fontWeight: "700" },
}))
