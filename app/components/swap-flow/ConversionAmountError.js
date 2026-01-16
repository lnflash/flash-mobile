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
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const amount_input_1 = require("../amount-input");
// types
const amounts_1 = require("@app/types/amounts");
// hooks
const hooks_1 = require("@app/hooks");
// breez-sdk
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const ConversionAmountError = ({ fromWalletCurrency, formattedBtcBalance, formattedUsdBalance, btcBalance, usdBalance, settlementSendAmount, moneyAmount, errorMsg, setMoneyAmount, setErrorMsg, }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { formatDisplayAndWalletAmount } = (0, hooks_1.useDisplayCurrency)();
    const [minAmount, setMinAmount] = (0, react_1.useState)();
    const [maxAmount, setMaxAmount] = (0, react_1.useState)();
    // @ts-ignore: Unreachable code error
    const convertedSettlementSendAmount = convertMoneyAmount(settlementSendAmount, "BTC");
    (0, react_1.useEffect)(() => {
        fetchMinMaxAmount();
    }, [fromWalletCurrency]);
    const fetchMinMaxAmount = async () => {
        const limits = await (0, breez_sdk_liquid_1.fetchBreezLightningLimits)();
        setMinAmount({
            amount: fromWalletCurrency === "BTC" ? limits === null || limits === void 0 ? void 0 : limits.send.minSat : limits.receive.minSat,
            currency: "BTC",
            currencyCode: "SAT",
        });
        setMaxAmount({
            amount: fromWalletCurrency === "BTC" ? limits === null || limits === void 0 ? void 0 : limits.send.maxSat : limits.receive.maxSat,
            currency: "BTC",
            currencyCode: "SAT",
        });
    };
    (0, react_1.useEffect)(() => {
        checkErrorMessage();
    }, [
        fromWalletCurrency,
        settlementSendAmount.amount,
        btcBalance.amount,
        usdBalance.amount,
        minAmount,
        maxAmount,
    ]);
    const checkErrorMessage = () => {
        if (!convertMoneyAmount)
            return null;
        let amountFieldError = undefined;
        if ((0, amounts_1.lessThan)({
            value: fromWalletCurrency === "BTC" ? btcBalance : usdBalance,
            lessThan: settlementSendAmount,
        })) {
            amountFieldError = LL.SendBitcoinScreen.amountExceed({
                balance: fromWalletCurrency === "BTC" ? formattedBtcBalance : formattedUsdBalance,
            });
        }
        else if (minAmount &&
            (0, amounts_1.isNonZeroMoneyAmount)(convertedSettlementSendAmount) &&
            (0, amounts_1.lessThan)({
                value: convertedSettlementSendAmount,
                lessThan: minAmount,
            })) {
            const convertedBTCBalance = convertMoneyAmount(minAmount, amounts_1.DisplayCurrency);
            amountFieldError = LL.SendBitcoinScreen.minAmountConvertError({
                amount: formatDisplayAndWalletAmount({
                    displayAmount: convertedBTCBalance,
                    walletAmount: minAmount,
                }),
            });
        }
        else if (maxAmount &&
            (0, amounts_1.isNonZeroMoneyAmount)(convertedSettlementSendAmount) &&
            (0, amounts_1.greaterThan)({
                value: convertedSettlementSendAmount,
                greaterThan: maxAmount,
            })) {
            const convertedBTCBalance = convertMoneyAmount(maxAmount, amounts_1.DisplayCurrency);
            amountFieldError = LL.SendBitcoinScreen.maxAmountConvertError({
                amount: formatDisplayAndWalletAmount({
                    displayAmount: convertedBTCBalance,
                    walletAmount: maxAmount,
                }),
            });
        }
        setErrorMsg(amountFieldError);
    };
    return (<react_native_1.View style={styles.fieldContainer}>
      <amount_input_1.AmountInput unitOfAccountAmount={moneyAmount} walletCurrency={fromWalletCurrency} setAmount={setMoneyAmount} convertMoneyAmount={convertMoneyAmount} minAmount={minAmount} maxAmount={maxAmount} title="Convert"/>
      {errorMsg && (<themed_1.Text style={styles.errMsg} color={colors.error}>
          {errorMsg}
        </themed_1.Text>)}
    </react_native_1.View>);
};
exports.default = ConversionAmountError;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    fieldContainer: {
        marginBottom: 20,
    },
    errMsg: {
        marginTop: 10,
    },
}));
//# sourceMappingURL=ConversionAmountError.js.map