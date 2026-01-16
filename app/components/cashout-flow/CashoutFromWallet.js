"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// assets
const cash_svg_1 = __importDefault(require("@app/assets/icons/cash.svg"));
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
// types
const amounts_1 = require("@app/types/amounts");
const CashoutFromWallet = ({ usdBalance }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { formatDisplayAndWalletAmount } = (0, hooks_1.useDisplayCurrency)();
    if (!convertMoneyAmount)
        return;
    const convertedUsdBalance = convertMoneyAmount(usdBalance, amounts_1.DisplayCurrency);
    const formattedUsdBalance = formatDisplayAndWalletAmount({
        displayAmount: convertedUsdBalance,
        walletAmount: usdBalance,
    });
    return (<react_native_1.View>
      <themed_1.Text type="bl" bold>
        {LL.common.from()}
      </themed_1.Text>
      <react_native_1.View style={styles.wallet}>
        <cash_svg_1.default />
        <react_native_1.View style={styles.details}>
          <themed_1.Text type="h01" bold>
            {LL.common.usdAccount()}
          </themed_1.Text>
          <themed_1.Text type="bl">{formattedUsdBalance}</themed_1.Text>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = CashoutFromWallet;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    wallet: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 10,
        marginTop: 5,
        marginBottom: 15,
        padding: 15,
        backgroundColor: colors.grey5,
    },
    details: {
        marginLeft: 10,
    },
}));
//# sourceMappingURL=CashoutFromWallet.js.map