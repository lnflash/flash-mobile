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
exports.ContactTransactions = void 0;
const client_1 = require("@apollo/client");
const i18n_react_1 = require("@app/i18n/i18n-react");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const transaction_item_1 = require("../../components/transaction-item");
const toast_1 = require("../../utils/toast");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const transactions_1 = require("@app/graphql/transactions");
const themed_1 = require("@rneui/themed");
(0, client_1.gql) `
  query transactionListForContact(
    $username: Username!
    $first: Int
    $after: String
    $last: Int
    $before: String
  ) {
    me {
      id
      contactByUsername(username: $username) {
        transactions(first: $first, after: $after, last: $last, before: $before) {
          ...TransactionList
        }
      }
    }
  }
`;
const ContactTransactions = ({ contactUsername }) => {
    var _a, _b;
    const styles = useStyles();
    const { LL, locale } = (0, i18n_react_1.useI18nContext)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { error, data, fetchMore } = (0, generated_1.useTransactionListForContactQuery)({
        variables: { username: contactUsername },
        skip: !isAuthed,
    });
    const transactions = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.contactByUsername) === null || _b === void 0 ? void 0 : _b.transactions;
    const sections = React.useMemo(() => {
        var _a, _b;
        return (0, transactions_1.groupTransactionsByDate)({
            txs: (_b = (_a = transactions === null || transactions === void 0 ? void 0 : transactions.edges) === null || _a === void 0 ? void 0 : _a.map((edge) => edge.node)) !== null && _b !== void 0 ? _b : [],
            LL,
            locale,
        });
    }, [transactions, LL]);
    if (error) {
        (0, toast_1.toastShow)({
            message: (translations) => translations.common.transactionsError(),
            currentTranslation: LL,
        });
        return <></>;
    }
    if (!transactions) {
        return <></>;
    }
    const fetchNextTransactionsPage = () => {
        const pageInfo = transactions === null || transactions === void 0 ? void 0 : transactions.pageInfo;
        if (pageInfo.hasNextPage) {
            fetchMore({
                variables: {
                    username: contactUsername,
                    after: pageInfo.endCursor,
                },
            });
        }
    };
    return (<react_native_1.View style={styles.screen}>
      <react_native_1.SectionList renderItem={({ item }) => <transaction_item_1.TxItem key={`txn-${item.id}`} tx={item}/>} initialNumToRender={20} renderSectionHeader={({ section: { title } }) => (<react_native_1.View style={styles.sectionHeaderContainer}>
            <react_native_1.Text style={styles.sectionHeaderText}>{title}</react_native_1.Text>
          </react_native_1.View>)} ListEmptyComponent={<react_native_1.View style={styles.noTransactionView}>
            <react_native_1.Text style={styles.noTransactionText}>
              {LL.TransactionScreen.noTransaction()}
            </react_native_1.Text>
          </react_native_1.View>} sections={sections} keyExtractor={(item) => item.id} onEndReached={fetchNextTransactionsPage} onEndReachedThreshold={0.5}/>
    </react_native_1.View>);
};
exports.ContactTransactions = ContactTransactions;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    noTransactionText: {
        fontSize: 24,
    },
    noTransactionView: {
        alignItems: "center",
        flex: 1,
        marginVertical: 48,
    },
    screen: {
        flex: 1,
        borderRadius: 10,
        borderColor: colors.grey4,
        borderWidth: 2,
        overflow: "hidden",
    },
    sectionHeaderContainer: {
        backgroundColor: colors.grey5,
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 10,
    },
    sectionHeaderText: {
        color: colors.black,
        fontSize: 18,
    },
}));
//# sourceMappingURL=contact-transactions.js.map