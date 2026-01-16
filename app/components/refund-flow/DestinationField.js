"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const i18n_react_1 = require("@app/i18n/i18n-react");
// assets
const scan_svg_1 = __importDefault(require("@app/assets/icons/scan.svg"));
// utils
const testProps_1 = require("../../utils/testProps");
const DestinationField = ({ destination, status, validateDestination, handleChangeText, setDestination, navigateToScanning, }) => {
    const styles = usestyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const onPaste = async () => {
        const clipboard = await clipboard_1.default.getString();
        setDestination(clipboard);
    };
    let inputContainerStyle;
    switch (status) {
        case "invalid":
            inputContainerStyle = styles.errorInputContainer;
            break;
        case "valid":
            inputContainerStyle = styles.validInputContainer;
            break;
        default:
            inputContainerStyle = styles.enteringInputContainer;
    }
    return (<react_native_1.View>
      <themed_1.Text {...(0, testProps_1.testProps)(LL.SendBitcoinScreen.destination())} style={styles.fieldTitleText}>
        {LL.SendBitcoinScreen.destination()}
      </themed_1.Text>

      <react_native_1.View style={[styles.fieldBackground, inputContainerStyle]}>
        <react_native_1.TextInput {...(0, testProps_1.testProps)(LL.SendBitcoinScreen.placeholder())} style={styles.input} placeholder={LL.SendBitcoinScreen.placeholder()} placeholderTextColor={colors.grey2} onChangeText={handleChangeText} value={destination} onSubmitEditing={validateDestination} selectTextOnFocus autoCapitalize="none" autoCorrect={false}/>
        <react_native_1.TouchableWithoutFeedback onPress={navigateToScanning}>
          <react_native_1.View style={styles.iconContainer}>
            <scan_svg_1.default fill={colors.primary}/>
          </react_native_1.View>
        </react_native_1.TouchableWithoutFeedback>
        <react_native_1.TouchableWithoutFeedback onPress={onPaste}>
          <react_native_1.View style={styles.iconContainer}>
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
        marginBottom: 5,
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
        marginBottom: 10,
    },
    iconContainer: {
        width: 50,
        justifyContent: "center",
        alignItems: "center",
    },
}));
//# sourceMappingURL=DestinationField.js.map