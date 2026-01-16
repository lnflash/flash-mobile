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
exports.EmailRegistrationValidateScreen = void 0;
const client_1 = require("@apollo/client");
const code_input_1 = require("@app/components/code-input");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
(0, client_1.gql) `
  mutation userEmailRegistrationValidate($input: UserEmailRegistrationValidateInput!) {
    userEmailRegistrationValidate(input: $input) {
      errors {
        message
      }
      me {
        id
        email {
          address
          verified
        }
      }
    }
  }
`;
const EmailRegistrationValidateScreen = ({ route }) => {
    const navigation = (0, native_1.useNavigation)();
    const [errorMessage, setErrorMessage] = React.useState("");
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [emailVerify] = (0, generated_1.useUserEmailRegistrationValidateMutation)();
    const [loading, setLoading] = (0, react_1.useState)(false);
    const { emailRegistrationId, email } = route.params;
    const send = (0, react_1.useCallback)(async (code) => {
        var _a, _b, _c, _d, _e;
        try {
            setLoading(true);
            const res = await emailVerify({
                variables: { input: { code, emailRegistrationId } },
            });
            if ((_a = res.data) === null || _a === void 0 ? void 0 : _a.userEmailRegistrationValidate.errors) {
                const error = (_b = res.data.userEmailRegistrationValidate.errors[0]) === null || _b === void 0 ? void 0 : _b.message;
                // TODO: manage translation for errors
                setErrorMessage(error);
            }
            if ((_e = (_d = (_c = res.data) === null || _c === void 0 ? void 0 : _c.userEmailRegistrationValidate.me) === null || _d === void 0 ? void 0 : _d.email) === null || _e === void 0 ? void 0 : _e.verified) {
                react_native_1.Alert.alert(LL.common.success(), LL.EmailRegistrationValidateScreen.success({ email }), [
                    {
                        text: LL.common.ok(),
                        onPress: () => {
                            navigation.navigate("settings");
                        },
                    },
                ]);
            }
            else {
                throw new Error(LL.common.errorAuthToken());
            }
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    }, [emailVerify, emailRegistrationId, navigation, LL, email]);
    const header = LL.EmailRegistrationValidateScreen.header({ email });
    return (<code_input_1.CodeInput send={send} header={header} loading={loading} errorMessage={errorMessage} setErrorMessage={setErrorMessage}/>);
};
exports.EmailRegistrationValidateScreen = EmailRegistrationValidateScreen;
//# sourceMappingURL=email-registration-validate.js.map