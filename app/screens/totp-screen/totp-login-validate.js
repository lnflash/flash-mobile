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
exports.TotpLoginValidateScreen = void 0;
const code_input_1 = require("@app/components/code-input");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const axios_1 = __importStar(require("axios"));
const react_1 = __importStar(require("react"));
const analytics_1 = require("@react-native-firebase/analytics");
const TotpLoginValidateScreen = ({ route }) => {
    const navigation = (0, native_1.useNavigation)();
    const [errorMessage, setErrorMessage] = (0, react_1.useState)("");
    const { saveToken } = (0, hooks_1.useAppConfig)();
    const [loading, setLoading] = (0, react_1.useState)(false);
    const authToken = route.params.authToken;
    const { appConfig: { galoyInstance: { authUrl }, }, } = (0, hooks_1.useAppConfig)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const send = (0, react_1.useCallback)(async (code) => {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            setLoading(true);
            const url = `${authUrl}/auth/totp/validate`;
            const response = await (0, axios_1.default)({
                url,
                method: "POST",
                data: {
                    totpCode: code,
                    authToken,
                },
            });
            const success = response.status === 200;
            if (success) {
                (0, analytics_1.getAnalytics)().logLogin({
                    method: "email-2fa",
                });
                saveToken(authToken);
                navigation.reset({
                    routes: [{ name: "Primary" }],
                });
                return;
            }
        }
        catch (err) {
            console.error(err, "error axios");
            if ((0, axios_1.isAxiosError)(err)) {
                console.log(err.message); // Gives you the basic error message
                console.log((_a = err.response) === null || _a === void 0 ? void 0 : _a.data); // Gives you the response payload from the server
                console.log((_b = err.response) === null || _b === void 0 ? void 0 : _b.status); // Gives you the HTTP status code
                console.log((_c = err.response) === null || _c === void 0 ? void 0 : _c.headers); // Gives you the response headers
                // If the request was made but no response was received
                if (!err.response) {
                    console.log(err.request);
                }
                if ((_e = (_d = err.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.error) {
                    setErrorMessage((_g = (_f = err.response) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.error);
                }
                else {
                    setErrorMessage(err.message);
                }
            }
        }
        finally {
            setLoading(false);
        }
    }, [authToken, navigation, authUrl, saveToken]);
    const header = LL.TotpLoginValidateScreen.content();
    return (<code_input_1.CodeInput send={send} header={header} loading={loading} errorMessage={errorMessage} setErrorMessage={setErrorMessage}/>);
};
exports.TotpLoginValidateScreen = TotpLoginValidateScreen;
//# sourceMappingURL=totp-login-validate.js.map