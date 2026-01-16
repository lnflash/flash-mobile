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
exports.ConversionConfirmationScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
// components
const screen_1 = require("@app/components/screen");
const buttons_1 = require("@app/components/buttons");
const swap_flow_1 = require("@app/components/swap-flow");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const generated_1 = require("@app/graphql/generated");
const hooks_1 = require("@app/hooks");
// utils
const toast_1 = require("@app/utils/toast");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const ConversionConfirmationScreen = ({ navigation, route }) => {
    var _a, _b;
    const { moneyAmount, sendingFee, receivingFee, lnInvoice, fromWalletCurrency } = route.params;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const { swap } = (0, hooks_1.useSwap)();
    const [errorMessage, setErrorMessage] = (0, react_1.useState)();
    const { data } = (0, generated_1.useConversionScreenQuery)({
        fetchPolicy: "cache-first",
        returnPartialData: true,
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const convertHandler = async () => {
        if (lnInvoice) {
            try {
                toggleActivityIndicator(true);
                const res = await swap(lnInvoice, fromWalletCurrency);
                if (res) {
                    handlePaymentSuccess();
                }
            }
            catch (err) {
                if (err instanceof Error) {
                    (0, crashlytics_1.getCrashlytics)().recordError(err);
                    handlePaymentError(err);
                }
            }
        }
    };
    const handlePaymentError = (error) => {
        toggleActivityIndicator(false);
        setErrorMessage(error.message);
        (0, toast_1.toastShow)({ message: error.message });
    };
    const handlePaymentSuccess = () => {
        toggleActivityIndicator(false);
        navigation.dispatch((state) => {
            const routes = [{ name: "Primary" }, { name: "conversionSuccess" }];
            return native_1.CommonActions.reset(Object.assign(Object.assign({}, state), { routes, index: routes.length - 1 }));
        });
    };
    return (<screen_1.Screen>
      <react_native_1.ScrollView>
        <swap_flow_1.ConfirmationDetails fromWallet={fromWalletCurrency === "BTC" ? btcWallet : usdWallet} toWallet={fromWalletCurrency === "BTC" ? usdWallet : btcWallet} moneyAmount={moneyAmount} totalFee={sendingFee + receivingFee}/>
        {errorMessage && <react_native_1.Text style={styles.errorText}>{errorMessage}</react_native_1.Text>}
      </react_native_1.ScrollView>
      <buttons_1.PrimaryBtn label={LL.common.convert()} btnStyle={styles.btnStyls} onPress={convertHandler}/>
    </screen_1.Screen>);
};
exports.ConversionConfirmationScreen = ConversionConfirmationScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    btnStyls: {
        marginHorizontal: 20,
        marginBottom: 20,
    },
    errorText: {
        color: colors.error,
        textAlign: "center",
    },
}));
//# sourceMappingURL=conversion-confirmation-screen.js.map