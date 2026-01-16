"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const themed_1 = require("@rneui/themed");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const native_1 = require("@react-navigation/native");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const i18n_react_1 = require("@app/i18n/i18n-react");
// assets
const scan_svg_1 = __importDefault(require("@app/assets/icons/scan.svg"));
// utils
const toast_1 = require("@app/utils/toast");
const testProps_1 = require("../../utils/testProps");
const DestinationField = ({ validateDestination, handleChangeText, destinationState, dispatchDestinationStateAction, }) => {
    const styles = usestyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const navigation = (0, native_1.useNavigation)();
    let inputContainerStyle;
    switch (destinationState.destinationState) {
        case "entering":
        case "validating":
            inputContainerStyle = styles.enteringInputContainer;
            break;
        case "invalid":
            inputContainerStyle = styles.errorInputContainer;
            break;
        case "valid":
            if (!destinationState.confirmationType) {
                inputContainerStyle = styles.validInputContainer;
                break;
            }
            inputContainerStyle = styles.warningInputContainer;
            break;
        case "requires-confirmation":
            inputContainerStyle = styles.warningInputContainer;
    }
    return (<react_native_1.View>
      <themed_1.Text {...(0, testProps_1.testProps)(LL.SendBitcoinScreen.destination())} style={styles.fieldTitleText}>
        {LL.SendBitcoinScreen.destination()}
      </themed_1.Text>

      <react_native_1.View style={[styles.fieldBackground, inputContainerStyle]}>
        <react_native_1.TextInput {...(0, testProps_1.testProps)(LL.SendBitcoinScreen.placeholder())} style={styles.input} placeholder={LL.SendBitcoinScreen.placeholder()} placeholderTextColor={colors.grey2} onChangeText={handleChangeText} value={destinationState.unparsedDestination} onSubmitEditing={() => validateDestination &&
            validateDestination(destinationState.unparsedDestination)} selectTextOnFocus autoCapitalize="none" autoCorrect={false}/>
        <react_native_1.TouchableWithoutFeedback onPress={() => navigation.navigate("scanningQRCode")}>
          <react_native_1.View style={styles.iconContainer}>
            <scan_svg_1.default fill={colors.primary}/>
          </react_native_1.View>
        </react_native_1.TouchableWithoutFeedback>
        <react_native_1.TouchableWithoutFeedback onPress={async () => {
            try {
                const clipboard = await clipboard_1.default.getString();
                dispatchDestinationStateAction({
                    type: "set-unparsed-destination",
                    payload: {
                        unparsedDestination: clipboard,
                    },
                });
                validateDestination && (await validateDestination(clipboard));
            }
            catch (err) {
                if (err instanceof Error) {
                    (0, crashlytics_1.getCrashlytics)().recordError(err);
                }
                (0, toast_1.toastShow)({
                    type: "error",
                    message: (translations) => translations.SendBitcoinDestinationScreen.clipboardError(),
                    currentTranslation: LL,
                });
            }
        }}>
          <react_native_1.View style={styles.iconContainer}>
            {/* we could Paste from "FontAwesome" but as svg*/}
            <Ionicons_1.default name="clipboard-outline" color={colors.primary} size={22}/>
          </react_native_1.View>
        </react_native_1.TouchableWithoutFeedback>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = DestinationField;
const usestyles = (0, themed_1.makeStyles)(({ colors }) => ({
    fieldBackground: {
        flexDirection: "row",
        borderStyle: "solid",
        overflow: "hidden",
        backgroundColor: colors.grey5,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        height: 60,
        marginBottom: 10,
    },
    enteringInputContainer: {},
    errorInputContainer: {
        borderColor: colors.error,
        borderWidth: 1,
    },
    validInputContainer: {
        borderColor: colors.green,
        borderWidth: 1,
    },
    warningInputContainer: {
        borderColor: colors.warning,
        borderWidth: 1,
    },
    input: {
        flex: 1,
        paddingHorizontal: 12,
        color: colors.black,
    },
    fieldTitleText: {
        fontWeight: "bold",
        marginBottom: 5,
    },
    iconContainer: {
        width: 50,
        justifyContent: "center",
        alignItems: "center",
    },
}));
//# sourceMappingURL=DestinationField.js.map