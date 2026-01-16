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
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
// components
const screen_1 = require("@app/components/screen");
const amount_input_1 = require("@app/components/amount-input");
const cashout_flow_1 = require("@app/components/cashout-flow");
// hooks
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
// utils
const amounts_1 = require("@app/types/amounts");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const react_native_1 = require("react-native");
const buttons_1 = require("@app/components/buttons");
const CashoutDetails = ({ navigation }) => {
    var _a, _b, _c;
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { zeroDisplayAmount } = (0, hooks_1.useDisplayCurrency)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const [errorMsg, setErrorMsg] = (0, react_1.useState)();
    const [moneyAmount, setMoneyAmount] = (0, react_1.useState)(zeroDisplayAmount);
    const [requestCashout] = (0, generated_1.useRequestCashoutMutation)();
    const { data } = (0, generated_1.useCashoutScreenQuery)({
        fetchPolicy: "cache-first",
        returnPartialData: true,
    });
    if (!convertMoneyAmount) {
        return;
    }
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const usdBalance = (0, amounts_1.toUsdMoneyAmount)((_c = usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance) !== null && _c !== void 0 ? _c : NaN);
    const settlementSendAmount = convertMoneyAmount(moneyAmount, "USD");
    const isValidAmount = settlementSendAmount.amount > 0 && settlementSendAmount.amount <= usdBalance.amount;
    const onNext = async () => {
        var _a, _b, _c;
        if (usdWallet) {
            toggleActivityIndicator(true);
            const res = await requestCashout({
                variables: {
                    input: { walletId: usdWallet.id, usdAmount: settlementSendAmount.amount },
                },
            });
            console.log("Response: ", (_a = res.data) === null || _a === void 0 ? void 0 : _a.requestCashout);
            if ((_b = res.data) === null || _b === void 0 ? void 0 : _b.requestCashout.offer) {
                navigation.navigate("CashoutConfirmation", {
                    offer: res.data.requestCashout.offer,
                });
            }
            else {
                setErrorMsg((_c = res.data) === null || _c === void 0 ? void 0 : _c.requestCashout.errors[0].message);
            }
            toggleActivityIndicator(false);
        }
    };
    const setAmountToBalancePercentage = (percentage) => {
        setMoneyAmount((0, amounts_1.toWalletAmount)({
            amount: Math.round((usdBalance.amount * percentage) / 100),
            currency: "USD",
        }));
    };
    return (<screen_1.Screen>
      <react_native_gesture_handler_1.ScrollView style={styles.scrollViewContainer}>
        <cashout_flow_1.CashoutFromWallet usdBalance={usdBalance}/>
        <react_native_1.View>
          <themed_1.Text type="bl" bold style={{ marginBottom: 5 }}>
            {LL.SendBitcoinScreen.amount()}
          </themed_1.Text>
          <amount_input_1.AmountInput unitOfAccountAmount={moneyAmount} walletCurrency={"USD"} setAmount={setMoneyAmount} convertMoneyAmount={convertMoneyAmount} minAmount={{ amount: 1, currency: "USD", currencyCode: "USD" }} maxAmount={{
            amount: usdBalance.amount,
            currency: "USD",
            currencyCode: "USD",
        }}/>
        </react_native_1.View>
        <cashout_flow_1.CashoutPercentage setAmountToBalancePercentage={setAmountToBalancePercentage}/>
        {!!errorMsg && (<themed_1.Text type="bm" color={colors.red}>
            {errorMsg}
          </themed_1.Text>)}
      </react_native_gesture_handler_1.ScrollView>
      <buttons_1.PrimaryBtn label={LL.common.next()} btnStyle={styles.buttonContainer} disabled={!isValidAmount} onPress={onNext}/>
    </screen_1.Screen>);
};
exports.default = CashoutDetails;
const useStyles = (0, themed_1.makeStyles)(() => ({
    scrollViewContainer: {
        flex: 1,
        flexDirection: "column",
        margin: 20,
    },
    buttonContainer: {
        marginHorizontal: 20,
        marginBottom: 20,
    },
}));
//# sourceMappingURL=CashoutDetails.js.map