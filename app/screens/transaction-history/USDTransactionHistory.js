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
exports.USDTransactionHistory = void 0;
const react_1 = __importStar(require("react"));
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// components
const screen_1 = require("@app/components/screen");
const transaction_item_1 = require("../../components/transaction-item");
const ActivityIndicatorContext_1 = require("@app/contexts/ActivityIndicatorContext");
// graphql
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const transactions_1 = require("@app/graphql/transactions");
// utils
const toast_1 = require("../../utils/toast");
const USDTransactionHistory = () => {
    var _a, _b;
    const styles = useStyles();
    const { LL, locale } = (0, i18n_react_1.useI18nContext)();
    const { data, error, fetchMore, refetch, loading } = (0, generated_1.useTransactionListForDefaultAccountQuery)({
        fetchPolicy: "cache-and-network",
        skip: !(0, is_authed_context_1.useIsAuthed)(),
    });
    const transactions = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.transactions;
    const sections = (0, react_1.useMemo)(() => {
        var _a, _b;
        return (0, transactions_1.groupTransactionsByDate)({
            txs: (_b = (_a = transactions === null || transactions === void 0 ? void 0 : transactions.edges) === null || _a === void 0 ? void 0 : _a.map((edge) => edge.node)) !== null && _b !== void 0 ? _b : [],
            LL,
            locale,
        });
    }, [transactions, LL, locale]);
    if (error) {
        console.error(error);
        (0, crashlytics_1.getCrashlytics)().recordError(error);
        (0, toast_1.toastShow)({
            message: (translations) => translations.common.transactionsError(),
        });
        return <></>;
    }
    if (!transactions) {
        return <ActivityIndicatorContext_1.Loading />;
    }
    const fetchNextTransactionsPage = () => {
        const pageInfo = transactions === null || transactions === void 0 ? void 0 : transactions.pageInfo;
        if (pageInfo.hasNextPage) {
            fetchMore({
                variables: {
                    after: pageInfo.endCursor,
                },
            });
        }
    };
    return (<screen_1.Screen>
      <react_native_1.SectionList showsVerticalScrollIndicator={false} maxToRenderPerBatch={10} initialNumToRender={20} renderItem={({ item }) => <transaction_item_1.TxItem key={`txn-${item.id}`} tx={item}/>} renderSectionHeader={({ section: { title } }) => (<react_native_1.View style={styles.sectionHeaderContainer}>
            <themed_1.Text type="p1" bold>
              {title}
            </themed_1.Text>
          </react_native_1.View>)} ListEmptyComponent={<react_native_1.View style={styles.noTransactionView}>
            <themed_1.Text type="h1">{LL.TransactionScreen.noTransaction()}</themed_1.Text>
          </react_native_1.View>} sections={sections} keyExtractor={(item) => item.id} onEndReached={fetchNextTransactionsPage} onEndReachedThreshold={0.5} onRefresh={refetch} refreshing={loading} contentContainerStyle={{ paddingHorizontal: 20 }}/>
    </screen_1.Screen>);
};
exports.USDTransactionHistory = USDTransactionHistory;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    noTransactionView: {
        flex: 1,
        alignItems: "center",
        marginVertical: 48,
    },
    sectionHeaderContainer: {
        backgroundColor: colors.white,
        padding: 15,
    },
}));
//# sourceMappingURL=USDTransactionHistory.js.map