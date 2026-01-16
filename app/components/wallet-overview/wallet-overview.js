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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
// components
const cards_1 = require("../cards");
// hooks
const generated_1 = require("@app/graphql/generated");
const persistent_state_1 = require("@app/store/persistent-state");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const native_1 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
// utils
const amounts_1 = require("@app/types/amounts");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const WalletOverview = ({ setIsUnverifiedSeedModalVisible }) => {
    var _a, _b;
    const navigation = (0, native_1.useNavigation)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { lnurl, balanceInSats, readFlashcard } = (0, hooks_1.useFlashcard)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const { formatMoneyAmount, displayCurrency, moneyAmountToDisplayCurrencyString } = (0, use_display_currency_1.useDisplayCurrency)();
    const { data } = (0, generated_1.useWalletOverviewScreenQuery)({
        fetchPolicy: "network-only",
        skip: !isAuthed,
    });
    const [btcBalance, setBtcBalance] = (0, react_1.useState)((persistentState === null || persistentState === void 0 ? void 0 : persistentState.btcBalance) || undefined);
    const [btcDisplayBalance, setBtcDisplayBalance] = (0, react_1.useState)((persistentState === null || persistentState === void 0 ? void 0 : persistentState.btcDisplayBalance) || "0");
    const [cashBalance, setCashBalance] = (0, react_1.useState)((persistentState === null || persistentState === void 0 ? void 0 : persistentState.cashBalance) || undefined);
    const [cashDisplayBalance, setCashDisplayBalance] = (0, react_1.useState)((persistentState === null || persistentState === void 0 ? void 0 : persistentState.cashDisplayBalance) || "0");
    (0, react_1.useEffect)(() => {
        if (persistentState.btcDisplayBalance !== btcDisplayBalance ||
            persistentState.cashDisplayBalance !== cashDisplayBalance ||
            persistentState.btcBalance !== btcBalance ||
            persistentState.cashBalance !== cashBalance) {
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { btcDisplayBalance,
                        cashDisplayBalance,
                        btcBalance,
                        cashBalance });
                return undefined;
            });
        }
    }, [btcDisplayBalance, cashDisplayBalance, btcBalance, cashBalance]);
    (0, react_1.useEffect)(() => {
        if (isAuthed)
            formatBalance();
    }, [isAuthed, (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets, btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance, displayCurrency]);
    const formatBalance = () => {
        var _a, _b, _c, _d;
        const extBtcWalletBalance = (0, amounts_1.toBtcMoneyAmount)((_a = btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance) !== null && _a !== void 0 ? _a : NaN);
        setBtcBalance(formatMoneyAmount({
            moneyAmount: extBtcWalletBalance,
        }));
        setBtcDisplayBalance(moneyAmountToDisplayCurrencyString({
            moneyAmount: extBtcWalletBalance,
        }));
        if (data) {
            const extUsdWallet = (0, wallets_utils_1.getUsdWallet)((_c = (_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.defaultAccount) === null || _c === void 0 ? void 0 : _c.wallets);
            const extUsdWalletBalance = (0, amounts_1.toUsdMoneyAmount)((_d = extUsdWallet === null || extUsdWallet === void 0 ? void 0 : extUsdWallet.balance) !== null && _d !== void 0 ? _d : NaN);
            setCashBalance(formatMoneyAmount({
                moneyAmount: extUsdWalletBalance,
            }));
            setCashDisplayBalance(moneyAmountToDisplayCurrencyString({
                moneyAmount: extUsdWalletBalance,
            }));
        }
    };
    const navigateHandler = (activeTab) => {
        if (persistentState.isAdvanceMode) {
            navigation.navigate("TransactionHistoryTabs", {
                initialRouteName: activeTab,
            });
        }
        else {
            navigation.navigate(activeTab);
        }
    };
    const onPressCash = () => navigateHandler("USDTransactionHistory");
    const onPressBitcoin = () => navigateHandler("BTCTransactionHistory");
    const onPressFlashcard = () => {
        if (lnurl)
            navigation.navigate("Card");
        else
            readFlashcard();
    };
    const formattedCardBalance = moneyAmountToDisplayCurrencyString({
        moneyAmount: (0, amounts_1.toBtcMoneyAmount)(balanceInSats !== null && balanceInSats !== void 0 ? balanceInSats : NaN),
    });
    return (<react_native_1.View style={{ marginHorizontal: 20 }}>
      <cards_1.Balance icon="cash" title={LL.HomeScreen.cash()} amount={cashDisplayBalance} 
    // amount={cashBalance}
    currency={displayCurrency} onPress={onPressCash}/>
      {persistentState.isAdvanceMode && (<cards_1.Balance icon="bitcoin" title={LL.HomeScreen.bitcoin()} amount={btcBalance} 
        // amount={btcDisplayBalance}
        currency="" onPress={onPressBitcoin} onPressRightBtn={() => setIsUnverifiedSeedModalVisible(true)} rightIcon={persistentState.backedUpBtcWallet ? undefined : "warning"}/>)}
      <cards_1.Balance icon={!!formattedCardBalance ? "flashcard" : "cardAdd"} title={LL.HomeScreen.flashcard()} amount={formattedCardBalance} currency={displayCurrency} emptyText={LL.HomeScreen.addFlashcard()} onPress={onPressFlashcard} onPressRightBtn={() => readFlashcard(false)} rightIcon={"sync"}/>
    </react_native_1.View>);
};
exports.default = WalletOverview;
//# sourceMappingURL=wallet-overview.js.map