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
// hooks
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const persistent_state_1 = require("@app/store/persistent-state");
// utils
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const InforError = ({ unitOfAccountAmount, minWithdrawableSatoshis, maxWithdrawableSatoshis, amountIsFlexible, setHasError, }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const { formatMoneyAmount } = (0, hooks_1.useDisplayCurrency)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const [errorMsg, setErrorMsg] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        fetchLimits();
    }, [unitOfAccountAmount]);
    const fetchLimits = async () => {
        var _a;
        if (((_a = persistentState.defaultWallet) === null || _a === void 0 ? void 0 : _a.walletCurrency) === "BTC" &&
            persistentState.isAdvanceMode) {
            const limits = await (0, breez_sdk_liquid_1.fetchBreezLightningLimits)();
            if (limits.receive.minSat > unitOfAccountAmount.amount) {
                setHasError(true);
                setErrorMsg(LL.SendBitcoinScreen.minAmountInvoiceError({ amount: limits.receive.minSat }));
            }
            else if (limits.receive.maxSat < unitOfAccountAmount.amount) {
                setHasError(true);
                setErrorMsg(LL.SendBitcoinScreen.maxAmountInvoiceError({ amount: limits.receive.maxSat }));
            }
            else {
                setHasError(false);
                setErrorMsg("");
            }
        }
        else {
            if (convertMoneyAmount) {
                const convertedAmount = convertMoneyAmount(unitOfAccountAmount, "USD");
                if (convertedAmount.amount < 1) {
                    setHasError(true);
                    setErrorMsg(LL.SendBitcoinScreen.minAmountInvoiceError({
                        amount: formatMoneyAmount({
                            moneyAmount: { amount: 1, currency: "USD", currencyCode: "USD" },
                        }),
                    }));
                }
                else {
                    setHasError(false);
                    setErrorMsg("");
                }
            }
        }
    };
    return (<>
      {amountIsFlexible && (<themed_1.Text style={styles.infoText}>
          {LL.RedeemBitcoinScreen.minMaxRange({
                minimumAmount: formatMoneyAmount({
                    moneyAmount: minWithdrawableSatoshis,
                }),
                maximumAmount: formatMoneyAmount({
                    moneyAmount: maxWithdrawableSatoshis,
                }),
            })}
        </themed_1.Text>)}
      {!!errorMsg && <themed_1.Text style={styles.withdrawalErrorText}>{errorMsg}</themed_1.Text>}
    </>);
};
exports.default = InforError;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    infoText: {
        color: colors.grey2,
        fontSize: 14,
        marginTop: 10,
    },
    withdrawalErrorText: {
        color: colors.error,
        fontSize: 14,
        marginTop: 10,
    },
}));
//# sourceMappingURL=InforError.js.map