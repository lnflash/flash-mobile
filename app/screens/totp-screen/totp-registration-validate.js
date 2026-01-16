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
exports.TotpRegistrationValidateScreen = void 0;
const client_1 = require("@apollo/client");
const code_input_1 = require("@app/components/code-input");
const generated_1 = require("@app/graphql/generated");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
(0, client_1.gql) `
  mutation userTotpRegistrationValidate($input: UserTotpRegistrationValidateInput!) {
    userTotpRegistrationValidate(input: $input) {
      errors {
        message
      }
      me {
        totpEnabled
        phone
        email {
          address
          verified
        }
      }
    }
  }
`;
const TotpRegistrationValidateScreen = ({ route }) => {
    const navigation = (0, native_1.useNavigation)();
    const [totpRegistrationValidate] = (0, generated_1.useUserTotpRegistrationValidateMutation)();
    const [errorMessage, setErrorMessage] = (0, react_1.useState)("");
    const [loading, setLoading] = (0, react_1.useState)(false);
    const totpRegistrationId = route.params.totpRegistrationId;
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const authToken = appConfig.token;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const send = (0, react_1.useCallback)(async (code) => {
        var _a, _b, _c, _d;
        try {
            setLoading(true);
            const res = await totpRegistrationValidate({
                variables: { input: { totpCode: code, totpRegistrationId, authToken } },
                refetchQueries: [generated_1.AccountScreenDocument],
            });
            if ((_a = res.data) === null || _a === void 0 ? void 0 : _a.userTotpRegistrationValidate.errors) {
                const error = (_b = res.data.userTotpRegistrationValidate.errors[0]) === null || _b === void 0 ? void 0 : _b.message;
                // TODO: manage translation for errors
                setErrorMessage(error);
            }
            if ((_d = (_c = res.data) === null || _c === void 0 ? void 0 : _c.userTotpRegistrationValidate.me) === null || _d === void 0 ? void 0 : _d.totpEnabled) {
                react_native_1.Alert.alert(LL.common.success(), LL.TotpRegistrationValidateScreen.success(), [
                    {
                        text: LL.common.ok(),
                        onPress: () => {
                            navigation.navigate("accountScreen");
                        },
                    },
                ]);
            }
        }
        catch (err) {
            console.error(err);
            react_native_1.Alert.alert(LL.common.error());
        }
        finally {
            setLoading(false);
        }
    }, [navigation, LL, totpRegistrationId, authToken, totpRegistrationValidate]);
    const header = LL.TotpRegistrationValidateScreen.enter6digitCode();
    return (<code_input_1.CodeInput send={send} header={header} loading={loading} errorMessage={errorMessage} setErrorMessage={setErrorMessage}/>);
};
exports.TotpRegistrationValidateScreen = TotpRegistrationValidateScreen;
//# sourceMappingURL=totp-registration-validate.js.map