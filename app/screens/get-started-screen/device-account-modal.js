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
exports.DeviceAccountModal = void 0;
const custom_modal_1 = __importDefault(require("@app/components/custom-modal/custom-modal"));
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const React = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const react_native_1 = require("react-native");
const device_account_fail_modal_1 = require("./device-account-fail-modal");
const react_1 = require("react");
const analytics_1 = require("@app/utils/analytics");
const Keychain = __importStar(require("react-native-keychain"));
const analytics_2 = require("@react-native-firebase/analytics");
const uuid_1 = require("uuid");
const react_native_securerandom_1 = require("react-native-securerandom");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const generateSecureRandomUUID = async () => {
    const randomBytes = await (0, react_native_securerandom_1.generateSecureRandom)(16); // Generate 16 random bytes
    const uuid = (0, uuid_1.v4)({ random: randomBytes }); // Use the random seed to generate a UUID
    return uuid;
};
const DEVICE_ACCOUNT_CREDENTIALS_KEY = "device-account";
const DeviceAccountModal = ({ isVisible, closeModal, appCheckToken, }) => {
    const { saveToken } = (0, hooks_1.useAppConfig)();
    const { appConfig: { galoyInstance: { authUrl }, }, } = (0, hooks_1.useAppConfig)();
    const [hasError, setHasError] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [isBasicSelected, setIsBasicSelected] = React.useState(null);
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const navigation = (0, native_1.useNavigation)();
    const createDeviceAccountAndLogin = async () => {
        try {
            setLoading(true);
            const credentials = await Keychain.getInternetCredentials(DEVICE_ACCOUNT_CREDENTIALS_KEY);
            let username;
            let password;
            if (credentials) {
                username = credentials.username;
                password = credentials.password;
            }
            else {
                username = await generateSecureRandomUUID();
                password = await generateSecureRandomUUID();
                const setPasswordResult = await Keychain.setInternetCredentials(DEVICE_ACCOUNT_CREDENTIALS_KEY, username, password);
                if (!setPasswordResult) {
                    throw new Error("Error setting device account credentials");
                }
            }
            (0, analytics_1.logAttemptCreateDeviceAccount)();
            const auth = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
            const res = await fetch(authUrl + "/auth/create/device-account", {
                method: "POST",
                headers: {
                    Authorization: `Basic ${auth}`,
                    Appcheck: `${appCheckToken}` || "undefined",
                },
            });
            if (!res.ok) {
                alert("FAILED: " + res.ok);
                console.error(`Error fetching from server: ${res.status} ${res.statusText}`);
                return; // Or handle this error appropriately
            }
            const data = await res.json();
            // alert("SUCCESS")
            const authToken = data.result;
            if (!authToken) {
                throw new Error("Error getting session token");
            }
            (0, analytics_1.logCreatedDeviceAccount)();
            (0, analytics_2.getAnalytics)().logLogin({ method: "device" });
            saveToken(authToken);
            navigation.replace("Primary");
            closeModal();
        }
        catch (error) {
            setHasError(true);
            (0, analytics_1.logCreateDeviceAccountFailure)();
            if (error instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(error);
            }
        }
        setLoading(false);
    };
    (0, react_1.useEffect)(() => {
        if (!isVisible) {
            setHasError(false);
        }
    }, [isVisible]);
    const navigateToPhoneLogin = () => {
        navigation.navigate("phoneFlow");
        closeModal();
    };
    const navigateToHomeScreen = () => {
        navigation.navigate("Primary");
        closeModal();
    };
    const onPressBasic = () => {
        createDeviceAccountAndLogin();
    };
    const onPressFull = () => {
        navigateToPhoneLogin();
    };
    return hasError ? (<device_account_fail_modal_1.DeviceAccountFailModal isVisible={isVisible} closeModal={closeModal} navigateToPhoneLogin={navigateToPhoneLogin} navigateToHomeScreen={navigateToHomeScreen}/>) : (<custom_modal_1.default isVisible={isVisible} toggleModal={closeModal} image={<galoy_icon_1.GaloyIcon name="info" color={colors.primary3} size={100}/>} title={LL.GetStartedScreen.chooseAccountType()} body={<react_native_1.View style={styles.modalBody}>
          <react_native_1.View style={styles.columnContainer}>
            <react_native_1.View style={styles.cellContainer}>
              <AccountTypeButton onPress={onPressBasic} selected={isBasicSelected === true} title={"BASIC⚡"}/>
              <LimitItem text={"No Phone# required"}/>
              <LimitItem text={"Receive in seconds"}/>
            </react_native_1.View>
            <react_native_1.View style={styles.cellContainer}>
              <AccountTypeButton onPress={onPressFull} selected={isBasicSelected === false} title={"FULL✅"}/>
              <LimitItem text={"No sending limits"}/>
              <LimitItem text={"Safe wallet backup"}/>
            </react_native_1.View>
          </react_native_1.View>
        </react_native_1.View>}/>);
};
exports.DeviceAccountModal = DeviceAccountModal;
const LimitItem = ({ text }) => {
    const styles = useStyles();
    return (<react_native_1.View style={styles.limitRow}>
      <themed_1.Text type="p2" style={styles.limitText}>
        {text}
      </themed_1.Text>
    </react_native_1.View>);
};
const AccountTypeButton = ({ title, onPress, selected, }) => {
    const styles = useStyles();
    return (<react_native_1.TouchableOpacity onPress={onPress} style={[styles.btnContainer, selected ? styles.btnSelected : styles.btnUnselected]}>
      <themed_1.Text type="h1" style={styles.txtBtnTitle}>
        {title}
      </themed_1.Text>
    </react_native_1.TouchableOpacity>);
};
const useStyles = (0, themed_1.makeStyles)(({ colors }, props) => ({
    limitRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    limitText: {},
    modalBody: {
        rowGap: 8,
    },
    columnContainer: {
        flexDirection: "row",
        paddingBottom: 100,
    },
    cellContainer: {
        flex: 1,
        alignItems: "center",
    },
    btnContainer: {
        borderWidth: 1,
        width: "97%",
        alignItems: "center",
        justifyContent: "center",
        height: 120,
        borderRadius: 5,
        marginBottom: 10,
    },
    txtBtnTitle: {
        fontSize: 24,
        fontWeight: react_native_1.Platform.OS === "ios" ? "600" : "700",
        lineHeight: 32,
        maxWidth: "80%",
        textAlign: "center",
        color: colors.black,
    },
    btnSelected: {
        // backgroundColor: colors.grey5,
        backgroundColor: colors._lighterBlue,
        borderColor: colors._borderBlue,
    },
    btnUnselected: {
        backgroundColor: colors.grey5,
        borderColor: colors.greyOutline,
    },
}));
//# sourceMappingURL=device-account-modal.js.map