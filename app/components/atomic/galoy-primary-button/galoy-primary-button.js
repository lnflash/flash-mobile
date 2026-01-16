"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyPrimaryButton = void 0;
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const testProps_1 = require("@app/utils/testProps");
const GaloyPrimaryButton = (props) => {
    const styles = useStyles();
    return (<themed_1.Button {...(typeof props.title === "string" ? (0, testProps_1.testProps)(props.title) : {})} activeOpacity={0.85} TouchableComponent={react_native_1.TouchableHighlight} buttonStyle={styles.buttonStyle} titleStyle={styles.titleStyle} disabledStyle={styles.disabledStyle} disabledTitleStyle={styles.disabledTitleStyle} {...props}/>);
};
exports.GaloyPrimaryButton = GaloyPrimaryButton;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    titleStyle: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "600",
        color: colors.white,
    },
    disabledTitleStyle: {
        color: colors.grey5,
    },
    buttonStyle: {
        minHeight: 50,
        backgroundColor: colors.primary3,
    },
    disabledStyle: {
        opacity: 0.5,
        backgroundColor: colors.primary3,
    },
}));
//# sourceMappingURL=galoy-primary-button.js.map