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
exports.ConversionDetailsScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const swap_flow_1 = require("@app/components/swap-flow");
const screen_1 = require("@app/components/screen");
const buttons_1 = require("@app/components/buttons");
// hooks
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
// types & utils
const amounts_1 = require("@app/types/amounts");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
// gql
const generated_1 = require("@app/graphql/generated");
const ConversionDetailsScreen = ({ navigation }) => {
    var _a, _b, _c, _d;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { zeroDisplayAmount } = (0, hooks_1.useDisplayCurrency)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { formatDisplayAndWalletAmount } = (0, hooks_1.useDisplayCurrency)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const { prepareBtcToUsd, prepareUsdToBtc } = (0, hooks_1.useSwap)();
    const [errorMsg, setErrorMsg] = (0, react_1.useState)();
    const [fromWalletCurrency, setFromWalletCurrency] = (0, react_1.useState)("BTC");
    const [moneyAmount, setMoneyAmount] = (0, react_1.useState)(zeroDisplayAmount);
    (0, generated_1.useRealtimePriceQuery)({
        fetchPolicy: "network-only",
    });
    const { data } = (0, generated_1.useConversionScreenQuery)({
        fetchPolicy: "cache-first",
        returnPartialData: true,
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const btcBalance = (0, amounts_1.toBtcMoneyAmount)((_c = btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance) !== null && _c !== void 0 ? _c : NaN);
    const usdBalance = (0, amounts_1.toUsdMoneyAmount)((_d = usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance) !== null && _d !== void 0 ? _d : NaN);
    if (!convertMoneyAmount)
        return;
    const convertedBTCBalance = convertMoneyAmount(btcBalance, amounts_1.DisplayCurrency);
    const convertedUsdBalance = convertMoneyAmount(usdBalance, amounts_1.DisplayCurrency);
    const settlementSendAmount = convertMoneyAmount(moneyAmount, fromWalletCurrency);
    const formattedBtcBalance = formatDisplayAndWalletAmount({
        displayAmount: convertedBTCBalance,
        walletAmount: btcBalance,
    });
    const formattedUsdBalance = formatDisplayAndWalletAmount({
        displayAmount: convertedUsdBalance,
        walletAmount: usdBalance,
    });
    const fromWalletBalance = fromWalletCurrency === "BTC" ? btcBalance : usdBalance;
    const isValidAmount = settlementSendAmount.amount > 0 &&
        settlementSendAmount.amount <= fromWalletBalance.amount;
    const canToggleWallet = fromWalletCurrency === "BTC" ? usdBalance.amount > 0 : btcBalance.amount > 0;
    const setAmountToBalancePercentage = (percentage) => {
        const fromBalance = fromWalletCurrency === generated_1.WalletCurrency.Btc ? btcBalance.amount : usdBalance.amount;
        setMoneyAmount((0, amounts_1.toWalletAmount)({
            amount: Math.round((fromBalance * percentage) / 100),
            currency: fromWalletCurrency,
        }));
    };
    const moveToNextScreen = async () => {
        toggleActivityIndicator(true);
        const { data, err } = fromWalletCurrency === "USD"
            ? await prepareUsdToBtc(settlementSendAmount)
            : await prepareBtcToUsd(settlementSendAmount);
        if (data) {
            navigation.navigate("conversionConfirmation", Object.assign(Object.assign({}, data), { fromWalletCurrency }));
        }
        else {
            setErrorMsg(err);
        }
        toggleActivityIndicator(false);
    };
    return (<screen_1.Screen preset="fixed">
      <react_native_1.ScrollView style={styles.scrollViewContainer}>
        <swap_flow_1.SwapWallets fromWalletCurrency={fromWalletCurrency} formattedBtcBalance={formattedBtcBalance} formattedUsdBalance={formattedUsdBalance} canToggleWallet={canToggleWallet} setFromWalletCurrency={setFromWalletCurrency}/>
        <swap_flow_1.ConversionAmountError fromWalletCurrency={fromWalletCurrency} formattedBtcBalance={formattedBtcBalance} formattedUsdBalance={formattedUsdBalance} btcBalance={btcBalance} usdBalance={usdBalance} settlementSendAmount={settlementSendAmount} moneyAmount={moneyAmount} errorMsg={errorMsg} setMoneyAmount={setMoneyAmount} setErrorMsg={setErrorMsg}/>
        <swap_flow_1.PercentageAmount fromWalletCurrency={fromWalletCurrency} setAmountToBalancePercentage={setAmountToBalancePercentage}/>
      </react_native_1.ScrollView>
      <buttons_1.PrimaryBtn label={LL.common.next()} btnStyle={styles.btnStyle} disabled={!isValidAmount || !!errorMsg} onPress={moveToNextScreen}/>
    </screen_1.Screen>);
};
exports.ConversionDetailsScreen = ConversionDetailsScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    scrollViewContainer: {
        margin: 20,
    },
    btnStyle: {
        marginHorizontal: 20,
        marginBottom: 20,
    },
}));
//# sourceMappingURL=conversion-details-screen.js.map