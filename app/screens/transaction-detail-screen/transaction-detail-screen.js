"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionDetailScreen = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const native_1 = require("@react-navigation/native");
// components
const icon_transactions_1 = require("../../components/icon-transactions");
const transaction_date_1 = require("@app/components/transaction-date");
const wallet_summary_1 = require("@app/components/wallet-summary");
const galoy_info_1 = require("@app/components/atomic/galoy-info");
const screen_1 = require("../../components/screen");
// hooks
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
// utils | types
const amounts_1 = require("@app/types/amounts");
const generated_1 = require("@app/graphql/generated");
const transactions_1 = require("@app/graphql/transactions");
const client_1 = require("@apollo/client");
(0, client_1.gql) `
  query transactionDetails($input: TransactionDetailsInput!) {
    transactionDetails(input: $input) {
      errors {
        message
      }
      transactionDetails {
        id
        accountId
        amount
        currency
        status
        type
        createdAt
        updatedAt
        invoice
        paymentHash
        paymentPreimage
        memo
        address
        txid
        vout
        confirmations
        fee
      }
    }
  }
`;
const Row = ({ entry, value, __typename, content }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    return (<react_native_1.View style={styles.rowContainer}>
      <react_native_1.View style={styles.entryContainer}>
        <themed_1.Text style={styles.entryLabel} type="p2">
          {entry}
        </themed_1.Text>
        {__typename === "SettlementViaOnChain" && (<Ionicons_1.default name="open-outline" size={16} color={colors.primary} style={styles.externalIcon}/>)}
      </react_native_1.View>
      {content || (<react_native_1.View style={styles.valueContainer}>
          <themed_1.Text selectable style={styles.valueText} type="p1">
            {value}
          </themed_1.Text>
        </react_native_1.View>)}
    </react_native_1.View>);
};
const typeDisplay = (instance) => {
    switch (instance.__typename) {
        case "SettlementViaOnChain":
            return "OnChain";
        case "SettlementViaLn":
            return "Lightning";
        case "SettlementViaIntraLedger":
            return "IntraLedger";
    }
};
const TransactionDetailScreen = ({ route }) => {
    var _a;
    const { tx } = route.params;
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { galoyInstance } = (0, hooks_1.useAppConfig)().appConfig;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const navigation = (0, native_1.useNavigation)();
    const { formatMoneyAmount, formatCurrency } = (0, use_display_currency_1.useDisplayCurrency)();
    const { data: transactionDetailsData } = (0, generated_1.useTransactionDetailsQuery)({
        variables: {
            input: {
                transactionId: (tx === null || tx === void 0 ? void 0 : tx.id) || "",
            },
        },
        skip: !(tx === null || tx === void 0 ? void 0 : tx.id),
    });
    const ibexDetails = (_a = transactionDetailsData === null || transactionDetailsData === void 0 ? void 0 : transactionDetailsData.transactionDetails) === null || _a === void 0 ? void 0 : _a.transactionDetails;
    if (!tx || Object.keys(tx).length === 0)
        return <themed_1.Text>{"No transaction found with this ID (should not happen)"}</themed_1.Text>;
    const { id, settlementCurrency, settlementAmount, settlementDisplayFee, settlementDisplayAmount, settlementDisplayCurrency, settlementFee, settlementVia, initiationVia, } = tx;
    const viewInExplorer = (hash) => react_native_1.Linking.openURL(galoyInstance.blockExplorer + hash);
    const isReceive = tx.direction === "RECEIVE";
    const spendOrReceiveText = isReceive
        ? LL.TransactionDetailScreen.received()
        : LL.TransactionDetailScreen.spent();
    const displayAmount = formatCurrency({
        amountInMajorUnits: settlementDisplayAmount,
        currency: settlementDisplayCurrency,
    });
    const formattedPrimaryFeeAmount = formatCurrency({
        amountInMajorUnits: settlementDisplayFee,
        currency: settlementDisplayCurrency,
    });
    const formattedSettlementFee = formatMoneyAmount({
        moneyAmount: (0, amounts_1.toWalletAmount)({
            amount: settlementFee,
            currency: settlementCurrency,
        }),
    });
    const onChainTxBroadcasted = (settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) === "SettlementViaOnChain" &&
        (settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.transactionHash) !== null;
    const onChainTxNotBroadcasted = (settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) === "SettlementViaOnChain" &&
        (settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.transactionHash) === null;
    const formattedSecondaryFeeAmount = settlementDisplayCurrency === settlementCurrency ? undefined : formattedSettlementFee;
    const formattedFeeText = formattedPrimaryFeeAmount +
        (formattedSecondaryFeeAmount ? ` (${formattedSecondaryFeeAmount})` : ``);
    const description = (0, transactions_1.getDescriptionDisplay)({
        LL,
        tx,
        bankName: galoyInstance.name,
        showMemo: true,
    });
    return (<screen_1.Screen unsafe preset="fixed">
      <react_native_1.View style={styles.backButtonWrapper}>
        <react_native_1.TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons_1.default name="arrow-back" size={24} color={colors.black}/>
        </react_native_1.TouchableOpacity>
      </react_native_1.View>
      <react_native_1.ScrollView style={styles.scrollContent}>
        <themed_1.Card containerStyle={styles.headerCard}>
          <react_native_1.View style={styles.amountView}>
            <icon_transactions_1.IconTransaction isReceive={isReceive} walletCurrency={settlementCurrency} pending={false} onChain={false}/>
            <themed_1.Text type="h2" style={styles.spendReceiveText}>
              {spendOrReceiveText}
            </themed_1.Text>
            <themed_1.Text type="h1" style={styles.displayAmount}>
              {displayAmount}
            </themed_1.Text>
            {/* Show memo for Lightning or confirmations for onchain */}
            {((ibexDetails === null || ibexDetails === void 0 ? void 0 : ibexDetails.memo) ||
            ((settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) === "SettlementViaOnChain" &&
                (ibexDetails === null || ibexDetails === void 0 ? void 0 : ibexDetails.confirmations) !== undefined &&
                (ibexDetails === null || ibexDetails === void 0 ? void 0 : ibexDetails.confirmations) !== null)) && (<react_native_1.View style={styles.memoContainer}>
                {(settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) === "SettlementViaOnChain" &&
                (ibexDetails === null || ibexDetails === void 0 ? void 0 : ibexDetails.confirmations) !== undefined &&
                (ibexDetails === null || ibexDetails === void 0 ? void 0 : ibexDetails.confirmations) !== null ? (<>
                    <Ionicons_1.default name={ibexDetails.confirmations >= 6
                    ? "shield-checkmark"
                    : ibexDetails.confirmations >= 1
                        ? "shield"
                        : "time"} size={30} color={ibexDetails.confirmations >= 6
                    ? colors.success
                    : ibexDetails.confirmations >= 1
                        ? colors.warning
                        : colors.grey2} style={styles.memoIcon}/>
                    <themed_1.Text type="p1" style={[
                    styles.memoText,
                    {
                        color: ibexDetails.confirmations >= 6
                            ? colors.success
                            : ibexDetails.confirmations >= 1
                                ? colors.warning
                                : colors.grey2,
                    },
                ]}>
                      {ibexDetails.confirmations === 0
                    ? "Pending"
                    : `${ibexDetails.confirmations} ${ibexDetails.confirmations === 1
                        ? "Confirmation"
                        : "Confirmations"}`}
                    </themed_1.Text>
                  </>) : (<>
                    <Ionicons_1.default name="document-text" size={30} color={colors.primary} style={styles.memoIcon}/>
                    <themed_1.Text type="p1" style={styles.memoText}>
                      {ibexDetails === null || ibexDetails === void 0 ? void 0 : ibexDetails.memo}
                    </themed_1.Text>
                  </>)}
              </react_native_1.View>)}
          </react_native_1.View>
        </themed_1.Card>

        <themed_1.Card containerStyle={styles.detailsCard}>
          {onChainTxNotBroadcasted && (<react_native_1.View style={styles.txNotBroadcast}>
              <galoy_info_1.GaloyInfo>{LL.TransactionDetailScreen.txNotBroadcast()}</galoy_info_1.GaloyInfo>
            </react_native_1.View>)}

          <Row entry={isReceive
            ? LL.TransactionDetailScreen.receivingAccount()
            : LL.TransactionDetailScreen.sendingAccount()} content={<wallet_summary_1.WalletSummary amountType={tx.direction} settlementAmount={(0, amounts_1.toWalletAmount)({
                amount: Math.abs(settlementAmount),
                currency: settlementCurrency,
            })} txDisplayAmount={settlementDisplayAmount} txDisplayCurrency={settlementDisplayCurrency}/>}/>

          <Row entry={LL.common.date()} value={<transaction_date_1.TransactionDate {...tx}/>}/>

          <react_native_1.View style={styles.separator}/>

          {(!isReceive || settlementCurrency === "BTC") && (<Row entry={LL.common.fees()} value={formattedFeeText}/>)}

          <Row entry={LL.common.description()} value={description}/>

          {(settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) === "SettlementViaIntraLedger" && (<Row entry={LL.TransactionDetailScreen.paid()} value={(settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.counterPartyUsername) || galoyInstance.name}/>)}

          <Row entry={LL.common.type()} value={typeDisplay(settlementVia)}/>

          <react_native_1.View style={styles.separator}/>

          {(settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) === "SettlementViaLn" &&
            initiationVia.__typename === "InitiationViaLn" &&
            initiationVia.paymentHash && (<Row entry="Hash" value={initiationVia.paymentHash}/>)}

          {(settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) === "SettlementViaLn" &&
            (ibexDetails === null || ibexDetails === void 0 ? void 0 : ibexDetails.paymentPreimage) && (<Row entry="Preimage" value={ibexDetails.paymentPreimage}/>)}

          {onChainTxBroadcasted && (settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.transactionHash) && (<react_native_1.TouchableWithoutFeedback onPress={() => viewInExplorer((settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.transactionHash) || "")}>
              <react_native_1.View>
                <Row entry="Hash" value={settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.transactionHash} __typename={settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename}/>
              </react_native_1.View>
            </react_native_1.TouchableWithoutFeedback>)}

          {id && <Row entry="Transaction ID" value={id}/>}
        </themed_1.Card>
      </react_native_1.ScrollView>
    </screen_1.Screen>);
};
exports.TransactionDetailScreen = TransactionDetailScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    backButtonWrapper: {
        backgroundColor: "white",
        position: "absolute",
        zIndex: 1,
        top: 0,
        left: 0,
        right: 0,
        padding: 15,
    },
    backButton: {
        zIndex: 100,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.white,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 5,
    },
    scrollContent: {
        flex: 1,
    },
    headerCard: {
        marginHorizontal: 16,
        marginTop: 82,
        marginBottom: 8,
        borderRadius: 16,
        elevation: 2,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    detailsCard: {
        marginHorizontal: 16,
        marginBottom: 26,
        borderRadius: 16,
        elevation: 2,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    amountView: {
        alignItems: "center",
        paddingVertical: 20,
    },
    spendReceiveText: {
        marginTop: 12,
        marginBottom: 8,
        color: colors.grey2,
    },
    displayAmount: {
        marginTop: 4,
        fontSize: 32,
        fontWeight: "bold",
    },
    memoContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.grey5,
        borderRadius: 12,
        maxWidth: "90%",
    },
    memoIcon: {
        marginRight: 8,
        color: colors.primary,
    },
    memoText: {
        flex: 1,
        color: colors.primary,
        fontWeight: "600",
        fontSize: 16,
        textAlign: "center",
    },
    rowContainer: {
        marginBottom: 16,
        paddingVertical: 8,
    },
    entryContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    entryLabel: {
        color: colors.grey2,
        fontWeight: "500",
    },
    externalIcon: {
        marginLeft: 6,
    },
    valueContainer: {
        backgroundColor: colors.grey5,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 48,
        justifyContent: "center",
    },
    valueText: {
        fontSize: 15,
        fontWeight: "500",
        color: colors.black,
    },
    txNotBroadcast: {
        marginBottom: 20,
    },
    separator: {
        height: 1,
        backgroundColor: colors.grey4,
        marginVertical: 8,
    },
    description: {
        marginBottom: 16,
    },
    entry: {
        marginBottom: 8,
        color: colors.grey2,
    },
    transactionDetailView: {
        marginHorizontal: 20,
        marginVertical: 15,
    },
    value: {
        fontSize: 15,
        fontWeight: "500",
        color: colors.black,
    },
}));
//# sourceMappingURL=transaction-detail-screen.js.map