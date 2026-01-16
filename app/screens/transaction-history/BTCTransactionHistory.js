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
exports.BTCTransactionHistory = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const react_native_indicators_1 = require("react-native-indicators");
// components
const screen_1 = require("@app/components/screen");
const transaction_item_1 = require("@app/components/transaction-item");
const ActivityIndicatorContext_1 = require("@app/contexts/ActivityIndicatorContext");
const buttons_1 = require("@app/components/buttons");
const transactions_1 = require("@app/graphql/transactions");
// Breez SDK
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const useBreezPayments_1 = require("@app/hooks/useBreezPayments");
// store
const persistent_state_1 = require("@app/store/persistent-state");
const storage_1 = require("@app/utils/storage");
const BTCTransactionHistory = () => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL, locale } = (0, i18n_react_1.useI18nContext)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const [refundables, setRefundables] = (0, react_1.useState)([]);
    const [hasMore, setHasMore] = (0, react_1.useState)(true);
    const [refreshing, setRefreshing] = (0, react_1.useState)(false);
    const [fetchingMore, setFetchingMore] = (0, react_1.useState)(false);
    const [breezLoading, setBreezLoading] = (0, react_1.useState)(false);
    const [txsList, setTxsList] = (0, react_1.useState)(persistentState.btcTransactions || []);
    (0, react_1.useEffect)(() => {
        fetchPaymentsBreez(0);
        fetchRefundables();
    }, []);
    const fetchRefundables = async () => {
        const refundables = (await (0, react_native_breez_sdk_liquid_1.listRefundables)()) || [];
        const refundedTxs = (await (0, storage_1.loadJson)("refundedTxs")) || [];
        console.log("Refundable and Refunded Transactions>>>>>>>>>>", [
            ...refundables,
            ...refundedTxs,
        ]);
        setRefundables([...refundables, ...refundedTxs]);
    };
    const fetchPaymentsBreez = async (offset) => {
        setBreezLoading(true);
        const payments = await (0, breez_sdk_liquid_1.listPaymentsBreezSDK)(offset, 15);
        let formattedBreezTxs = await formatBreezTransactions(payments);
        if (offset === 0) {
            setTxsList(formattedBreezTxs);
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { btcTransactions: formattedBreezTxs });
                return undefined;
            });
        }
        else {
            setTxsList([...txsList, ...formattedBreezTxs]);
        }
        setBreezLoading(false);
        setRefreshing(false);
        setFetchingMore(false);
        if (payments.length < 15) {
            setHasMore(false);
        }
        else {
            setHasMore(true);
        }
    };
    const formatBreezTransactions = async (txs) => {
        var _a;
        if (!convertMoneyAmount || !txs) {
            return [];
        }
        const formattedTxs = txs === null || txs === void 0 ? void 0 : txs.map((txDetails) => (0, useBreezPayments_1.formatPaymentsBreezSDK)({ txDetails, convertMoneyAmount }));
        return (_a = formattedTxs === null || formattedTxs === void 0 ? void 0 : formattedTxs.filter(Boolean)) !== null && _a !== void 0 ? _a : [];
    };
    const transactionSections = (0, transactions_1.groupTransactionsByDate)({
        txs: txsList !== null && txsList !== void 0 ? txsList : [],
        LL,
        locale,
    });
    const onRefresh = () => {
        if (!breezLoading) {
            setRefreshing(true);
            fetchPaymentsBreez(0);
        }
    };
    const onEndReached = () => {
        if (!breezLoading && hasMore) {
            setFetchingMore(true);
            fetchPaymentsBreez(txsList.length);
        }
    };
    if (breezLoading && transactionSections.length === 0) {
        return <ActivityIndicatorContext_1.Loading />;
    }
    else {
        return (<screen_1.Screen>
        <react_native_1.SectionList showsVerticalScrollIndicator={false} renderItem={({ item }) => <transaction_item_1.TxItem key={item.id} tx={item}/>} initialNumToRender={20} renderSectionHeader={({ section: { title } }) => (<react_native_1.View style={styles.sectionHeaderContainer}>
              <themed_1.Text type="p1" bold>
                {title}
              </themed_1.Text>
            </react_native_1.View>)} ListEmptyComponent={<react_native_1.View style={styles.noTransactionView}>
              <themed_1.Text type="h1">{LL.TransactionScreen.noTransaction()}</themed_1.Text>
            </react_native_1.View>} ListFooterComponent={() => fetchingMore && (<react_native_indicators_1.BarIndicator color={colors.primary} count={5} size={20} style={{ marginVertical: 20 }}/>)} sections={transactionSections} keyExtractor={(item, index) => item.id + index} onEndReachedThreshold={0.5} onEndReached={onEndReached} refreshControl={<react_native_1.RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary}/>} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}/>
        {refundables.length > 0 && (<react_native_1.View style={styles.floatingButtonWrapper}>
            <react_native_1.View style={styles.floatingButton}>
              <buttons_1.PrimaryBtn label={LL.RefundFlow.pendingTransactions()} onPress={() => navigation.navigate("RefundTransactionList")}/>
            </react_native_1.View>
          </react_native_1.View>)}
      </screen_1.Screen>);
    }
};
exports.BTCTransactionHistory = BTCTransactionHistory;
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
    floatingButtonWrapper: {
        alignItems: "center",
    },
    floatingButton: {
        width: "90%",
        position: "absolute",
        bottom: 20,
    },
}));
//# sourceMappingURL=BTCTransactionHistory.js.map