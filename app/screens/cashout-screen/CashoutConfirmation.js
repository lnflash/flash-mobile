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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const themed_2 = require("@rneui/themed");
const moment_1 = __importDefault(require("moment"));
// components
const screen_1 = require("@app/components/screen");
const buttons_1 = require("@app/components/buttons");
const cashout_flow_1 = require("@app/components/cashout-flow");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
const generated_1 = require("@app/graphql/generated");
//utils
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const amounts_1 = require("@app/types/amounts");
const CashoutConfirmation = ({ navigation, route }) => {
    var _a, _b, _c, _d;
    const styles = useStyles();
    const { colors } = (0, themed_2.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { formatMoneyAmount } = (0, hooks_1.useDisplayCurrency)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const [errorMsg, setErrorMsg] = (0, react_1.useState)();
    const [initiateCashout] = (0, generated_1.useInitiateCashoutMutation)();
    const { data } = (0, generated_1.useCashoutScreenQuery)({
        fetchPolicy: "cache-first",
        returnPartialData: true,
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const usdBalance = (0, amounts_1.toUsdMoneyAmount)((_c = usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance) !== null && _c !== void 0 ? _c : NaN);
    const { walletId, offerId, expiresAt, exchangeRate, send, receiveUsd, receiveJmd, flashFee, } = (_d = route.params) === null || _d === void 0 ? void 0 : _d.offer;
    const onConfirm = async () => {
        var _a, _b;
        toggleActivityIndicator(true);
        const res = await initiateCashout({ variables: { input: { walletId, offerId } } });
        console.log("RESPONSE>>>>>>>>>>>>", res);
        if ((_a = res.data) === null || _a === void 0 ? void 0 : _a.initiateCashout.success) {
            navigation.navigate("CashoutSuccess");
        }
        else {
            setErrorMsg((_b = res.data) === null || _b === void 0 ? void 0 : _b.initiateCashout.errors[0].message);
        }
        toggleActivityIndicator(false);
    };
    const formattedSendAmount = formatMoneyAmount({
        moneyAmount: (0, amounts_1.toUsdMoneyAmount)(send !== null && send !== void 0 ? send : NaN),
    });
    const formattedReceiveUsdAmount = formatMoneyAmount({
        moneyAmount: (0, amounts_1.toUsdMoneyAmount)(receiveUsd !== null && receiveUsd !== void 0 ? receiveUsd : NaN),
    });
    const formattedFeeAmount = formatMoneyAmount({
        moneyAmount: (0, amounts_1.toUsdMoneyAmount)(flashFee !== null && flashFee !== void 0 ? flashFee : NaN),
    });
    return (<screen_1.Screen>
      <react_native_1.ScrollView style={{ padding: 20 }}>
        <themed_2.Text type="caption" color={colors.placeholder} style={styles.valid}>
          {LL.Cashout.valid({ time: (0, moment_1.default)(expiresAt).fromNow(true) })}
        </themed_2.Text>
        <cashout_flow_1.CashoutFromWallet usdBalance={usdBalance}/>
        <cashout_flow_1.CashoutCard title={LL.Cashout.exchangeRate()} detail={`$1/J$${exchangeRate}`}/>
        <cashout_flow_1.CashoutCard title={LL.Cashout.sendAmount()} detail={formattedSendAmount}/>
        <cashout_flow_1.CashoutCard title={LL.Cashout.receiveAmount()} detail={`${formattedReceiveUsdAmount} (J$${receiveJmd})`}/>
        <cashout_flow_1.CashoutCard title={LL.Cashout.fee()} detail={formattedFeeAmount}/>
        {!!errorMsg && (<themed_2.Text type="bm" color={colors.red}>
            {errorMsg}
          </themed_2.Text>)}
      </react_native_1.ScrollView>
      <buttons_1.PrimaryBtn label={LL.common.confirm()} btnStyle={styles.buttonContainer} onPress={onConfirm}/>
    </screen_1.Screen>);
};
exports.default = CashoutConfirmation;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    valid: {
        alignSelf: "center",
        marginBottom: 10,
    },
    buttonContainer: {
        marginHorizontal: 20,
        marginBottom: 20,
    },
}));
//# sourceMappingURL=CashoutConfirmation.js.map