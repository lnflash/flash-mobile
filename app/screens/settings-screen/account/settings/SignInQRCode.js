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
exports.SignInQRCode = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const utils_1 = require("@noble/curves/abstract/utils");
const Keychain = __importStar(require("react-native-keychain"));
const react_native_qrcode_svg_1 = __importDefault(require("react-native-qrcode-svg"));
const byte_base64_1 = require("byte-base64");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
// components
const button_1 = require("../../button");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const generated_1 = require("@app/graphql/generated");
const native_1 = require("@react-navigation/native");
// utils
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const secureStorage_1 = __importDefault(require("@app/utils/storage/secureStorage"));
const enum_1 = require("@app/utils/enum");
const nostr_1 = require("@app/utils/nostr");
// assets
const blink_logo_icon_png_1 = __importDefault(require("@app/assets/logo/blink-logo-icon.png"));
const SignInQRCode = () => {
    var _a;
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { width } = (0, react_native_1.useWindowDimensions)();
    const [modalVisible, setModalVisible] = (0, react_1.useState)(false);
    const [QRCodeValue, setQRCodeValue] = (0, react_1.useState)();
    const [isPinEnabled, setIsPinEnabled] = (0, react_1.useState)(false);
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    (0, react_1.useEffect)(() => {
        createQRCodeString();
    }, [(_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.phone]);
    (0, native_1.useFocusEffect)(() => {
        getIsPinEnabled();
    });
    const createQRCodeString = async () => {
        var _a;
        const obj = {
            phone: (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.phone,
            mnemonicKey: "",
            nsec: "",
        };
        const mnemonicKey = await Keychain.getInternetCredentials(breez_sdk_liquid_1.KEYCHAIN_MNEMONIC_KEY);
        if (mnemonicKey) {
            obj.mnemonicKey = mnemonicKey.password;
        }
        const secret = await (0, nostr_1.getSecretKey)();
        if (secret) {
            obj.nsec = (0, utils_1.bytesToHex)(secret);
        }
        setQRCodeValue((0, byte_base64_1.base64encode)(JSON.stringify(obj)));
    };
    const getIsPinEnabled = async () => {
        setIsPinEnabled(await secureStorage_1.default.getIsPinEnabled());
    };
    const onOpenModal = () => {
        var _a;
        if (!((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.phone)) {
            react_native_1.Alert.alert("Add your phone number", "Make sure you've added your phone number to access the login QR code.");
        }
        else {
            if (isPinEnabled) {
                navigation.navigate("pin", {
                    screenPurpose: enum_1.PinScreenPurpose.CheckPin,
                    callback: () => setModalVisible(true),
                });
            }
            else {
                react_native_1.Alert.alert("Enable PIN Code", "Please enable a PIN code as an extra security layer to display the login QR code.", [
                    {
                        text: LL.common.ok(),
                        onPress: () => navigation.navigate("pin", {
                            screenPurpose: enum_1.PinScreenPurpose.SetPin,
                            callback: () => setModalVisible(true),
                        }),
                    },
                ]);
            }
        }
    };
    const AccountDeletionModal = (<react_native_modal_1.default isVisible={modalVisible} onBackdropPress={() => setModalVisible(false)} backdropOpacity={0.8} backdropColor={colors.white} avoidKeyboard={true}>
      <react_native_1.View style={styles.view}>
        <react_native_1.View style={styles.actionButtons}>
          <themed_1.Text type="h1" bold>
            Scan the QR code
          </themed_1.Text>
          <galoy_icon_button_1.GaloyIconButton name="close" onPress={() => setModalVisible(false)} size={"medium"}/>
        </react_native_1.View>
        <react_native_qrcode_svg_1.default size={width / 1.5} value={QRCodeValue} logoBackgroundColor="white" logo={blink_logo_icon_png_1.default} logoSize={60} logoBorderRadius={10}/>
        <react_native_1.View style={{ rowGap: 4 }}>
          <themed_1.Text type="bm" bold>
            1. Open the Flash app
          </themed_1.Text>
          <themed_1.Text type="bm" bold>
            2. Go to Login
          </themed_1.Text>
          <themed_1.Text type="bm" bold>
            3. Press Sign In with QR code
          </themed_1.Text>
          <themed_1.Text type="bm" bold>
            4. Make sure you sign in to the account from your device
          </themed_1.Text>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_modal_1.default>);
    return (<>
      <button_1.SettingsButton loading={loading} title={"Show QR for Login"} variant="warning" onPress={onOpenModal}/>
      {AccountDeletionModal}
    </>);
};
exports.SignInQRCode = SignInQRCode;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    view: {
        marginHorizontal: 20,
        backgroundColor: colors.grey5,
        padding: 20,
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        rowGap: 20,
    },
    actionButtons: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
}));
//# sourceMappingURL=SignInQRCode.js.map