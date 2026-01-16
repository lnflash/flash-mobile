"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TotpRegistrationInitiateScreen = void 0;
const client_1 = require("@apollo/client");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const screen_1 = require("@app/components/screen");
const totp_export_1 = require("@app/components/totp-export");
const generated_1 = require("@app/graphql/generated");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const base_1 = require("@rneui/base");
const themed_1 = require("@rneui/themed");
const react_1 = require("react");
const react_native_1 = require("react-native");
const generateOtpAuthURI = (accountName, issuer, secret) => {
    const encodedAccount = encodeURIComponent(accountName);
    const encodedIssuer = encodeURIComponent(issuer);
    const base = `otpauth://totp/${issuer}:${encodedAccount}?`;
    const params = `secret=${secret}&issuer=${encodedIssuer}`;
    return base + params;
};
(0, client_1.gql) `
  query totpRegistrationScreen {
    me {
      username
    }
  }

  mutation userTotpRegistrationInitiate($input: UserTotpRegistrationInitiateInput!) {
    userTotpRegistrationInitiate(input: $input) {
      errors {
        message
      }
      totpRegistrationId
      totpSecret
    }
  }
`;
const TotpRegistrationInitiateScreen = () => {
    var _a;
    const navigation = (0, native_1.useNavigation)();
    const [totpRegistrationInitiate] = (0, generated_1.useUserTotpRegistrationInitiateMutation)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const { data } = (0, generated_1.useTotpRegistrationScreenQuery)();
    const username = ((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username) || "blink";
    const [secret, setSecret] = (0, react_1.useState)("");
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [totpRegistrationId, setTotpRegistrationId] = (0, react_1.useState)("");
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const authToken = appConfig.token;
    const service = appConfig.galoyInstance.name;
    const otpauth = generateOtpAuthURI(username, service, secret);
    (0, react_1.useEffect)(() => {
        const fn = async () => {
            var _a, _b, _c, _d, _e, _f, _g;
            const res = await totpRegistrationInitiate({ variables: { input: { authToken } } });
            if ((_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.userTotpRegistrationInitiate) === null || _b === void 0 ? void 0 : _b.totpRegistrationId) {
                setTotpRegistrationId((_d = (_c = res.data) === null || _c === void 0 ? void 0 : _c.userTotpRegistrationInitiate) === null || _d === void 0 ? void 0 : _d.totpRegistrationId);
            }
            else {
                react_native_1.Alert.alert(LL.common.error());
                return;
            }
            if ((_f = (_e = res.data) === null || _e === void 0 ? void 0 : _e.userTotpRegistrationInitiate) === null || _f === void 0 ? void 0 : _f.totpSecret) {
                setSecret((_g = res.data) === null || _g === void 0 ? void 0 : _g.userTotpRegistrationInitiate.totpSecret);
            }
            else {
                react_native_1.Alert.alert(LL.common.error());
                return;
            }
            setIsLoading(false);
        };
        fn();
    }, [authToken, totpRegistrationInitiate, LL]);
    return (<screen_1.Screen>
      {isLoading ? (<react_native_1.View style={styles.loadingContainer}>
          <react_native_1.ActivityIndicator color={colors.primary} size={"large"}/>
        </react_native_1.View>) : (<>
          <react_native_1.View style={styles.centeredContent}>
            <totp_export_1.QrCodeComponent otpauth={otpauth}/>
            <themed_1.Text style={styles.textStyle} type="h2">
              {LL.TotpRegistrationInitiateScreen.content()}
            </themed_1.Text>
          </react_native_1.View>

          <react_native_1.View style={styles.bottomContent}>
            <totp_export_1.CopySecretComponent secret={secret}/>
            <galoy_primary_button_1.GaloyPrimaryButton containerStyle={styles.buttonContainer} title={LL.common.next()} onPress={() => navigation.navigate("totpRegistrationValidate", { totpRegistrationId })}/>
          </react_native_1.View>
        </>)}
    </screen_1.Screen>);
};
exports.TotpRegistrationInitiateScreen = TotpRegistrationInitiateScreen;
const useStyles = (0, base_1.makeStyles)(() => ({
    loadingContainer: {
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
    },
    centeredContent: {
        padding: 20,
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    textStyle: {
        textAlign: "center",
        marginTop: 20,
    },
    buttonContainer: {
        marginTop: 20,
    },
    bottomContent: {
        justifyContent: "flex-end",
        padding: 20,
        marginBottom: 20,
    },
}));
//# sourceMappingURL=totp-registration-initiate.js.map