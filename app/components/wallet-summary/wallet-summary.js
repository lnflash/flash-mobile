"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletSummary = void 0;
const generated_1 = require("@app/graphql/generated");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const currency_tag_1 = require("../currency-tag");
const themed_1 = require("@rneui/themed");
const amountTypeToSymbol = {
    RECEIVE: "+",
    SEND: "-",
};
// TODO: this code should be refactored
// it's just used in transaction details
const WalletSummary = ({ settlementAmount, txDisplayAmount, txDisplayCurrency, amountType, }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { formatMoneyAmount, formatCurrency } = (0, use_display_currency_1.useDisplayCurrency)();
    const walletName = settlementAmount.currency === generated_1.WalletCurrency.Btc
        ? LL.common.btcAccount()
        : LL.common.usdAccount();
    const formattedDisplayAmount = formatCurrency({
        amountInMajorUnits: txDisplayAmount,
        currency: txDisplayCurrency,
        withSign: false,
        currencyCode: txDisplayCurrency,
    });
    const secondaryAmount = settlementAmount.currency === txDisplayCurrency
        ? undefined
        : formatMoneyAmount({ moneyAmount: settlementAmount });
    const amounts = secondaryAmount
        ? formattedDisplayAmount + ` (${secondaryAmount})`
        : formattedDisplayAmount;
    return (<react_native_1.View style={styles.walletSummaryContainer}>
      <react_native_1.View style={styles.currencyTagContainer}>
        <currency_tag_1.CurrencyTag walletCurrency={settlementAmount.currency}/>
      </react_native_1.View>
      <react_native_1.View style={styles.amountsContainer}>
        <themed_1.Text type={"p2"}>{walletName}</themed_1.Text>
        <themed_1.Text>
          {amountTypeToSymbol[amountType]}
          {amounts}
        </themed_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.WalletSummary = WalletSummary;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    walletSummaryContainer: {
        backgroundColor: colors.grey5,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 10,
    },
    amountsContainer: {
        margin: 8,
    },
    currencyTagContainer: {
        margin: 8,
    },
}));
//# sourceMappingURL=wallet-summary.js.map