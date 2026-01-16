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
/**
 * Modal for PIN entry - supports set, change, and remove modes
 */
const CardPinModal = ({ isVisible, onClose, onSubmit, mode, loading = false, }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const [pin, setPin] = (0, react_1.useState)("");
    const [confirmPin, setConfirmPin] = (0, react_1.useState)("");
    const [currentPin, setCurrentPin] = (0, react_1.useState)("");
    const [error, setError] = (0, react_1.useState)();
    const [submitting, setSubmitting] = (0, react_1.useState)(false);
    // Reset state when modal opens/closes
    (0, react_1.useEffect)(() => {
        if (!isVisible) {
            setPin("");
            setConfirmPin("");
            setCurrentPin("");
            setError(undefined);
        }
    }, [isVisible]);
    const getTitle = () => {
        switch (mode) {
            case "set":
                return "Set Card PIN";
            case "change":
                return "Change Card PIN";
            case "remove":
                return "Remove Card PIN";
        }
    };
    const getDescription = () => {
        switch (mode) {
            case "set":
                return "Enter a 4-8 digit PIN to protect your card";
            case "change":
                return "Enter your current PIN and a new PIN";
            case "remove":
                return "Enter your current PIN to remove protection";
        }
    };
    const validatePin = (value) => {
        if (value.length < 4 || value.length > 8) {
            setError("PIN must be 4-8 digits");
            return false;
        }
        if (!/^\d+$/.test(value)) {
            setError("PIN must contain only numbers");
            return false;
        }
        return true;
    };
    const handleSubmit = async () => {
        setError(undefined);
        // Validate based on mode
        if (mode === "set") {
            if (!validatePin(pin))
                return;
            if (pin !== confirmPin) {
                setError("PINs do not match");
                return;
            }
        }
        else if (mode === "change") {
            if (!validatePin(currentPin)) {
                setError("Current PIN is invalid");
                return;
            }
            if (!validatePin(pin))
                return;
            if (pin !== confirmPin) {
                setError("New PINs do not match");
                return;
            }
            if (pin === currentPin) {
                setError("New PIN must be different from current PIN");
                return;
            }
        }
        else if (mode === "remove") {
            if (!validatePin(currentPin)) {
                setError("Current PIN is invalid");
                return;
            }
        }
        setSubmitting(true);
        try {
            const success = await onSubmit(mode === "remove" ? "" : pin, currentPin || undefined);
            if (success) {
                onClose();
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Operation failed");
        }
        finally {
            setSubmitting(false);
        }
    };
    const handlePinChange = (value, setter) => {
        // Only allow digits, max 8 characters
        const cleaned = value.replace(/\D/g, "").slice(0, 8);
        setter(cleaned);
        setError(undefined);
    };
    const isLoading = loading || submitting;
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.8} backdropColor={colors.white} onBackdropPress={onClose} avoidKeyboard={true}>
      <react_native_1.View style={styles.container}>
        <react_native_1.View style={styles.header}>
          <themed_1.Text type="h02" bold style={styles.title}>
            {getTitle()}
          </themed_1.Text>
          <galoy_icon_1.GaloyIcon name="close" size={24} color={colors.grey0} onPress={onClose}/>
        </react_native_1.View>

        <themed_1.Text type="p2" style={styles.description}>
          {getDescription()}
        </themed_1.Text>

        {/* Current PIN for change/remove modes */}
        {(mode === "change" || mode === "remove") && (<react_native_1.View style={styles.inputWrapper}>
            <themed_1.Text type="p3" style={styles.label}>
              Current PIN
            </themed_1.Text>
            <themed_1.Input placeholder="Enter current PIN" containerStyle={styles.inputContainer} inputContainerStyle={styles.inputInner} inputStyle={styles.input} value={currentPin} onChangeText={(v) => handlePinChange(v, setCurrentPin)} keyboardType="numeric" secureTextEntry maxLength={8} autoFocus editable={!isLoading}/>
          </react_native_1.View>)}

        {/* New PIN for set/change modes */}
        {(mode === "set" || mode === "change") && (<>
            <react_native_1.View style={styles.inputWrapper}>
              <themed_1.Text type="p3" style={styles.label}>
                {mode === "change" ? "New PIN" : "PIN"}
              </themed_1.Text>
              <themed_1.Input placeholder="Enter 4-8 digit PIN" containerStyle={styles.inputContainer} inputContainerStyle={styles.inputInner} inputStyle={styles.input} value={pin} onChangeText={(v) => handlePinChange(v, setPin)} keyboardType="numeric" secureTextEntry maxLength={8} autoFocus={mode === "set"} editable={!isLoading}/>
            </react_native_1.View>

            <react_native_1.View style={styles.inputWrapper}>
              <themed_1.Text type="p3" style={styles.label}>
                Confirm PIN
              </themed_1.Text>
              <themed_1.Input placeholder="Confirm PIN" containerStyle={styles.inputContainer} inputContainerStyle={styles.inputInner} inputStyle={styles.input} value={confirmPin} onChangeText={(v) => handlePinChange(v, setConfirmPin)} keyboardType="numeric" secureTextEntry maxLength={8} editable={!isLoading}/>
            </react_native_1.View>
          </>)}

        {error && (<react_native_1.View style={styles.errorContainer}>
            <galoy_error_box_1.GaloyErrorBox errorMessage={error}/>
          </react_native_1.View>)}

        {isLoading && (<react_native_1.ActivityIndicator style={styles.loader} size="small" color={colors.primary}/>)}

        <react_native_1.View style={styles.buttons}>
          <buttons_1.PrimaryBtn label={mode === "remove" ? "Remove PIN" : "Save PIN"} onPress={handleSubmit} loading={isLoading} disabled={isLoading}/>
          <buttons_1.PrimaryBtn type="outline" label="Cancel" onPress={onClose} disabled={isLoading}/>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.default = CardPinModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
}));
//# sourceMappingURL=CardPinModal.js.map