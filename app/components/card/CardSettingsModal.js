"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const themed_1 = require("@rneui/themed");
// components
const buttons_1 = require("../buttons");
const galoy_icon_1 = require("../atomic/galoy-icon");
const galoy_error_box_1 = require("../atomic/galoy-error-box");
const CardPinModal_1 = __importDefault(require("./CardPinModal"));
const NfcVerificationModal_1 = __importDefault(require("./NfcVerificationModal"));
// hooks
const hooks_1 = require("@app/hooks");
// utils
const boltcard_url_1 = require("@app/utils/boltcard-url");
/**
 * Main settings modal for Boltcard management
 * Includes PIN management, max withdrawal, and enable/disable
 */
const CardSettingsModal = ({ isVisible, onClose }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { cardId, storeId, apiBaseUrl, settings, pinStatus, settingsLoading, settingsError, fetchSettings, fetchPinStatus, updateCardSettings, setCardPin, removeCardPin, unlockCard, verifyCardOwnership, } = (0, hooks_1.useFlashcard)();
    // Local state
    const [maxWithdraw, setMaxWithdraw] = (0, react_1.useState)("");
    const [enabled, setEnabled] = (0, react_1.useState)(true);
    const [pinModalMode, setPinModalMode] = (0, react_1.useState)(null);
    const [showNfcVerification, setShowNfcVerification] = (0, react_1.useState)(false);
    const [pendingAction, setPendingAction] = (0, react_1.useState)(null);
    const [localLoading, setLocalLoading] = (0, react_1.useState)(false);
    const [hasChanges, setHasChanges] = (0, react_1.useState)(false);
    // Check if settings are available
    const settingsAvailable = Boolean(cardId && storeId && apiBaseUrl);
    // Load settings when modal opens
    (0, react_1.useEffect)(() => {
        if (isVisible && settingsAvailable) {
            fetchSettings();
            fetchPinStatus();
        }
    }, [isVisible, settingsAvailable]);
    // Sync local state with fetched settings
    (0, react_1.useEffect)(() => {
        if (settings) {
            setMaxWithdraw(settings.maxWithdrawSats.toString());
            setEnabled(settings.withdrawEnabled);
            setHasChanges(false);
        }
    }, [settings]);
    // Handle max withdraw change
    const handleMaxWithdrawChange = (value) => {
        const cleaned = value.replace(/\D/g, "");
        setMaxWithdraw(cleaned);
        setHasChanges(true);
    };
    // Handle enable toggle
    const handleEnabledChange = (value) => {
        setEnabled(value);
        setHasChanges(true);
    };
    // Wrapper to require NFC verification before action
    const withNfcVerification = (0, react_1.useCallback)((action) => {
        setPendingAction(() => action);
        setShowNfcVerification(true);
    }, []);
    // Handle NFC verification completion
    const handleNfcVerificationComplete = async () => {
        setShowNfcVerification(false);
        const verified = await verifyCardOwnership();
        if (verified && pendingAction) {
            await pendingAction();
        }
        setPendingAction(null);
    };
    // Save settings changes
    const handleSaveSettings = async () => {
        const maxSats = parseInt(maxWithdraw, 10);
        if (isNaN(maxSats) || maxSats < 1000 || maxSats > 10000000) {
            return; // Validation will show error
        }
        withNfcVerification(async () => {
            setLocalLoading(true);
            try {
                await updateCardSettings({
                    maxWithdrawSats: maxSats,
                    withdrawEnabled: enabled,
                });
                setHasChanges(false);
            }
            finally {
                setLocalLoading(false);
            }
        });
    };
    // PIN management handlers
    const handleSetPin = () => {
        withNfcVerification(async () => {
            setPinModalMode("set");
        });
    };
    const handleChangePin = () => {
        withNfcVerification(async () => {
            setPinModalMode("change");
        });
    };
    const handleRemovePin = () => {
        withNfcVerification(async () => {
            setPinModalMode("remove");
        });
    };
    const handleUnlockCard = () => {
        withNfcVerification(async () => {
            setLocalLoading(true);
            try {
                await unlockCard();
            }
            finally {
                setLocalLoading(false);
            }
        });
    };
    // PIN modal submit handler
    const handlePinSubmit = async (pin) => {
        if (pinModalMode === "set" || pinModalMode === "change") {
            return await setCardPin(pin);
        }
        else if (pinModalMode === "remove") {
            return await removeCardPin();
        }
        return false;
    };
    const isLoading = settingsLoading || localLoading;
    const maxWithdrawValid = maxWithdraw === "" ||
        (parseInt(maxWithdraw, 10) >= 1000 && parseInt(maxWithdraw, 10) <= 10000000);
    return (<>
      <react_native_modal_1.default isVisible={isVisible && !showNfcVerification && !pinModalMode} backdropOpacity={0.8} backdropColor={colors.white} onBackdropPress={onClose} avoidKeyboard={true}>
        <react_native_1.View style={styles.container}>
          {/* Header */}
          <react_native_1.View style={styles.header}>
            <themed_1.Text type="h02" bold style={styles.title}>
              Card Settings
            </themed_1.Text>
            <galoy_icon_1.GaloyIcon name="close" size={24} color={colors.grey0} onPress={onClose}/>
          </react_native_1.View>

          {!settingsAvailable ? (<react_native_1.View style={styles.notAvailable}>
              <galoy_icon_1.GaloyIcon name="warning" size={48} color={colors.warning}/>
              <themed_1.Text type="p1" style={styles.notAvailableText}>
                Card settings are not available for this card.
              </themed_1.Text>
              <themed_1.Text type="p3" style={styles.notAvailableSubtext}>
                This card may be using a legacy format that doesn't support settings management.
              </themed_1.Text>
            </react_native_1.View>) : (<>
              {/* Card Info Section */}
              <react_native_1.View style={styles.section}>
                <themed_1.Text type="p2" bold style={styles.sectionTitle}>
                  Card Information
                </themed_1.Text>
                <react_native_1.View style={styles.infoRow}>
                  <themed_1.Text type="p3" style={styles.infoLabel}>
                    Card ID
                  </themed_1.Text>
                  <themed_1.Text type="p3" style={styles.infoValue}>
                    {(0, boltcard_url_1.formatCardIdForDisplay)(cardId || "", 16)}
                  </themed_1.Text>
                </react_native_1.View>
                <react_native_1.View style={styles.infoRow}>
                  <themed_1.Text type="p3" style={styles.infoLabel}>
                    Status
                  </themed_1.Text>
                  <themed_1.Text type="p3" style={[
                styles.infoValue,
                { color: enabled ? colors.green : colors.error },
            ]}>
                    {enabled ? "Active" : "Disabled"}
                  </themed_1.Text>
                </react_native_1.View>
              </react_native_1.View>

              {/* PIN Management Section */}
              <react_native_1.View style={styles.section}>
                <themed_1.Text type="p2" bold style={styles.sectionTitle}>
                  PIN Protection
                </themed_1.Text>

                {(pinStatus === null || pinStatus === void 0 ? void 0 : pinStatus.isLockedOut) ? (<react_native_1.View style={styles.lockoutBox}>
                    <galoy_icon_1.GaloyIcon name="warning" size={24} color={colors.error}/>
                    <react_native_1.View style={styles.lockoutText}>
                      <themed_1.Text type="p2" style={{ color: colors.error }}>
                        Card Locked
                      </themed_1.Text>
                      <themed_1.Text type="p4" style={styles.lockoutSubtext}>
                        {pinStatus.lockoutMinutesRemaining > 0
                    ? `Unlocks in ${Math.ceil(pinStatus.lockoutMinutesRemaining)} minutes`
                    : "Contact administrator to unlock"}
                      </themed_1.Text>
                    </react_native_1.View>
                    <buttons_1.PrimaryBtn type="outline" label="Unlock" onPress={handleUnlockCard} btnStyle={styles.smallBtn} loading={isLoading}/>
                  </react_native_1.View>) : (<react_native_1.View style={styles.pinSection}>
                    <react_native_1.View style={styles.pinStatus}>
                      <themed_1.Text type="p3" style={styles.infoLabel}>
                        PIN Status
                      </themed_1.Text>
                      <themed_1.Text type="p3" style={[
                    styles.infoValue,
                    { color: (pinStatus === null || pinStatus === void 0 ? void 0 : pinStatus.pinEnabled) ? colors.green : colors.grey0 },
                ]}>
                        {(pinStatus === null || pinStatus === void 0 ? void 0 : pinStatus.pinEnabled) ? "Enabled" : "Not Set"}
                      </themed_1.Text>
                    </react_native_1.View>

                    <react_native_1.View style={styles.pinButtons}>
                      {!(pinStatus === null || pinStatus === void 0 ? void 0 : pinStatus.pinEnabled) ? (<buttons_1.PrimaryBtn label="Set PIN" onPress={handleSetPin} btnStyle={styles.pinBtn} disabled={isLoading}/>) : (<>
                          <buttons_1.PrimaryBtn type="outline" label="Change PIN" onPress={handleChangePin} btnStyle={styles.pinBtn} disabled={isLoading}/>
                          <buttons_1.PrimaryBtn type="outline" label="Remove PIN" onPress={handleRemovePin} btnStyle={styles.pinBtn} disabled={isLoading}/>
                        </>)}
                    </react_native_1.View>
                  </react_native_1.View>)}
              </react_native_1.View>

              {/* Spending Limits Section */}
              <react_native_1.View style={styles.section}>
                <themed_1.Text type="p2" bold style={styles.sectionTitle}>
                  Spending Limits
                </themed_1.Text>

                <react_native_1.View style={styles.inputWrapper}>
                  <themed_1.Text type="p3" style={styles.inputLabel}>
                    Max per tap (sats)
                  </themed_1.Text>
                  <react_native_1.TextInput style={[
                styles.textInput,
                !maxWithdrawValid && styles.textInputError,
            ]} value={maxWithdraw} onChangeText={handleMaxWithdrawChange} keyboardType="numeric" placeholder="100000" placeholderTextColor={colors.grey3} editable={!isLoading}/>
                  {!maxWithdrawValid && (<themed_1.Text type="p4" style={styles.inputError}>
                      Must be between 1,000 and 10,000,000 sats
                    </themed_1.Text>)}
                </react_native_1.View>
              </react_native_1.View>

              {/* Enable/Disable Section */}
              <react_native_1.View style={styles.section}>
                <react_native_1.View style={styles.toggleRow}>
                  <react_native_1.View>
                    <themed_1.Text type="p2" bold>
                      Card Enabled
                    </themed_1.Text>
                    <themed_1.Text type="p4" style={styles.toggleDescription}>
                      Disable to prevent any withdrawals
                    </themed_1.Text>
                  </react_native_1.View>
                  <react_native_1.Switch value={enabled} onValueChange={handleEnabledChange} trackColor={{ false: colors.grey3, true: colors.green }} thumbColor={colors.white} disabled={isLoading}/>
                </react_native_1.View>
              </react_native_1.View>

              {/* Error Display */}
              {settingsError && (<react_native_1.View style={styles.errorContainer}>
                  <galoy_error_box_1.GaloyErrorBox errorMessage={settingsError}/>
                </react_native_1.View>)}

              {/* Loading Indicator */}
              {isLoading && (<react_native_1.ActivityIndicator style={styles.loader} size="small" color={colors.primary}/>)}

              {/* Save Button */}
              <react_native_1.View style={styles.buttons}>
                <buttons_1.PrimaryBtn label="Save Changes" onPress={handleSaveSettings} disabled={!hasChanges || !maxWithdrawValid || isLoading} loading={isLoading}/>
                <buttons_1.PrimaryBtn type="outline" label="Close" onPress={onClose} disabled={isLoading}/>
              </react_native_1.View>
            </>)}
        </react_native_1.View>
      </react_native_modal_1.default>

      {/* NFC Verification Modal */}
      <NfcVerificationModal_1.default isVisible={showNfcVerification} onCancel={() => {
            setShowNfcVerification(false);
            setPendingAction(null);
        }} title="Verify Card" description="Tap your card to confirm this change"/>

      {/* PIN Modal */}
      {pinModalMode && (<CardPinModal_1.default isVisible={Boolean(pinModalMode)} onClose={() => setPinModalMode(null)} onSubmit={handlePinSubmit} mode={pinModalMode} loading={isLoading}/>)}
    </>);
};
exports.default = CardSettingsModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
}));
//# sourceMappingURL=CardSettingsModal.js.map