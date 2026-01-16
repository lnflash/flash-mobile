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
exports.StableSatsModal = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const stable_sats_png_1 = __importDefault(require("../../assets/images/stable-sats.png"));
const galoy_primary_button_1 = require("../atomic/galoy-primary-button");
const galoy_secondary_button_1 = require("../atomic/galoy-secondary-button");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    imageContainer: {
        height: 150,
        marginBottom: 16,
    },
    stableSatsImage: {
        flex: 1,
    },
    scrollViewStyle: {
        paddingHorizontal: 12,
    },
    modalCard: {
        backgroundColor: colors.white,
        borderRadius: 16,
        paddingVertical: 18,
    },
    cardTitleContainer: {
        flexDirection: "row",
        justifyContent: "center",
        marginBottom: 16,
    },
    cardBodyContainer: {
        marginBottom: 16,
    },
    termsAndConditionsText: {
        textDecorationLine: "underline",
    },
    cardActionsContainer: {
        flexDirection: "column",
    },
    marginBottom: {
        marginBottom: 10,
    },
}));
const STABLESATS_LINK = "https://www.stablesats.com";
const STABLESATS_TERMS_LINK = "https://www.bbw.sv/terms";
const StableSatsModal = ({ isVisible, setIsVisible }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const acknowledgeModal = () => {
        setIsVisible(false);
    };
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.3} backdropColor={colors.grey3} onBackdropPress={acknowledgeModal}>
      <react_native_1.View style={styles.modalCard}>
        <react_native_1.ScrollView style={styles.scrollViewStyle}>
          <react_native_1.View style={styles.imageContainer}>
            <react_native_1.Image source={stable_sats_png_1.default} style={styles.stableSatsImage} resizeMode="contain"/>
          </react_native_1.View>
          <react_native_1.View style={styles.cardTitleContainer}>
            <themed_1.Text type={"h2"}>{LL.StablesatsModal.header()}</themed_1.Text>
          </react_native_1.View>
          <react_native_1.View style={styles.cardBodyContainer}>
            <themed_1.Text type="p2">
              {LL.StablesatsModal.body()}{" "}
              <themed_1.Text style={styles.termsAndConditionsText} onPress={() => react_native_1.Linking.openURL(STABLESATS_TERMS_LINK)}>
                {LL.StablesatsModal.termsAndConditions()}
              </themed_1.Text>
            </themed_1.Text>
          </react_native_1.View>
          <react_native_1.View style={styles.cardActionsContainer}>
            <react_native_1.View style={styles.marginBottom}>
              <galoy_primary_button_1.GaloyPrimaryButton title={LL.common.backHome()} onPress={acknowledgeModal}/>
            </react_native_1.View>

            <galoy_secondary_button_1.GaloySecondaryButton title={LL.StablesatsModal.learnMore()} onPress={() => react_native_1.Linking.openURL(STABLESATS_LINK)}/>
          </react_native_1.View>
        </react_native_1.ScrollView>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.StableSatsModal = StableSatsModal;
//# sourceMappingURL=stablesats-modal.js.map