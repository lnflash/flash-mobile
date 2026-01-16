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
exports.ReconciliationReport = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// components
const screen_1 = require("../../components/screen");
const date_range_display_1 = require("../../components/date-range-display");
// hooks
const hooks_1 = require("@app/hooks");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
// gql
const generated_1 = require("@app/graphql/generated");
// types
const amounts_1 = require("@app/types/amounts");
// utils
const transaction_filters_1 = require("@app/utils/transaction-filters");
const pdfExport_1 = require("../../utils/pdfExport");
const ReconciliationReport = ({ route }) => {
    var _a, _b, _c, _d;
    const { from, to } = route.params;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = useStyles();
    const [balance, setBalance] = (0, react_1.useState)("$0.00");
    const [balanceInDisplayCurrency, setBalanceInDisplayCurrency] = (0, react_1.useState)("$0.00");
    const [selectedDirection, setSelectedDirection] = (0, react_1.useState)();
    const { formatMoneyAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { data, error, loading } = (0, generated_1.useTransactionListForDefaultAccountQuery)({
        skip: !isAuthed,
        fetchPolicy: "network-only",
        nextFetchPolicy: "cache-and-network",
        variables: { first: 100 },
    });
    (0, react_1.useEffect)(() => {
        var _a, _b, _c, _d;
        if (data) {
            const transactions = ((_d = (_c = (_b = (_a = data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.transactions) === null || _c === void 0 ? void 0 : _c.edges) === null || _d === void 0 ? void 0 : _d.map((edge) => edge.node)) || [];
            const filteredTransactions = (0, transaction_filters_1.filterTransactionsByDirection)((0, transaction_filters_1.filterTransactionsByDate)(transactions, from, to), selectedDirection);
            const totalAmount = (0, transaction_filters_1.calculateTotalAmount)(filteredTransactions);
            setBalance(formatMoneyAmount({
                moneyAmount: (0, amounts_1.toUsdMoneyAmount)(totalAmount * 100),
                noSymbol: false,
            }));
            const convertedBalance = (0, transaction_filters_1.convertToDisplayCurrency)(totalAmount, convertMoneyAmount);
            if (convertedBalance) {
                setBalanceInDisplayCurrency(formatMoneyAmount({
                    moneyAmount: convertedBalance,
                    noSymbol: false,
                }));
            }
        }
    }, [data, convertMoneyAmount, formatMoneyAmount, from, to, selectedDirection]);
    if (loading)
        return <react_native_1.Text>{LL.common.soon()}</react_native_1.Text>;
    if (error)
        return <react_native_1.Text>{LL.common.error()}</react_native_1.Text>;
    const filteredTransactionsByDirection = (0, transaction_filters_1.filterTransactionsByDirection)((0, transaction_filters_1.filterTransactionsByDate)(((_d = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.transactions) === null || _c === void 0 ? void 0 : _c.edges) === null || _d === void 0 ? void 0 : _d.map((edge) => edge.node)) || [], from, to), selectedDirection);
    const orderedTransactions = (0, transaction_filters_1.orderAndConvertTransactionsByDate)(filteredTransactionsByDirection, convertMoneyAmount);
    return (<screen_1.Screen>
      <react_native_1.View style={styles.container}>
        <date_range_display_1.DateRangeDisplay from={from} to={to}/>
        <react_native_1.Text style={styles.totalText}>
          {LL.reports.total()}:{"\nUSD"} {balance}{" "}
          {balanceInDisplayCurrency !== balance && (<react_native_1.Text>{`( ~${balanceInDisplayCurrency} )`}</react_native_1.Text>)}
        </react_native_1.Text>
        <react_native_1.View style={styles.filterContainer}>
          <themed_1.Button title="All" type={selectedDirection === null ? "solid" : "outline"} onPress={() => setSelectedDirection(undefined)}/>
          <themed_1.Button title="Received" type={selectedDirection === generated_1.TxDirection.Receive ? "solid" : "outline"} onPress={() => setSelectedDirection(generated_1.TxDirection.Receive)}/>
          <themed_1.Button title="Sent" type={selectedDirection === generated_1.TxDirection.Send ? "solid" : "outline"} onPress={() => setSelectedDirection(generated_1.TxDirection.Send)}/>
        </react_native_1.View>
        <react_native_1.ScrollView style={styles.scrollView}>
          {orderedTransactions.map((tx) => (<react_native_1.View key={tx.id} style={styles.transactionRow}>
              <react_native_1.View style={styles.transactionDetailsRow}>
                <react_native_1.Text style={styles.dateText}>{tx.displayDate}</react_native_1.Text>
                <react_native_1.Text style={styles.txDirectionText}>{tx.direction}</react_native_1.Text>
                <react_native_1.Text style={styles.amountText}>{tx.settlementDisplayAmount}</react_native_1.Text>
              </react_native_1.View>
            </react_native_1.View>))}
        </react_native_1.ScrollView>
        <themed_1.Button style={styles.button} onPress={() => (0, pdfExport_1.exportTransactionsToHTML)({
            transactions: orderedTransactions,
            from,
            to,
            totalAmount: balance,
            balanceInDisplayCurrency,
            currencySymbol: "USD",
        })}>
          Export as HTML
        </themed_1.Button>
        <react_native_1.View style={styles.spacer}/>
        <themed_1.Button style={styles.button} onPress={() => (0, pdfExport_1.exportTransactionsToPDF)({
            transactions: orderedTransactions,
            from,
            to,
            totalAmount: balance,
            balanceInDisplayCurrency,
            currencySymbol: "USD",
        })}>
          Export as PDF
        </themed_1.Button>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.ReconciliationReport = ReconciliationReport;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: colors.background,
    },
    filterContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    totalText: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 16,
        textAlign: "center",
        color: colors.black,
    },
    scrollView: {
        marginBottom: 16,
    },
    transactionRow: {
        paddingVertical: 8,
        borderTopWidth: 2,
        borderTopColor: colors.grey4,
    },
    transactionDetailsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    dateText: {
        fontSize: 14,
        color: colors.black,
        flex: 1,
    },
    txDirectionText: {
        fontSize: 14,
        color: colors.black,
        textAlign: "center",
        flex: 1,
    },
    amountText: {
        fontSize: 14,
        color: colors.black,
        textAlign: "right",
        flex: 1,
    },
    button: {
        marginVertical: "auto",
        marginHorizontal: "auto",
        paddingHorizontal: 40,
    },
    spacer: {
        height: 3,
    },
}));
//# sourceMappingURL=reconciliation.js.map