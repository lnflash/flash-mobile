"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
// hooks
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
// utils
const toast_1 = require("@app/utils/toast");
const Username = () => {
    var _a, _b, _c;
    const navigation = (0, native_1.useNavigation)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = useStyle();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { data, loading } = (0, generated_1.useHomeAuthedQuery)({
        skip: !isAuthed,
    });
    const isHyperlink = !isAuthed || !((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username);
    const hostName = appConfig.galoyInstance.lnAddressHostname;
    const lnAddress = `${(_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.username}@${hostName}`;
    const label = isAuthed
        ? ((_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.username)
            ? `Hello, ${data.me.username}`
            : "Set username"
        : "Login";
    const handleOnPress = () => {
        var _a;
        if (isAuthed) {
            if ((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username) {
                clipboard_1.default.setString(lnAddress);
                (0, toast_1.toastShow)({
                    type: "success",
                    position: "top",
                    message: (translations) => translations.GaloyAddressScreen.copiedLightningAddressToClipboard(),
                    currentTranslation: LL,
                });
            }
            else {
                navigation.navigate("UsernameSet", { insideApp: true });
            }
        }
        else {
            navigation.navigate("getStarted");
        }
    };
    if (!loading) {
        return (<react_native_1.TouchableOpacity style={styles.lnAddressWrapper} onPress={handleOnPress}>
        <themed_1.Text type="p2" style={isHyperlink ? styles.hyperlink : {}}>
          {label}
          {!isHyperlink && (<themed_1.Text type="caption" color={colors.grey3}>
              @{hostName}
            </themed_1.Text>)}
        </themed_1.Text>
      </react_native_1.TouchableOpacity>);
    }
    return null;
};
exports.default = Username;
const useStyle = (0, themed_1.makeStyles)(({ colors }) => ({
    lnAddressWrapper: {
        marginTop: 10,
        marginHorizontal: 25,
    },
    hyperlink: {
        color: colors.accent02,
        textDecorationLine: "underline",
    },
}));
//# sourceMappingURL=Username.js.map