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
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// hooks
const use_fee_1 = __importDefault(require("@app/screens/send-bitcoin-screen/use-fee"));
const use_display_currency_1 = require("@app/hooks/use-display-currency");
// types
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
// utils
const testProps_1 = require("@app/utils/testProps");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
// assets
const cash_svg_1 = __importDefault(require("@app/assets/icons/cash.svg"));
const bitcoin_svg_1 = __importDefault(require("@app/assets/icons/bitcoin.svg"));
const ConfirmationWalletFee = ({ flashUserAddress, paymentDetail, btcWalletText, usdWalletText, feeRateSatPerVbyte, fee, setFee, setPaymentError, }) => {
    const { sendingWalletDescriptor, getFee, settlementAmount, paymentType } = paymentDetail;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const getLightningFee = (0, use_fee_1.default)(getFee ? getFee : null);
    const { formatDisplayAndWalletAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    (0, react_1.useEffect)(() => {
        getSendingFee();
    }, [
        getLightningFee,
        paymentType,
        sendingWalletDescriptor.currency,
        settlementAmount.amount,
        feeRateSatPerVbyte,
    ]);
    const getSendingFee = async () => {
        setFee({ status: "loading", amount: undefined });
        if (sendingWalletDescriptor.currency === "USD") {
            setFee(getLightningFee);
        }
        else {
            const { fee, err } = await (0, breez_sdk_liquid_1.fetchBreezFee)(paymentType, !!flashUserAddress ? flashUserAddress : paymentDetail.destination, settlementAmount.amount, feeRateSatPerVbyte, paymentDetail.isSendingMax);
            if (fee !== null) {
                setFee({
                    status: "set",
                    amount: { amount: fee, currency: "BTC", currencyCode: "BTC" },
                });
            }
            else if (fee === "null" && err === "null") {
                setFee({
                    status: "unset",
                    amount: undefined,
                });
            }
            else {
                setFee({
                    status: "error",
                    amount: undefined,
                });
                setPaymentError(`Failed to fetch the fee. ${err} (amount + fee)`);
            }
        }
    };
    let feeDisplayText = "";
    if (fee.amount) {
        const feeDisplayAmount = paymentDetail.convertMoneyAmount(fee.amount, amounts_1.DisplayCurrency);
        feeDisplayText = formatDisplayAndWalletAmount({
            displayAmount: feeDisplayAmount,
            walletAmount: fee.amount,
        });
    }
    else {
        feeDisplayText = "Unable to calculate fee";
    }
    const CurrencyIcon = sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc ? bitcoin_svg_1.default : cash_svg_1.default;
    return (<>
      <react_native_1.View style={styles.fieldContainer}>
        <themed_1.Text style={styles.fieldTitleText}>{LL.common.from()}</themed_1.Text>
        <react_native_1.View style={styles.fieldBackground}>
          <react_native_1.View style={styles.walletSelectorTypeContainer}>
            <CurrencyIcon />
          </react_native_1.View>
          <react_native_1.View style={styles.walletSelectorInfoContainer}>
            <react_native_1.View style={styles.walletSelectorTypeTextContainer}>
              {sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc ? (<themed_1.Text style={styles.walletCurrencyText}>{LL.common.btcAccount()}</themed_1.Text>) : (<themed_1.Text style={styles.walletCurrencyText}>{LL.common.usdAccount()}</themed_1.Text>)}
            </react_native_1.View>
            <react_native_1.View style={styles.walletSelectorBalanceContainer}>
              {sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc ? (<themed_1.Text>{btcWalletText}</themed_1.Text>) : (<themed_1.Text>{usdWalletText}</themed_1.Text>)}
            </react_native_1.View>
            <react_native_1.View />
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>
      <react_native_1.View style={styles.fieldContainer}>
        <themed_1.Text style={styles.fieldTitleText}>
          {LL.SendBitcoinConfirmationScreen.feeLabel()}
        </themed_1.Text>
        <react_native_1.View style={styles.fieldBackground}>
          {fee.status === "loading" && <react_native_1.ActivityIndicator />}
          {fee.status === "set" && (<themed_1.Text {...(0, testProps_1.testProps)("Successful Fee")}>{feeDisplayText}</themed_1.Text>)}
          {fee.status === "error" && Boolean(fee.amount) && (<themed_1.Text>{feeDisplayText} *</themed_1.Text>)}
          {fee.status === "error" && !fee.amount && (<themed_1.Text>{LL.SendBitcoinConfirmationScreen.feeError()}</themed_1.Text>)}
          {fee.status === "unset" && !fee.amount && (<themed_1.Text>{LL.SendBitcoinConfirmationScreen.breezFeeText()}</themed_1.Text>)}
        </react_native_1.View>
        {fee.status === "error" && Boolean(fee.amount) && (<themed_1.Text style={styles.maxFeeWarningText}>
            {"*" + LL.SendBitcoinConfirmationScreen.maxFeeSelected()}
          </themed_1.Text>)}
      </react_native_1.View>
    </>);
};
exports.default = ConfirmationWalletFee;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    fieldContainer: {
        marginBottom: 12,
    },
    fieldBackground: {
        flexDirection: "row",
        borderStyle: "solid",
        overflow: "hidden",
        backgroundColor: colors.grey5,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignItems: "center",
        height: 60,
    },
    fieldTitleText: {
        fontWeight: "bold",
        marginBottom: 4,
    },
    walletSelectorTypeContainer: {
        marginRight: 20,
    },
    walletSelectorInfoContainer: {
        flex: 1,
        flexDirection: "column",
    },
    walletSelectorTypeTextContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    walletCurrencyText: {
        fontWeight: "bold",
        fontSize: 18,
    },
    walletSelectorBalanceContainer: {
        flex: 1,
        flexDirection: "row",
    },
    maxFeeWarningText: {
        color: colors.warning,
        fontWeight: "bold",
    },
}));
//# sourceMappingURL=ConfirmationWalletFee.js.map