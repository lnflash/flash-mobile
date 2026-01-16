import React, { useState, useEffect } from "react"
import { View, ActivityIndicator } from "react-native"
import Modal from "react-native-modal"
import { Input, makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { PrimaryBtn } from "../buttons"
import { GaloyIcon } from "../atomic/galoy-icon"
import { GaloyErrorBox } from "../atomic/galoy-error-box"

type PinMode = "set" | "change" | "remove"

type Props = {
  isVisible: boolean
  onClose: () => void
  onSubmit: (pin: string, currentPin?: string) => Promise<boolean>
  mode: PinMode
  loading?: boolean
}

/**
 * Modal for PIN entry - supports set, change, and remove modes
 */
const CardPinModal: React.FC<Props> = ({
  isVisible,
  onClose,
  onSubmit,
  mode,
  loading = false,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [currentPin, setCurrentPin] = useState("")
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isVisible) {
      setPin("")
      setConfirmPin("")
      setCurrentPin("")
      setError(undefined)
    }
  }, [isVisible])

  const getTitle = () => {
    switch (mode) {
      case "set":
        return "Set Card PIN"
      case "change":
        return "Change Card PIN"
      case "remove":
        return "Remove Card PIN"
    }
  }

  const getDescription = () => {
    switch (mode) {
      case "set":
        return "Enter a 4-8 digit PIN to protect your card"
      case "change":
        return "Enter your current PIN and a new PIN"
      case "remove":
        return "Enter your current PIN to remove protection"
    }
  }

  const validatePin = (value: string): boolean => {
    if (value.length < 4 || value.length > 8) {
      setError("PIN must be 4-8 digits")
      return false
    }
    if (!/^\d+$/.test(value)) {
      setError("PIN must contain only numbers")
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    setError(undefined)

    // Validate based on mode
    if (mode === "set") {
      if (!validatePin(pin)) return
      if (pin !== confirmPin) {
        setError("PINs do not match")
        return
      }
    } else if (mode === "change") {
      if (!validatePin(currentPin)) {
        setError("Current PIN is invalid")
        return
      }
      if (!validatePin(pin)) return
      if (pin !== confirmPin) {
        setError("New PINs do not match")
        return
      }
      if (pin === currentPin) {
        setError("New PIN must be different from current PIN")
        return
      }
    } else if (mode === "remove") {
      if (!validatePin(currentPin)) {
        setError("Current PIN is invalid")
        return
      }
    }

    setSubmitting(true)
    try {
      const success = await onSubmit(mode === "remove" ? "" : pin, currentPin || undefined)
      if (success) {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handlePinChange = (value: string, setter: (v: string) => void) => {
    // Only allow digits, max 8 characters
    const cleaned = value.replace(/\D/g, "").slice(0, 8)
    setter(cleaned)
    setError(undefined)
  }

  const isLoading = loading || submitting

  return (
    <Modal
      isVisible={isVisible}
      backdropOpacity={0.8}
      backdropColor={colors.white}
      onBackdropPress={onClose}
      avoidKeyboard={true}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text type="h02" bold style={styles.title}>
            {getTitle()}
          </Text>
          <GaloyIcon name="close" size={24} color={colors.grey0} onPress={onClose} />
        </View>

        <Text type="p2" style={styles.description}>
          {getDescription()}
        </Text>

        {/* Current PIN for change/remove modes */}
        {(mode === "change" || mode === "remove") && (
          <View style={styles.inputWrapper}>
            <Text type="p3" style={styles.label}>
              Current PIN
            </Text>
            <Input
              placeholder="Enter current PIN"
              containerStyle={styles.inputContainer}
              inputContainerStyle={styles.inputInner}
              inputStyle={styles.input}
              value={currentPin}
              onChangeText={(v) => handlePinChange(v, setCurrentPin)}
              keyboardType="numeric"
              secureTextEntry
              maxLength={8}
              autoFocus
              editable={!isLoading}
            />
          </View>
        )}

        {/* New PIN for set/change modes */}
        {(mode === "set" || mode === "change") && (
          <>
            <View style={styles.inputWrapper}>
              <Text type="p3" style={styles.label}>
                {mode === "change" ? "New PIN" : "PIN"}
              </Text>
              <Input
                placeholder="Enter 4-8 digit PIN"
                containerStyle={styles.inputContainer}
                inputContainerStyle={styles.inputInner}
                inputStyle={styles.input}
                value={pin}
                onChangeText={(v) => handlePinChange(v, setPin)}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
                autoFocus={mode === "set"}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text type="p3" style={styles.label}>
                Confirm PIN
              </Text>
              <Input
                placeholder="Confirm PIN"
                containerStyle={styles.inputContainer}
                inputContainerStyle={styles.inputInner}
                inputStyle={styles.input}
                value={confirmPin}
                onChangeText={(v) => handlePinChange(v, setConfirmPin)}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
                editable={!isLoading}
              />
            </View>
          </>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <GaloyErrorBox errorMessage={error} />
          </View>
        )}

        {isLoading && (
          <ActivityIndicator
            style={styles.loader}
            size="small"
            color={colors.primary}
          />
        )}

        <View style={styles.buttons}>
          <PrimaryBtn
            label={mode === "remove" ? "Remove PIN" : "Save PIN"}
            onPress={handleSubmit}
            loading={isLoading}
            disabled={isLoading}
          />
          <PrimaryBtn
            type="outline"
            label="Cancel"
            onPress={onClose}
            disabled={isLoading}
          />
        </View>
      </View>
    </Modal>
  )
}

export default CardPinModal

const useStyles = makeStyles(({ colors }) => ({
  container: {
    backgroundColor: colors.grey5,
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: colors.black,
  },
  description: {
    color: colors.grey0,
    marginBottom: 20,
  },
  inputWrapper: {
    marginBottom: 8,
  },
  label: {
    color: colors.grey0,
    marginBottom: 4,
    marginLeft: 4,
  },
  inputContainer: {
    paddingHorizontal: 0,
  },
  inputInner: {
    borderWidth: 1,
    borderColor: colors.border02,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    fontSize: 18,
    letterSpacing: 4,
  },
  errorContainer: {
    marginBottom: 16,
  },
  loader: {
    marginBottom: 16,
  },
  buttons: {
    gap: 12,
    marginTop: 8,
  },
}))
