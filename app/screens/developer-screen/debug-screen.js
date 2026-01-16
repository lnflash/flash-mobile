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
exports.DeveloperScreen = void 0;
const client_1 = require("@apollo/client");
const galoy_input_1 = require("@app/components/atomic/galoy-input");
const config_1 = require("@app/config");
const client_only_query_1 = require("@app/graphql/client-only-query");
const generated_1 = require("@app/graphql/generated");
const use_app_config_1 = require("@app/hooks/use-app-config");
const i18n_util_1 = require("@app/i18n/i18n-util");
const toast_1 = require("@app/utils/toast");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const screen_1 = require("../../components/screen");
const hooks_1 = require("../../hooks");
const use_logout_1 = __importDefault(require("../../hooks/use-logout"));
const notifications_1 = require("../../utils/notifications");
const testProps_1 = require("../../utils/testProps");
const usingHermes = typeof HermesInternal === "object" && HermesInternal !== null;
const DeveloperScreen = () => {
    var _a, _b, _c, _d;
    const styles = useStyles();
    const client = (0, client_1.useApolloClient)();
    const { usdPerSat } = (0, hooks_1.usePriceConversion)();
    const { logout } = (0, use_logout_1.default)();
    const { appConfig, saveToken, saveTokenAndInstance } = (0, use_app_config_1.useAppConfig)();
    const token = appConfig.token;
    const { data: dataLevel } = (0, generated_1.useLevelQuery)({ fetchPolicy: "cache-only" });
    const level = String((_b = (_a = dataLevel === null || dataLevel === void 0 ? void 0 : dataLevel.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.level);
    const [newToken, setNewToken] = React.useState(token);
    const currentGaloyInstance = appConfig.galoyInstance;
    const [newGraphqlUri, setNewGraphqlUri] = React.useState(currentGaloyInstance.id === "Custom" ? currentGaloyInstance.graphqlUri : "");
    const [newGraphqlWslUri, setNewGraphqlWslUri] = React.useState(currentGaloyInstance.id === "Custom" ? currentGaloyInstance.graphqlWsUri : "");
    const [newPosUrl, setNewPosUrl] = React.useState(currentGaloyInstance.id === "Custom" ? currentGaloyInstance.posUrl : "");
    const [newRestUrl, setNewRestUrl] = React.useState(currentGaloyInstance.id === "Custom" ? currentGaloyInstance.authUrl : "");
    const [newLnAddressHostname, setNewLnAddressHostname] = React.useState(currentGaloyInstance.id === "Custom" ? currentGaloyInstance.lnAddressHostname : "");
    const [newGaloyInstance, setNewGaloyInstance] = React.useState(currentGaloyInstance.id);
    const dataBeta = (0, generated_1.useBetaQuery)();
    const beta = (_d = (_c = dataBeta.data) === null || _c === void 0 ? void 0 : _c.beta) !== null && _d !== void 0 ? _d : false;
    const changesHaveBeenMade = newToken !== token ||
        (newGaloyInstance !== currentGaloyInstance.id && newGaloyInstance !== "Custom") ||
        (newGaloyInstance === "Custom" &&
            Boolean(newGraphqlUri) &&
            Boolean(newGraphqlWslUri) &&
            Boolean(newPosUrl) &&
            Boolean(newRestUrl) &&
            (newGraphqlUri !== currentGaloyInstance.graphqlUri ||
                newGraphqlWslUri !== currentGaloyInstance.graphqlWsUri ||
                newPosUrl !== currentGaloyInstance.posUrl ||
                newRestUrl !== currentGaloyInstance.authUrl ||
                newLnAddressHostname !== currentGaloyInstance.lnAddressHostname));
    React.useEffect(() => {
        if (newGaloyInstance === currentGaloyInstance.id) {
            setNewToken(token);
        }
        else {
            setNewToken("");
        }
    }, [newGaloyInstance, currentGaloyInstance, token]);
    const handleSave = async () => {
        await logout(false);
        if (newGaloyInstance === "Custom") {
            saveTokenAndInstance({
                instance: {
                    id: "Custom",
                    graphqlUri: newGraphqlUri,
                    graphqlWsUri: newGraphqlWslUri,
                    authUrl: newRestUrl,
                    posUrl: newPosUrl,
                    lnAddressHostname: newLnAddressHostname,
                    name: "Custom",
                    blockExplorer: "https://mempool.space/tx/", // TODO make configurable
                },
                token: newToken || "",
            });
        }
        const newGaloyInstanceObject = config_1.GALOY_INSTANCES.find((instance) => instance.id === newGaloyInstance);
        if (newGaloyInstanceObject) {
            saveTokenAndInstance({ instance: newGaloyInstanceObject, token: newToken || "" });
            return;
        }
        saveToken(newToken || "");
    };
    return (<screen_1.Screen preset="scroll">
      <react_native_1.View style={styles.screenContainer}>
        <themed_1.Button title="Log out" containerStyle={styles.button} onPress={async () => {
            await logout();
            react_native_1.Alert.alert("state successfully deleted. Restart your app");
        }} {...(0, testProps_1.testProps)("logout button")}/>
        <themed_1.Button title="Send device token" containerStyle={styles.button} onPress={async () => {
            if (token && client) {
                (0, notifications_1.addDeviceToken)(client);
            }
        }}/>
        <themed_1.Button title={`Beta features: ${beta}`} containerStyle={styles.button} onPress={async () => (0, client_only_query_1.activateBeta)(client, !beta)}/>
        {__DEV__ && (<>
            <themed_1.Button title="Reload" containerStyle={styles.button} onPress={() => react_native_1.DevSettings.reload()}/>
            <themed_1.Button title="Crash test" containerStyle={styles.button} onPress={() => {
                (0, crashlytics_1.getCrashlytics)().log("Testing crash");
                (0, crashlytics_1.getCrashlytics)().crash();
            }}/>
            <themed_1.Button title="Error toast with translation" containerStyle={styles.button} {...(0, testProps_1.testProps)("Error Toast")} onPress={() => {
                (0, toast_1.toastShow)({
                    message: (translations) => translations.errors.generic(),
                    currentTranslation: (0, i18n_util_1.i18nObject)("es"),
                });
            }}/>
          </>)}
        <react_native_1.View>
          <themed_1.Text style={styles.textHeader}>Environment Information</themed_1.Text>
          <themed_1.Text selectable>Galoy Instance: {appConfig.galoyInstance.id}</themed_1.Text>
          <themed_1.Text selectable>GQL_URL: {appConfig.galoyInstance.graphqlUri}</themed_1.Text>
          <themed_1.Text selectable>GQL_WS_URL: {appConfig.galoyInstance.graphqlWsUri}</themed_1.Text>
          <themed_1.Text selectable>POS URL: {appConfig.galoyInstance.posUrl}</themed_1.Text>
          <themed_1.Text selectable>
            LN Address Hostname: {appConfig.galoyInstance.lnAddressHostname}
          </themed_1.Text>
          <themed_1.Text selectable>
            USD per 1 sat: {usdPerSat ? `$${usdPerSat}` : "No price data"}
          </themed_1.Text>
          <themed_1.Text>Token Present: {String(Boolean(token))}</themed_1.Text>
          <themed_1.Text>Level: {level}</themed_1.Text>
          <themed_1.Text>Hermes: {String(Boolean(usingHermes))}</themed_1.Text>
          <themed_1.Button {...(0, testProps_1.testProps)("Save Changes")} title="Save changes" style={styles.button} onPress={handleSave} disabled={!changesHaveBeenMade}/>
          <themed_1.Text style={styles.textHeader}>Update Environment</themed_1.Text>
          {config_1.possibleGaloyInstanceNames.map((instanceName) => (<themed_1.Button key={instanceName} title={instanceName} onPress={() => {
                setNewGaloyInstance(instanceName);
            }} {...(0, testProps_1.testProps)(`${instanceName} button`)} buttonStyle={instanceName === newGaloyInstance
                ? styles.selectedInstanceButton
                : styles.notSelectedInstanceButton} titleStyle={instanceName === newGaloyInstance
                ? styles.selectedInstanceButton
                : styles.notSelectedInstanceButton} containerStyle={instanceName === newGaloyInstance
                ? styles.selectedInstanceButton
                : styles.notSelectedInstanceButton} {...(0, testProps_1.testProps)(`${instanceName} Button`)}/>))}
          <galoy_input_1.GaloyInput {...(0, testProps_1.testProps)("Input access token")} label="Access Token" placeholder={"Access token"} value={newToken} secureTextEntry={true} onChangeText={setNewToken} selectTextOnFocus/>
          <themed_1.Button {...(0, testProps_1.testProps)("Copy access token")} title="Copy access token" containerStyle={styles.button} onPress={async () => {
            clipboard_1.default.setString(newToken || "");
            react_native_1.Alert.alert("Token copied in clipboard.");
        }} disabled={!newToken}/>
          {newGaloyInstance === "Custom" && (<>
              <galoy_input_1.GaloyInput label="Graphql Uri" placeholder={"Graphql Uri"} autoCapitalize="none" autoCorrect={false} value={newGraphqlUri} onChangeText={setNewGraphqlUri} selectTextOnFocus/>
              <galoy_input_1.GaloyInput label="Graphql Ws Uri" placeholder={"Graphql Ws Uri"} autoCapitalize="none" autoCorrect={false} value={newGraphqlWslUri} onChangeText={setNewGraphqlWslUri} selectTextOnFocus/>
              <galoy_input_1.GaloyInput label="POS Url" placeholder={"POS Url"} autoCapitalize="none" autoCorrect={false} value={newPosUrl} onChangeText={setNewPosUrl} selectTextOnFocus/>
              <galoy_input_1.GaloyInput label="Rest Url" placeholder={"Rest Url"} autoCapitalize="none" autoCorrect={false} value={newRestUrl} onChangeText={setNewRestUrl} selectTextOnFocus/>
              <galoy_input_1.GaloyInput label="LN Address Hostname" placeholder={"LN Address Hostname"} autoCapitalize="none" autoCorrect={false} value={newLnAddressHostname} onChangeText={setNewLnAddressHostname} selectTextOnFocus/>
            </>)}
        </react_native_1.View>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.DeveloperScreen = DeveloperScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    button: {
        marginVertical: 6,
    },
    screenContainer: {
        marginHorizontal: 12,
        marginBottom: 40,
    },
    textHeader: {
        fontSize: 18,
        marginVertical: 12,
    },
    selectedInstanceButton: {
        backgroundColor: colors.grey5,
        color: colors.white,
    },
    notSelectedInstanceButton: {
        backgroundColor: colors.white,
        color: colors.grey3,
    },
}));
//# sourceMappingURL=debug-screen.js.map