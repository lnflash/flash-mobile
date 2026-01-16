"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const hooks_1 = require("@app/hooks");
// types
const amounts_1 = require("@app/types/amounts");
const accountLimitsPeriodInHrs = {
    DAILY: "24",
    WEEKLY: "168",
};
const TransactionLimitsPeriod = ({ totalLimit, remainingLimit, interval, }) => {
    const { formatMoneyAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    if (!convertMoneyAmount) {
        return null;
    }
    const usdTotalLimitMoneyAmount = convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(totalLimit), amounts_1.DisplayCurrency);
    const usdRemainingLimitMoneyAmount = typeof remainingLimit === "number"
        ? convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(remainingLimit), amounts_1.DisplayCurrency)
        : null;
    const remainingLimitText = usdRemainingLimitMoneyAmount
        ? `${formatMoneyAmount({
            moneyAmount: usdRemainingLimitMoneyAmount,
        })} ${LL.TransactionLimitsScreen.remaining().toLocaleLowerCase()}`
        : "";
    const getLimitDuration = (period) => {
        const interval = (period / (60 * 60)).toString();
        switch (interval) {
            case accountLimitsPeriodInHrs.DAILY:
                return LL.TransactionLimitsScreen.perDay();
            case accountLimitsPeriodInHrs.WEEKLY:
                return LL.TransactionLimitsScreen.perWeek();
            default:
                return null;
        }
    };
    const totalLimitText = `${formatMoneyAmount({
        moneyAmount: usdTotalLimitMoneyAmount,
    })} ${interval && getLimitDuration(interval)}`;
    return (<react_native_1.View>
      <react_native_1.View style={styles.contentTextBox}>
        <themed_1.Text adjustsFontSizeToFit style={styles.valueRemaining}>
          {remainingLimitText}
        </themed_1.Text>
        <themed_1.Text adjustsFontSizeToFit style={styles.valueTotal}>
          {totalLimitText}
        </themed_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = TransactionLimitsPeriod;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    contentTextBox: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 5,
    },
    valueRemaining: {
        fontWeight: "bold",
        color: colors.green,
        maxWidth: "50%",
    },
    valueTotal: {
        fontWeight: "bold",
        color: colors.grey3,
        maxWidth: "50%",
    },
}));
//# sourceMappingURL=TransactionLimitsPeriod.js.map