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
exports.UnVerifiedSeedModal = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const native_1 = require("@react-navigation/native");
// assets
const unsecure_svg_1 = __importDefault(require("@app/assets/illustrations/unsecure.svg"));
// components
const buttons_1 = require("../buttons");
const DOCS_LINK = "https://documentation.getflash.io";
const UnVerifiedSeedModal = ({ isVisible, setIsVisible }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { width } = (0, react_native_1.useWindowDimensions)();
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const acknowledgeModal = () => {
        setIsVisible(false);
    };
    const goToBackupBTCWallet = () => {
        acknowledgeModal();
        navigation.navigate("BackupStart");
    };
    return (<react_native_1.Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={() => setIsVisible(false)}>
      <react_native_1.View style={styles.backdrop}>
        <react_native_1.View style={styles.modalCard}>
          <unsecure_svg_1.default style={{ alignSelf: "center" }} width={width / 2} height={width / 2}/>
          <themed_1.Text style={styles.cardTitle} type={"h2"} bold>
            {LL.UnVerifiedSeedModal.header()}
          </themed_1.Text>
          <themed_1.Text type="p2">{LL.UnVerifiedSeedModal.body()} </themed_1.Text>
          <themed_1.Text style={styles.textBtn} type="p2" bold onPress={() => react_native_1.Linking.openURL(DOCS_LINK)}>
            {LL.UnVerifiedSeedModal.learnMore()}
          </themed_1.Text>
          <buttons_1.PrimaryBtn label={LL.common.revealSeed()} onPress={goToBackupBTCWallet} btnStyle={styles.marginBottom}/>
          <buttons_1.PrimaryBtn type="outline" label={LL.MapScreen.locationPermissionNeutral()} onPress={acknowledgeModal} btnStyle={styles.marginBottom}/>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.Modal>);
};
exports.UnVerifiedSeedModal = UnVerifiedSeedModal;
const useStyles = (0, themed_1.makeStyles)(({ colors, mode }) => ({
    backdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
    },
    modalCard: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingTop: 0,
    },
    stableSatsImage: {
        height: 150,
        marginBottom: 16,
    },
    cardTitle: {
        textAlign: "center",
        marginBottom: 16,
    },
    textBtn: {
        textDecorationLine: "underline",
        marginBottom: 20,
        marginLeft: 10,
    },
    marginBottom: {
        marginBottom: 10,
    },
}));
//# sourceMappingURL=unverified-seed-modal.js.map