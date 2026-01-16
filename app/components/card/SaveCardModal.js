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
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const themed_1 = require("@rneui/themed");
// components
const galoy_primary_button_1 = require("../atomic/galoy-primary-button");
const galoy_secondary_button_1 = require("../atomic/galoy-secondary-button");
// assets
const cryptoWallet_svg_1 = __importDefault(require("@app/assets/icons/cryptoWallet.svg"));
const SaveCardModal = ({ isVisible, onSave, onCancel }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.3} backdropColor={colors.grey3} onBackdropPress={onCancel}>
      <react_native_1.View style={styles.modalCard}>
        <cryptoWallet_svg_1.default width={"100%"} height={150}/>
        <themed_1.Text style={styles.cardTitle} type={"h2"}>
          Would you like to save your flash card?
        </themed_1.Text>
        <react_native_1.View style={{ width: "100%" }}>
          <galoy_primary_button_1.GaloyPrimaryButton title={"Save"} onPress={onSave} style={{ marginBottom: 10 }}/>
          <galoy_secondary_button_1.GaloySecondaryButton title={"Cancel"} onPress={onCancel}/>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.default = SaveCardModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    modalCard: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.white,
        borderRadius: 16,
        padding: 20,
    },
    cardTitle: {
        textAlign: "center",
        marginHorizontal: 20,
        marginVertical: 20,
    },
}));
//# sourceMappingURL=SaveCardModal.js.map