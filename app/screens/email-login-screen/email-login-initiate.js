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
exports.EmailLoginInitiateScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const axios_1 = __importStar(require("axios"));
const themed_1 = require("@rneui/themed");
// components
const screen_1 = require("../../components/screen");
const buttons_1 = require("@app/components/buttons");
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
// utils
const testProps_1 = require("@app/utils/testProps");
const validator_1 = __importDefault(require("validator"));
const EmailLoginInitiateScreen = ({ navigation }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { authUrl } = (0, hooks_1.useAppConfig)().appConfig.galoyInstance;
    const [emailInput, setEmailInput] = (0, react_1.useState)("");
    const [errorMessage, setErrorMessage] = (0, react_1.useState)("");
    const [loading, setLoading] = (0, react_1.useState)(false);
    const updateInput = (text) => {
        setEmailInput(text);
        setErrorMessage("");
    };
    const submit = async () => {
        var _a, _b, _c;
        if (!validator_1.default.isEmail(emailInput)) {
            setErrorMessage(LL.EmailLoginInitiateScreen.invalidEmail());
            return;
        }
        setLoading(true);
        const url = `${authUrl}/auth/email/code`;
        try {
            const res = await (0, axios_1.default)({
                url,
                method: "POST",
                data: {
                    email: emailInput,
                },
            });
            // TODO: manage error on ip rate limit
            // TODO: manage error when trying the same email too often
            const emailLoginId = res.data.result;
            if (emailLoginId) {
                console.log({ emailLoginId });
                navigation.navigate("emailLoginValidate", { emailLoginId, email: emailInput });
            }
            else {
                console.warn("no flow returned");
            }
        }
        catch (err) {
            console.error(err, "error in setEmailMutation");
            if ((0, axios_1.isAxiosError)(err)) {
                console.log(err.message); // Gives you the basic error message
                console.log((_a = err.response) === null || _a === void 0 ? void 0 : _a.data); // Gives you the response payload from the server
                console.log((_b = err.response) === null || _b === void 0 ? void 0 : _b.status); // Gives you the HTTP status code
                console.log((_c = err.response) === null || _c === void 0 ? void 0 : _c.headers); // Gives you the response headers
                // If the request was made but no response was received
                if (!err.response) {
                    console.log(err.request);
                }
                setErrorMessage(err.message);
            }
        }
        finally {
            setLoading(false);
        }
    };
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <react_native_1.View style={styles.viewWrapper}>
        <themed_1.Text type={"p1"} style={styles.header}>
          {LL.EmailLoginInitiateScreen.header()}
        </themed_1.Text>
        <themed_1.Input {...(0, testProps_1.testProps)(LL.EmailRegistrationInitiateScreen.placeholder())} placeholder={LL.EmailRegistrationInitiateScreen.placeholder()} autoCapitalize="none" containerStyle={styles.inputContainer} inputContainerStyle={styles.inputContainerStyle} renderErrorMessage={false} textContentType="emailAddress" keyboardType="email-address" value={emailInput} onChangeText={updateInput} autoFocus={true}/>
        {errorMessage && <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>}
      </react_native_1.View>
      <buttons_1.PrimaryBtn label={LL.EmailLoginInitiateScreen.send()} loading={loading} disabled={!emailInput} onPress={submit}/>
    </screen_1.Screen>);
};
exports.EmailLoginInitiateScreen = EmailLoginInitiateScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    inputContainer: {
        marginBottom: 20,
        flexDirection: "row",
        alignItems: "stretch",
        minHeight: 48,
    },
    header: {
        marginBottom: 20,
    },
    viewWrapper: {
        flex: 1,
    },
    inputContainerStyle: {
        flex: 1,
        borderWidth: 1,
        paddingHorizontal: 10,
        borderColor: colors.border02,
        borderRadius: 10,
    },
}));
//# sourceMappingURL=email-login-initiate.js.map