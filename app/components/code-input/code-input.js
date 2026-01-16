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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeInput = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const screen_1 = require("../screen");
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
// utils
const testProps_1 = require("@app/utils/testProps");
const placeholder = "000000";
const CodeInput = ({ send, header, loading, errorMessage, setErrorMessage, }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const [code, _setCode] = (0, react_1.useState)("");
    const setCode = (code) => {
        if (code.length > 6) {
            return;
        }
        setErrorMessage("");
        _setCode(code);
        if (code.length === 6) {
            send(code);
        }
    };
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <themed_1.Text type="p1" style={styles.header}>
        {header}
      </themed_1.Text>
      <themed_1.Input {...(0, testProps_1.testProps)(placeholder)} placeholder={placeholder} containerStyle={styles.inputComponentContainerStyle} inputContainerStyle={styles.inputContainerStyle} inputStyle={styles.inputStyle} value={code} onChangeText={setCode} renderErrorMessage={false} autoFocus={true} textContentType={"oneTimeCode"} keyboardType="numeric"/>
      {errorMessage && (<react_native_1.View style={styles.errorContainer}>
          <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>
        </react_native_1.View>)}
      {loading && (<react_native_1.ActivityIndicator style={styles.activityIndicator} size="large" color={colors.primary}/>)}
    </screen_1.Screen>);
};
exports.CodeInput = CodeInput;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    activityIndicator: {
        marginTop: 12,
    },
    header: {
        marginBottom: 20,
    },
    inputComponentContainerStyle: {
        flexDirection: "row",
        marginBottom: 20,
        paddingLeft: 0,
        paddingRight: 0,
        justifyContent: "center",
    },
    inputContainerStyle: {
        minWidth: 160,
        minHeight: 60,
        borderWidth: 1,
        paddingHorizontal: 10,
        borderColor: colors.border02,
        borderRadius: 10,
        marginRight: 0,
    },
    inputStyle: {
        fontSize: 24,
        textAlign: "center",
    },
    errorContainer: {
        marginBottom: 20,
    },
}));
//# sourceMappingURL=code-input.js.map