"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPin = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
const AddPin = ({ visible }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    if (visible) {
        return (<react_native_1.View style={styles.addPinContainer}>
        <themed_1.Text style={styles.addPinText}>{LL.MapScreen.addPin()}</themed_1.Text>
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.AddPin = AddPin;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    addPinContainer: {
        position: "absolute",
        top: 90,
        opacity: 0.8,
        borderRadius: 20,
        paddingVertical: 15,
        paddingHorizontal: 40,
        backgroundColor: colors.green,
        zIndex: 1,
    },
    addPinText: {
        color: colors._white,
        fontSize: 18,
    },
}));
//# sourceMappingURL=AddPin.js.map