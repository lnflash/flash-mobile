import React, { useState, useEffect, useCallback } from "react"
import { View, Switch, ActivityIndicator, TextInput } from "react-native"
import Modal from "react-native-modal"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { PrimaryBtn } from "../buttons"
import { GaloyIcon } from "../atomic/galoy-icon"
import { GaloyErrorBox } from "../atomic/galoy-error-box"
import CardPinModal from "./CardPinModal"
import NfcVerificationModal from "./NfcVerificationModal"

// hooks
import { useFlashcard } from "@app/hooks"

// utils
import { formatCardIdForDisplay } from "@app/utils/boltcard-url"

type Props = {
  isVisible: boolean
  onClose: () => void
}

/**
 * Main settings modal for Boltcard management
 * Includes PIN management, max withdrawal, and enable/disable
 */
const CardSettingsModal: React.FC<Props> = ({ isVisible, onClose }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const {
    cardId,
    storeId,
    apiBaseUrl,
    settings,
    pinStatus,
    settingsLoading,
    settingsError,
    fetchSettings,
    fetchPinStatus,
    updateCardSettings,
    setCardPin,
    removeCardPin,
    unlockCard,
    verifyCardOwnership,
  } = useFlashcard()

  // Local state
  const [maxWithdraw, setMaxWithdraw] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [pinModalMode, setPinModalMode] = useState<"set" | "change" | "remove" | null>(null)
  const [showNfcVerification, setShowNfcVerification] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Check if settings are available
  const settingsAvailable = Boolean(cardId && storeId && apiBaseUrl)

  // Load settings when modal opens
  useEffect(() => {
    if (isVisible && settingsAvailable) {
      fetchSettings()
      fetchPinStatus()
    }
  }, [isVisible, settingsAvailable])

  // Sync local state with fetched settings
  useEffect(() => {
    if (settings) {
      setMaxWithdraw(settings.maxWithdrawSats.toString())
      setEnabled(settings.withdrawEnabled)
      setHasChanges(false)
    }
  }, [settings])

  // Handle max withdraw change
  const handleMaxWithdrawChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "")
    setMaxWithdraw(cleaned)
    setHasChanges(true)
  }

  // Handle enable toggle
  const handleEnabledChange = (value: boolean) => {
    setEnabled(value)
    setHasChanges(true)
  }

  // Wrapper to require NFC verification before action
  const withNfcVerification = useCallback(
    (action: () => Promise<void>) => {
      setPendingAction(() => action)
      setShowNfcVerification(true)
    },
    [],
  )

  // Handle NFC verification completion
  const handleNfcVerificationComplete = async () => {
    setShowNfcVerification(false)
    const verified = await verifyCardOwnership()
    if (verified && pendingAction) {
      await pendingAction()
    }
    setPendingAction(null)
  }

  // Save settings changes
  const handleSaveSettings = async () => {
    const maxSats = parseInt(maxWithdraw, 10)
    if (isNaN(maxSats) || maxSats < 1000 || maxSats > 10000000) {
      return // Validation will show error
    }

    withNfcVerification(async () => {
      setLocalLoading(true)
      try {
        await updateCardSettings({
          maxWithdrawSats: maxSats,
          withdrawEnabled: enabled,
        })
        setHasChanges(false)
      } finally {
        setLocalLoading(false)
      }
    })
  }

  // PIN management handlers
  const handleSetPin = () => {
    withNfcVerification(async () => {
      setPinModalMode("set")
    })
  }

  const handleChangePin = () => {
    withNfcVerification(async () => {
      setPinModalMode("change")
    })
  }

  const handleRemovePin = () => {
    withNfcVerification(async () => {
      setPinModalMode("remove")
    })
  }

  const handleUnlockCard = () => {
    withNfcVerification(async () => {
      setLocalLoading(true)
      try {
        await unlockCard()
      } finally {
        setLocalLoading(false)
      }
    })
  }

  // PIN modal submit handler
  const handlePinSubmit = async (pin: string): Promise<boolean> => {
    if (pinModalMode === "set" || pinModalMode === "change") {
      return await setCardPin(pin)
    } else if (pinModalMode === "remove") {
      return await removeCardPin()
    }
    return false
  }

  const isLoading = settingsLoading || localLoading
  const maxWithdrawValid =
    maxWithdraw === "" ||
    (parseInt(maxWithdraw, 10) >= 1000 && parseInt(maxWithdraw, 10) <= 10000000)

  return (
    <>
      <Modal
        isVisible={isVisible && !showNfcVerification && !pinModalMode}
        backdropOpacity={0.8}
        backdropColor={colors.white}
        onBackdropPress={onClose}
        avoidKeyboard={true}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text type="h02" bold style={styles.title}>
              Card Settings
            </Text>
            <GaloyIcon name="close" size={24} color={colors.grey0} onPress={onClose} />
          </View>

          {!settingsAvailable ? (
            <View style={styles.notAvailable}>
              <GaloyIcon name="warning" size={48} color={colors.warning} />
              <Text type="p1" style={styles.notAvailableText}>
                Card settings are not available for this card.
              </Text>
              <Text type="p3" style={styles.notAvailableSubtext}>
                This card may be using a legacy format that doesn't support settings management.
              </Text>
            </View>
          ) : (
            <>
              {/* Card Info Section */}
              <View style={styles.section}>
                <Text type="p2" bold style={styles.sectionTitle}>
                  Card Information
                </Text>
                <View style={styles.infoRow}>
                  <Text type="p3" style={styles.infoLabel}>
                    Card ID
                  </Text>
                  <Text type="p3" style={styles.infoValue}>
                    {formatCardIdForDisplay(cardId || "", 16)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text type="p3" style={styles.infoLabel}>
                    Status
                  </Text>
                  <Text
                    type="p3"
                    style={[
                      styles.infoValue,
                      { color: enabled ? colors.green : colors.error },
                    ]}
                  >
                    {enabled ? "Active" : "Disabled"}
                  </Text>
                </View>
              </View>

              {/* PIN Management Section */}
              <View style={styles.section}>
                <Text type="p2" bold style={styles.sectionTitle}>
                  PIN Protection
                </Text>

                {pinStatus?.isLockedOut ? (
                  <View style={styles.lockoutBox}>
                    <GaloyIcon name="warning" size={24} color={colors.error} />
                    <View style={styles.lockoutText}>
                      <Text type="p2" style={{ color: colors.error }}>
                        Card Locked
                      </Text>
                      <Text type="p4" style={styles.lockoutSubtext}>
                        {pinStatus.lockoutMinutesRemaining > 0
                          ? `Unlocks in ${Math.ceil(pinStatus.lockoutMinutesRemaining)} minutes`
                          : "Contact administrator to unlock"}
                      </Text>
                    </View>
                    <PrimaryBtn
                      type="outline"
                      label="Unlock"
                      onPress={handleUnlockCard}
                      btnStyle={styles.smallBtn}
                      loading={isLoading}
                    />
                  </View>
                ) : (
                  <View style={styles.pinSection}>
                    <View style={styles.pinStatus}>
                      <Text type="p3" style={styles.infoLabel}>
                        PIN Status
                      </Text>
                      <Text
                        type="p3"
                        style={[
                          styles.infoValue,
                          { color: pinStatus?.pinEnabled ? colors.green : colors.grey0 },
                        ]}
                      >
                        {pinStatus?.pinEnabled ? "Enabled" : "Not Set"}
                      </Text>
                    </View>

                    <View style={styles.pinButtons}>
                      {!pinStatus?.pinEnabled ? (
                        <PrimaryBtn
                          label="Set PIN"
                          onPress={handleSetPin}
                          btnStyle={styles.pinBtn}
                          disabled={isLoading}
                        />
                      ) : (
                        <>
                          <PrimaryBtn
                            type="outline"
                            label="Change PIN"
                            onPress={handleChangePin}
                            btnStyle={styles.pinBtn}
                            disabled={isLoading}
                          />
                          <PrimaryBtn
                            type="outline"
                            label="Remove PIN"
                            onPress={handleRemovePin}
                            btnStyle={styles.pinBtn}
                            disabled={isLoading}
                          />
                        </>
                      )}
                    </View>
                  </View>
                )}
              </View>

              {/* Spending Limits Section */}
              <View style={styles.section}>
                <Text type="p2" bold style={styles.sectionTitle}>
                  Spending Limits
                </Text>

                <View style={styles.inputWrapper}>
                  <Text type="p3" style={styles.inputLabel}>
                    Max per tap (sats)
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      !maxWithdrawValid && styles.textInputError,
                    ]}
                    value={maxWithdraw}
                    onChangeText={handleMaxWithdrawChange}
                    keyboardType="numeric"
                    placeholder="100000"
                    placeholderTextColor={colors.grey3}
                    editable={!isLoading}
                  />
                  {!maxWithdrawValid && (
                    <Text type="p4" style={styles.inputError}>
                      Must be between 1,000 and 10,000,000 sats
                    </Text>
                  )}
                </View>
              </View>

              {/* Enable/Disable Section */}
              <View style={styles.section}>
                <View style={styles.toggleRow}>
                  <View>
                    <Text type="p2" bold>
                      Card Enabled
                    </Text>
                    <Text type="p4" style={styles.toggleDescription}>
                      Disable to prevent any withdrawals
                    </Text>
                  </View>
                  <Switch
                    value={enabled}
                    onValueChange={handleEnabledChange}
                    trackColor={{ false: colors.grey3, true: colors.green }}
                    thumbColor={colors.white}
                    disabled={isLoading}
                  />
                </View>
              </View>

              {/* Error Display */}
              {settingsError && (
                <View style={styles.errorContainer}>
                  <GaloyErrorBox errorMessage={settingsError} />
                </View>
              )}

              {/* Loading Indicator */}
              {isLoading && (
                <ActivityIndicator
                  style={styles.loader}
                  size="small"
                  color={colors.primary}
                />
              )}

              {/* Save Button */}
              <View style={styles.buttons}>
                <PrimaryBtn
                  label="Save Changes"
                  onPress={handleSaveSettings}
                  disabled={!hasChanges || !maxWithdrawValid || isLoading}
                  loading={isLoading}
                />
                <PrimaryBtn
                  type="outline"
                  label="Close"
                  onPress={onClose}
                  disabled={isLoading}
                />
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* NFC Verification Modal */}
      <NfcVerificationModal
        isVisible={showNfcVerification}
        onCancel={() => {
          setShowNfcVerification(false)
          setPendingAction(null)
        }}
        title="Verify Card"
        description="Tap your card to confirm this change"
      />

      {/* PIN Modal */}
      {pinModalMode && (
        <CardPinModal
          isVisible={Boolean(pinModalMode)}
          onClose={() => setPinModalMode(null)}
          onSubmit={handlePinSubmit}
          mode={pinModalMode}
          loading={isLoading}
        />
      )}
    </>
  )
}

export default CardSettingsModal

const useStyles = makeStyles(({ colors }) => ({
  container: {
    backgroundColor: colors.grey5,
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: colors.black,
  },
  notAvailable: {
    alignItems: "center",
    paddingVertical: 32,
  },
  notAvailableText: {
    marginTop: 16,
    textAlign: "center",
    color: colors.black,
  },
  notAvailableSubtext: {
    marginTop: 8,
    textAlign: "center",
    color: colors.grey0,
  },
  section: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border01,
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.black,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    color: colors.grey0,
  },
  infoValue: {
    color: colors.black,
  },
  lockoutBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.error + "20",
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  lockoutText: {
    flex: 1,
  },
  lockoutSubtext: {
    color: colors.grey0,
    marginTop: 2,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pinSection: {},
  pinStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  pinButtons: {
    flexDirection: "row",
    gap: 8,
  },
  pinBtn: {
    flex: 1,
  },
  inputWrapper: {
    marginBottom: 8,
  },
  inputLabel: {
    color: colors.grey0,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border02,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.black,
  },
  textInputError: {
    borderColor: colors.error,
  },
  inputError: {
    color: colors.error,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleDescription: {
    color: colors.grey0,
    marginTop: 2,
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
