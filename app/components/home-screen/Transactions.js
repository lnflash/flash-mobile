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
const themed_1 = require("@rneui/themed");
const native_1 = __importDefault(require("styled-components/native"));
// components
const transaction_item_1 = require("../../components/transaction-item");
// hooks
const persistent_state_1 = require("@app/store/persistent-state");
const useBreezPayments_1 = require("@app/hooks/useBreezPayments");
const hooks_1 = require("@app/hooks");
const native_2 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
// breez
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const Transactions = ({ loadingAuthed, transactionsEdges, refreshTriggered, }) => {
    const navigation = (0, native_2.useNavigation)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { refreshBreez } = (0, hooks_1.useBreez)();
    const [breezListenerId, setBreezListenerId] = (0, react_1.useState)();
    const [breezTxsLoading, setBreezTxsLoading] = (0, react_1.useState)(false);
    const [breezTransactions, setBreezTransactions] = (0, react_1.useState)([]);
    const [mergedTransactions, setMergedTransactions] = (0, react_1.useState)((persistentState === null || persistentState === void 0 ? void 0 : persistentState.mergedTransactions) || []);
    (0, react_1.useEffect)(() => {
        if (persistentState.isAdvanceMode && breez_sdk_liquid_1.breezSDKInitialized) {
            fetchPaymentsBreez();
        }
    }, [refreshTriggered, breez_sdk_liquid_1.breezSDKInitialized, persistentState.isAdvanceMode]);
    (0, react_1.useEffect)(() => {
        if (!loadingAuthed && !breezTxsLoading) {
            mergeTransactions(breezTransactions);
        }
    }, [transactionsEdges, breezTransactions, loadingAuthed, breezTxsLoading]);
    (0, react_1.useEffect)(() => {
        if (persistentState.isAdvanceMode && breez_sdk_liquid_1.breezSDKInitialized && !breezListenerId) {
            addBreezEventListener();
        }
        else if (!persistentState.isAdvanceMode) {
            setBreezTransactions([]);
            setBreezListenerId(undefined);
        }
        return removeBreezEventListener;
    }, [persistentState.isAdvanceMode, breez_sdk_liquid_1.breezSDKInitialized, breezListenerId]);
    const addBreezEventListener = async () => {
        const listenerId = await (0, react_native_breez_sdk_liquid_1.addEventListener)((e) => {
            if (e.type !== react_native_breez_sdk_liquid_1.SdkEventVariant.SYNCED) {
                fetchPaymentsBreez();
            }
        });
        setBreezListenerId(listenerId);
    };
    const removeBreezEventListener = () => {
        if (breezListenerId) {
            (0, react_native_breez_sdk_liquid_1.removeEventListener)(breezListenerId);
            setBreezListenerId(undefined);
        }
    };
    const fetchPaymentsBreez = async () => {
        try {
            if (!breezTxsLoading) {
                setBreezTxsLoading(true);
                refreshBreez();
                const payments = await (0, breez_sdk_liquid_1.listPaymentsBreezSDK)(0, 3);
                setBreezTransactions(payments);
                setBreezTxsLoading(false);
            }
        }
        catch (err) {
            console.log("listPaymentsBreezSDK ERROR:", err);
        }
    };
    const mergeTransactions = async (breezTxs) => {
        var _a, _b;
        const mergedTransactions = [];
        const formattedBreezTxs = await formatBreezTransactions(breezTxs);
        let i = 0;
        let j = 0;
        while (transactionsEdges.length != i && formattedBreezTxs.length != j) {
            if (((_a = transactionsEdges[i].node) === null || _a === void 0 ? void 0 : _a.createdAt) > ((_b = formattedBreezTxs[j]) === null || _b === void 0 ? void 0 : _b.createdAt)) {
                mergedTransactions.push(transactionsEdges[i].node);
                i++;
            }
            else {
                mergedTransactions.push(formattedBreezTxs[j]);
                j++;
            }
        }
        while (transactionsEdges.length !== i) {
            mergedTransactions.push(transactionsEdges[i].node);
            i++;
        }
        while (formattedBreezTxs.length !== j) {
            mergedTransactions.push(formattedBreezTxs[j]);
            j++;
        }
        updateMergedTransactions(mergedTransactions);
    };
    const formatBreezTransactions = async (txs) => {
        var _a;
        if (!convertMoneyAmount || !txs) {
            return [];
        }
        const formattedTxs = txs === null || txs === void 0 ? void 0 : txs.map((txDetails) => (0, useBreezPayments_1.formatPaymentsBreezSDK)({ txDetails, convertMoneyAmount }));
        return (_a = formattedTxs === null || formattedTxs === void 0 ? void 0 : formattedTxs.filter(Boolean)) !== null && _a !== void 0 ? _a : [];
    };
    const updateMergedTransactions = (txs) => {
        if (txs.length > 0) {
            setMergedTransactions(txs.slice(0, 3));
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { mergedTransactions: txs.slice(0, 3) });
                return undefined;
            });
        }
    };
    const navigateToTransactionHistory = () => {
        navigation.navigate(persistentState.isAdvanceMode ? "TransactionHistoryTabs" : "USDTransactionHistory");
    };
    if (mergedTransactions.length > 0) {
        return (<Wrapper>
        <RecentActivity onPress={navigateToTransactionHistory} activeOpacity={0.5}>
          <themed_1.Text type="bl" bold>
            {LL.TransactionScreen.title()}
          </themed_1.Text>
        </RecentActivity>
        {mergedTransactions.map((item, index) => (<transaction_item_1.TxItem key={item.id} tx={item}/>))}
      </Wrapper>);
    }
    else {
        return (<react_native_1.ActivityIndicator animating={breezTxsLoading || loadingAuthed} size="large" color={colors.primary} style={{ marginTop: 24 }}/>);
    }
};
exports.default = Transactions;
const Wrapper = native_1.default.View `
  padding-horizontal: 20px;
`;
const RecentActivity = native_1.default.TouchableOpacity `
  margin-top: 10px;
  margin-bottom: 10px;
`;
//# sourceMappingURL=Transactions.js.map