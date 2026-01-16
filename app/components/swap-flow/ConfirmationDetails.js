"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
// types
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
// hooks
const hooks_1 = require("@app/hooks");
const ConfirmationDetails = ({ fromWallet, toWallet, moneyAmount, totalFee, }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { formatMoneyAmount, displayCurrency } = (0, hooks_1.useDisplayCurrency)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    if (!convertMoneyAmount || !fromWallet || !toWallet)
        return;
    const fromAmount = convertMoneyAmount(moneyAmount, fromWallet === null || fromWallet === void 0 ? void 0 : fromWallet.walletCurrency);
    const toAmount = convertMoneyAmount(moneyAmount, toWallet === null || toWallet === void 0 ? void 0 : toWallet.walletCurrency);
    const convertingAmount = convertMoneyAmount(moneyAmount, amounts_1.DisplayCurrency);
    const rate = convertMoneyAmount((0, amounts_1.toBtcMoneyAmount)(Number(hooks_1.SATS_PER_BTC)), amounts_1.DisplayCurrency);
    const fee = convertMoneyAmount((0, amounts_1.toBtcMoneyAmount)(totalFee), amounts_1.DisplayCurrency);
    return (<react_native_1.View style={styles.conversionInfoCard}>
      <react_native_1.View style={styles.conversionInfoField}>
        <themed_1.Text style={styles.conversionInfoFieldTitle}>
          {LL.ConversionConfirmationScreen.sendingAccount()}
        </themed_1.Text>
        <themed_1.Text style={styles.conversionInfoFieldValue}>
          {(toWallet === null || toWallet === void 0 ? void 0 : toWallet.walletCurrency) === generated_1.WalletCurrency.Btc
            ? LL.common.usdAccount()
            : LL.common.btcAccount()}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.conversionInfoField}>
        <themed_1.Text style={styles.conversionInfoFieldTitle}>
          {LL.ConversionConfirmationScreen.receivingAccount()}
        </themed_1.Text>
        <themed_1.Text style={styles.conversionInfoFieldValue}>
          {(toWallet === null || toWallet === void 0 ? void 0 : toWallet.walletCurrency) === generated_1.WalletCurrency.Btc
            ? LL.common.btcAccount()
            : LL.common.usdAccount()}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.conversionInfoField}>
        <themed_1.Text style={styles.conversionInfoFieldTitle}>
          {LL.ConversionConfirmationScreen.youreConverting()}
        </themed_1.Text>
        <themed_1.Text style={styles.conversionInfoFieldValue}>
          {formatMoneyAmount({ moneyAmount: fromAmount })}
          {displayCurrency !== (fromWallet === null || fromWallet === void 0 ? void 0 : fromWallet.walletCurrency) &&
            displayCurrency !== (toWallet === null || toWallet === void 0 ? void 0 : toWallet.walletCurrency)
            ? ` (${formatMoneyAmount({
                moneyAmount: convertingAmount,
            })})`
            : ""}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.conversionInfoField}>
        <themed_1.Text style={styles.conversionInfoFieldTitle}>{LL.common.to()}</themed_1.Text>
        <themed_1.Text style={styles.conversionInfoFieldValue}>
          {formatMoneyAmount({ moneyAmount: toAmount, isApproximate: true })}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.conversionInfoField}>
        <themed_1.Text style={styles.conversionInfoFieldTitle}>
          {LL.ConversionConfirmationScreen.conversionFee()}
        </themed_1.Text>
        <themed_1.Text style={styles.conversionInfoFieldValue}>
          {formatMoneyAmount({
            moneyAmount: (0, amounts_1.toBtcMoneyAmount)(totalFee),
        })}
          {` (${formatMoneyAmount({ moneyAmount: fee })})`}
        </themed_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.conversionInfoField}>
        <themed_1.Text style={styles.conversionInfoFieldTitle}>{LL.common.rate()}</themed_1.Text>
        <themed_1.Text style={styles.conversionInfoFieldValue}>
          {formatMoneyAmount({
            moneyAmount: rate,
            isApproximate: true,
        })}{" "}
          / 1 BTC
        </themed_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = ConfirmationDetails;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    conversionInfoCard: {
        margin: 20,
        backgroundColor: colors.grey5,
        borderRadius: 10,
        padding: 20,
    },
    conversionInfoField: {
        marginBottom: 20,
    },
    conversionInfoFieldTitle: { color: colors.grey1 },
    conversionInfoFieldValue: {
        color: colors.grey0,
        fontWeight: "bold",
        fontSize: 18,
    },
}));
//# sourceMappingURL=ConfirmationDetails.js.map