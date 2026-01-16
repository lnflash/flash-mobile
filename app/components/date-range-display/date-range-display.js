"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateRangeDisplay = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// utils
const transaction_filters_1 = require("@app/utils/transaction-filters");
const DateRangeDisplay = ({ from, to, }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<react_native_1.View style={styles.dateContainer}>
      <react_native_1.View style={styles.dateColumn}>
        <react_native_1.Text style={styles.dateLabel}>{LL.reports.fromDate()}</react_native_1.Text>
        <react_native_1.Text style={styles.dateValue}>{(0, transaction_filters_1.formatDate)(from)}</react_native_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.dateColumn}>
        <react_native_1.Text style={styles.dateLabel}>{LL.reports.toDate()}</react_native_1.Text>
        <react_native_1.Text style={styles.dateValue}>{(0, transaction_filters_1.formatDate)(to)}</react_native_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.DateRangeDisplay = DateRangeDisplay;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    dateContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 30,
    },
    dateColumn: {
        flex: 1,
        alignItems: "center",
        borderWidth: 2,
        borderColor: colors.grey4,
        padding: 10,
        borderRadius: 10,
        marginHorizontal: 10,
    },
    dateLabel: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 4,
        color: colors.black,
    },
    dateValue: {
        fontSize: 12,
        color: colors.black,
    },
}));
//# sourceMappingURL=date-range-display.js.map