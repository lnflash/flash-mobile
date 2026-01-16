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
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const Animatable = __importStar(require("react-native-animatable"));
const themed_1 = require("@rneui/themed");
// components
const buttons_1 = require("../buttons");
// assets
const nfc_scan_svg_1 = __importDefault(require("@app/assets/icons/nfc-scan.svg"));
const width = react_native_1.Dimensions.get("screen").width;
/**
 * Modal that prompts user to scan their NFC card for verification
 * Used before making changes to card settings
 */
const NfcVerificationModal = ({ isVisible, onCancel, title = "Verify Card", description = "Please tap your card to verify ownership", }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.8} backdropColor={colors.white} onBackdropPress={onCancel} style={styles.modal}>
      <react_native_1.View style={styles.container}>
        <react_native_1.View style={styles.content}>
          <themed_1.Text type="h02" bold style={styles.title}>
            {title}
          </themed_1.Text>
          <themed_1.Text type="bm" style={styles.description}>
            {description}
          </themed_1.Text>
          <Animatable.View animation="pulse" easing="ease-out" iterationCount="infinite">
            <nfc_scan_svg_1.default width={width / 2} height={width / 2} style={styles.icon}/>
          </Animatable.View>
        </react_native_1.View>
        <buttons_1.PrimaryBtn type="outline" label="Cancel" onPress={onCancel}/>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.default = NfcVerificationModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    modal: {
        justifyContent: "flex-end",
        margin: 0,
    },
    container: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: colors.grey5,
        padding: 20,
        paddingBottom: 40,
    },
    content: {
        alignItems: "center",
    },
    title: {
        marginBottom: 8,
        color: colors.black,
    },
    description: {
        marginBottom: 16,
        textAlign: "center",
        color: colors.grey0,
    },
    icon: {
        marginVertical: 20,
    },
}));
//# sourceMappingURL=NfcVerificationModal.js.map