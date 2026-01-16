"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const moment_1 = __importDefault(require("moment"));
// components
const hideable_area_1 = __importDefault(require("../hideable-area/hideable-area"));
// hooks
const hooks_1 = require("@app/hooks");
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const RecentActivity = ({ transactions, convertMoneyAmount }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { formatMoneyAmount } = (0, hooks_1.useDisplayCurrency)();
    const { data: { hideBalance = false } = {} } = (0, generated_1.useHideBalanceQuery)();
    const renderItem = (item) => {
        const sats = parseInt(item.sats.replaceAll(",", ""), 10);
        const convertedAmount = convertMoneyAmount((0, amounts_1.toBtcMoneyAmount)(sats), amounts_1.DisplayCurrency);
        const formattedAmount = formatMoneyAmount({
            moneyAmount: convertedAmount,
            noSymbol: false,
        });
        return (<react_native_1.View style={styles.row} key={item.date}>
        <themed_1.Icon name={sats < 0 ? "arrow-up" : "arrow-down"} size={20} type="ionicon" color={sats < 0 ? "#B31B1B" : "#007856"}/>
        <themed_1.Text type="bl" style={styles.date}>
          {(0, moment_1.default)(item.date).format("MMM Do, h:mm a")}
        </themed_1.Text>
        <react_native_1.View style={styles.column}>
          <hideable_area_1.default isContentVisible={hideBalance}>
            <themed_1.Text type="bl">{formattedAmount}</themed_1.Text>
            <themed_1.Text type="caption" color={colors.placeholder}>{`${item.sats} SATS`}</themed_1.Text>
          </hideable_area_1.default>
        </react_native_1.View>
      </react_native_1.View>);
    };
    return (<react_native_1.View style={styles.container}>
      <themed_1.Text type="bl" bold style={styles.title}>
        Recent activity
      </themed_1.Text>
      {transactions === null || transactions === void 0 ? void 0 : transactions.map((el) => renderItem(el))}
    </react_native_1.View>);
};
exports.default = RecentActivity;
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        flex: 1,
        paddingHorizontal: 20,
    },
    title: {
        paddingVertical: 10,
    },
    row: {
        minHeight: 47,
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 5,
    },
    date: {
        marginLeft: 10,
    },
    column: {
        flex: 1,
        alignItems: "flex-end",
    },
}));
//# sourceMappingURL=RecentActivity.js.map