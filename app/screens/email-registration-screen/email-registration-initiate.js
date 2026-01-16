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
exports.EmailRegistrationInitiateScreen = void 0;
const client_1 = require("@apollo/client");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const screen_1 = require("../../components/screen");
const validator_1 = __importDefault(require("validator"));
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
const testProps_1 = require("@app/utils/testProps");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    buttonsContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    inputContainer: {
        marginBottom: 20,
        flexDirection: "row",
        alignItems: "stretch",
        minHeight: 48,
    },
    textContainer: {
        marginBottom: 20,
    },
    viewWrapper: { flex: 1 },
    inputContainerStyle: {
        flex: 1,
        borderWidth: 2,
        borderBottomWidth: 2,
        paddingHorizontal: 10,
        borderColor: colors.primary5,
        borderRadius: 8,
    },
    errorContainer: {
        marginBottom: 20,
    },
}));
(0, client_1.gql) `
  mutation userEmailRegistrationInitiate($input: UserEmailRegistrationInitiateInput!) {
    userEmailRegistrationInitiate(input: $input) {
      errors {
        message
      }
      emailRegistrationId
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
const EmailRegistrationInitiateScreen = () => {
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const [emailInput, setEmailInput] = React.useState("");
    const [errorMessage, setErrorMessage] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [setEmailMutation] = (0, generated_1.useUserEmailRegistrationInitiateMutation)();
    const submit = async () => {
        if (!validator_1.default.isEmail(emailInput)) {
            setErrorMessage(LL.EmailRegistrationInitiateScreen.invalidEmail());
            return;
        }
        setLoading(true);
        try {
            const { data } = await setEmailMutation({
                variables: { input: { email: emailInput } },
            });
            const errors = data === null || data === void 0 ? void 0 : data.userEmailRegistrationInitiate.errors;
            if (errors && errors.length > 0) {
                console.log(errors, "errors");
                setErrorMessage(errors[0].message);
                return;
            }
            const emailRegistrationId = data === null || data === void 0 ? void 0 : data.userEmailRegistrationInitiate.emailRegistrationId;
            if (emailRegistrationId) {
                navigation.navigate("emailRegistrationValidate", {
                    emailRegistrationId,
                    email: emailInput,
                });
            }
            else {
                setErrorMessage(LL.EmailRegistrationInitiateScreen.missingEmailRegistrationId());
            }
        }
        catch (err) {
            if (err instanceof Error) {
                react_native_1.Alert.alert(LL.common.error(), err.message);
            }
            console.error(err, "error in setEmailMutation");
        }
        finally {
            setLoading(false);
        }
    };
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <react_native_1.View style={styles.viewWrapper}>
        <react_native_1.View style={styles.textContainer}>
          <themed_1.Text type={"p1"}>{LL.EmailRegistrationInitiateScreen.header()}</themed_1.Text>
        </react_native_1.View>

        <react_native_1.View style={styles.inputContainer}>
          <themed_1.Input {...(0, testProps_1.testProps)(LL.EmailRegistrationInitiateScreen.placeholder())} placeholder={LL.EmailRegistrationInitiateScreen.placeholder()} autoCapitalize="none" inputContainerStyle={styles.inputContainerStyle} renderErrorMessage={false} textContentType="emailAddress" keyboardType="email-address" value={emailInput} onChangeText={setEmailInput} autoFocus={true}/>
        </react_native_1.View>
        {errorMessage && (<react_native_1.View style={styles.errorContainer}>
            <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>
          </react_native_1.View>)}

        <react_native_1.View style={styles.buttonsContainer}>
          <galoy_primary_button_1.GaloyPrimaryButton title={LL.EmailRegistrationInitiateScreen.send()} loading={loading} disabled={!emailInput} onPress={submit}/>
        </react_native_1.View>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.EmailRegistrationInitiateScreen = EmailRegistrationInitiateScreen;
//# sourceMappingURL=email-registration-initiate.js.map