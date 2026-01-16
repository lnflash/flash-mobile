"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const react_native_image_picker_1 = require("react-native-image-picker");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const rn_qr_generator_1 = __importDefault(require("rn-qr-generator"));
// utils
const toast_1 = require("@app/utils/toast");
// assets
const paste_svg_1 = __importDefault(require("@app/assets/icons/paste.svg"));
const photo_add_svg_1 = __importDefault(require("@app/assets/icons/photo-add.svg"));
const ActionBtns = ({ processInvoice, hidePaste }) => {
    const styles = useStyles();
    const { bottom } = (0, react_native_safe_area_context_1.useSafeAreaInsets)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const handleInvoicePaste = async () => {
        try {
            const data = await clipboard_1.default.getString();
            processInvoice(data);
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
                react_native_1.Alert.alert(err.toString());
            }
        }
    };
    const showImagePicker = async () => {
        try {
            const result = await (0, react_native_image_picker_1.launchImageLibrary)({ mediaType: "photo" });
            if (result.errorCode === "permission") {
                (0, toast_1.toastShow)({
                    message: (translations) => translations.ScanningQRCodeScreen.imageLibraryPermissionsNotGranted(),
                });
            }
            if (result.assets && result.assets.length > 0 && result.assets[0].uri) {
                const qrCodeValues = await rn_qr_generator_1.default.detect({ uri: result.assets[0].uri });
                if (qrCodeValues && qrCodeValues.values.length > 0) {
                    processInvoice(qrCodeValues.values[0]);
                }
                else {
                    react_native_1.Alert.alert(LL.ScanningQRCodeScreen.noQrCode());
                }
            }
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
                react_native_1.Alert.alert(err.toString());
            }
        }
    };
    return (<react_native_1.View style={[
            styles.bottom,
            {
                paddingBottom: bottom,
                justifyContent: hidePaste ? "flex-end" : "space-between",
            },
        ]}>
      <react_native_1.TouchableOpacity style={styles.padding} onPress={showImagePicker}>
        <photo_add_svg_1.default />
      </react_native_1.TouchableOpacity>
      {!hidePaste && (<react_native_1.TouchableOpacity style={styles.padding} onPress={handleInvoicePaste}>
          <paste_svg_1.default />
        </react_native_1.TouchableOpacity>)}
    </react_native_1.View>);
};
const useStyles = (0, themed_1.makeStyles)(() => ({
    bottom: {
        flexDirection: "row",
        justifyContent: "space-between",
        backgroundColor: "#000",
    },
    padding: {
        padding: 24,
    },
}));
exports.default = ActionBtns;
//# sourceMappingURL=ActionBtns.js.map