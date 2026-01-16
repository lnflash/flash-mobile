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
exports.AppUpdateModal = exports.AppUpdate = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_device_info_1 = __importDefault(require("react-native-device-info"));
const contact_modal_1 = require("@app/components/contact-modal");
const version_1 = require("@app/components/version");
const config_1 = require("@app/config");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const helper_1 = require("../../utils/helper");
const app_update_logic_1 = require("./app-update.logic");
const galoy_primary_button_1 = require("../atomic/galoy-primary-button");
const galoy_secondary_button_1 = require("../atomic/galoy-secondary-button");
(0, client_1.gql) `
  query mobileUpdate {
    mobileVersions {
      platform
      currentSupported
      minSupported
    }
  }
`;
const useStyles = (0, themed_1.makeStyles)(() => ({
    bottom: {
        alignItems: "center",
        marginVertical: 16,
    },
    lightningText: {
        fontSize: 20,
        marginBottom: 12,
        textAlign: "center",
    },
    versionComponent: { flex: 1, justifyContent: "flex-end", marginVertical: 48 },
    main: { flex: 5, justifyContent: "center" },
    button: { marginVertical: 12 },
}));
const AppUpdate = () => {
    const styles = useStyles();
    // const { LL } = useI18nContext()
    const { data } = (0, generated_1.useMobileUpdateQuery)({ fetchPolicy: "no-cache" });
    const buildNumber = Number(react_native_device_info_1.default.getBuildNumber());
    const mobileVersions = data === null || data === void 0 ? void 0 : data.mobileVersions;
    const { available, required } = (0, app_update_logic_1.isUpdateAvailableOrRequired)({
        buildNumber,
        mobileVersions,
        OS: react_native_1.Platform.OS,
    });
    const openInStore = async () => {
        if (helper_1.isIos) {
            react_native_1.Linking.openURL(config_1.APP_STORE_LINK);
        }
        else {
            // TODO: differentiate between PlayStore and Huawei AppGallery
            react_native_1.Linking.openURL(config_1.PLAY_STORE_LINK);
        }
    };
    const linkUpgrade = () => openInStore().catch((err) => {
        console.log({ err }, "error app link on link");
    });
    if (available) {
        return (<react_native_1.View style={styles.bottom}>
        <react_native_1.Pressable onPress={linkUpgrade}>
          {/* <Text style={styles.lightningText}>{LL.HomeScreen.updateAvailable()}</Text> */}
        </react_native_1.Pressable>
      </react_native_1.View>);
    }
    return <exports.AppUpdateModal isVisible={required} linkUpgrade={linkUpgrade}/>;
};
exports.AppUpdate = AppUpdate;
const AppUpdateModal = ({ linkUpgrade, isVisible, }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const message = LL.AppUpdate.needToUpdateSupportMessage({
        os: helper_1.isIos ? "iOS" : "Android",
        version: react_native_device_info_1.default.getReadableVersion(),
    });
    const styles = useStyles();
    return (<react_native_modal_1.default isVisible={isVisible} backdropColor={colors.white} backdropOpacity={0.92}>
      <react_native_1.View style={styles.main}>
        <themed_1.Text style={styles.lightningText}>{LL.AppUpdate.versionNotSupported()}</themed_1.Text>
        <themed_1.Text style={styles.lightningText}>{LL.AppUpdate.updateMandatory()}</themed_1.Text>
        <galoy_primary_button_1.GaloyPrimaryButton buttonStyle={styles.button} onPress={linkUpgrade} title={LL.AppUpdate.tapHereUpdate()}/>
        <galoy_secondary_button_1.GaloySecondaryButton buttonStyle={styles.button} onPress={() => (0, contact_modal_1.openWhatsAppAction)(message)} title={LL.AppUpdate.contactSupport()}/>
      </react_native_1.View>
      <react_native_1.View style={styles.versionComponent}>
        <version_1.VersionComponent />
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.AppUpdateModal = AppUpdateModal;
//# sourceMappingURL=app-update.js.map