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
exports.ErrorScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_device_info_1 = require("react-native-device-info");
const contact_modal_1 = __importDefault(require("@app/components/contact-modal/contact-modal"));
const hooks_1 = require("@app/hooks");
const use_logout_1 = __importDefault(require("@app/hooks/use-logout"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const helper_1 = require("@app/utils/helper");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const themed_1 = require("@rneui/themed");
const honey_badger_shovel_01_svg_1 = __importDefault(require("./honey-badger-shovel-01.svg"));
const screen_1 = require("@app/components/screen");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const ErrorScreen = ({ error, resetError, }) => {
    const [isContactModalVisible, setIsContactModalVisible] = react_1.default.useState(false);
    const { logout } = (0, use_logout_1.default)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { name: bankName } = appConfig.galoyInstance;
    const styles = useStyles();
    (0, react_1.useEffect)(() => (0, crashlytics_1.getCrashlytics)().recordError(error), [error]);
    const resetApp = async () => {
        await logout();
        resetError();
    };
    const toggleIsContactModalVisible = () => {
        setIsContactModalVisible(!isContactModalVisible);
    };
    const contactMessageBody = LL.support.defaultSupportMessage({
        os: helper_1.isIos ? "iOS" : "Android",
        version: (0, react_native_device_info_1.getReadableVersion)(),
        bankName,
    });
    const contactMessageSubject = LL.support.defaultEmailSubject({
        bankName,
    });
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle}>
      <react_native_1.View style={styles.imageContainer}>
        <honey_badger_shovel_01_svg_1.default />
      </react_native_1.View>
      <themed_1.Text type="p1">{LL.errors.fatalError()}</themed_1.Text>
      <galoy_primary_button_1.GaloyPrimaryButton title={LL.errors.showError()} onPress={() => react_native_1.Alert.alert(LL.common.error(), String(error))} containerStyle={styles.buttonContainer}/>
      <galoy_primary_button_1.GaloyPrimaryButton title={LL.support.contactUs()} onPress={() => toggleIsContactModalVisible()} containerStyle={styles.buttonContainer}/>
      <galoy_primary_button_1.GaloyPrimaryButton title={LL.common.tryAgain()} onPress={() => resetError()} containerStyle={styles.buttonContainer}/>
      <galoy_primary_button_1.GaloyPrimaryButton title={LL.errors.clearAppData()} onPress={() => resetApp()} containerStyle={styles.buttonContainer}/>
      <contact_modal_1.default isVisible={isContactModalVisible} toggleModal={toggleIsContactModalVisible} messageBody={contactMessageBody} messageSubject={contactMessageSubject}/>
    </screen_1.Screen>);
};
exports.ErrorScreen = ErrorScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    buttonContainer: {
        marginTop: 20,
    },
    container: {
        flex: 1,
        flexDirection: "column",
        justifyContent: "center",
    },
    screenStyle: {
        flexGrow: 1,
        padding: 20,
    },
    imageContainer: {
        alignSelf: "center",
        backgroundColor: colors.grey3,
        padding: 20,
        borderRadius: 20,
        marginBottom: 20,
    },
}));
//# sourceMappingURL=error-screen.js.map