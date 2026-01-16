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
exports.TransactionHistoryTabs = void 0;
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const material_top_tabs_1 = require("@react-navigation/material-top-tabs");
// screens
const USDTransactionHistory_1 = require("./USDTransactionHistory");
const BTCTransactionHistory_1 = require("./BTCTransactionHistory");
// components
const hideable_area_1 = __importDefault(require("@app/components/hideable-area/hideable-area"));
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const persistent_state_1 = require("@app/store/persistent-state");
const hooks_1 = require("@app/hooks");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
// types
const amounts_1 = require("@app/types/amounts");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const Tab = (0, material_top_tabs_1.createMaterialTopTabNavigator)();
const TransactionHistoryTabs = ({ navigation, route }) => {
    var _a, _b;
    const initialRouteName = (_a = route.params) === null || _a === void 0 ? void 0 : _a.initialRouteName;
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const { moneyAmountToDisplayCurrencyString } = (0, hooks_1.useDisplayCurrency)();
    const [btcBalance, setBtcBalance] = (0, react_1.useState)();
    const [cashBalance, setCashBalance] = (0, react_1.useState)();
    const [activeWallet, setActiveWallet] = (0, react_1.useState)(initialRouteName === "USDTransactionHistory" ? "usd" : "btc");
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data } = (0, generated_1.useBalanceHeaderQuery)({ skip: !isAuthed });
    const { data: { hideBalance = false } = {} } = (0, generated_1.useHideBalanceQuery)();
    (0, react_1.useEffect)(() => {
        navigation.setOptions({
            headerRight: () => (<hideable_area_1.default isContentVisible={hideBalance} style={{ marginRight: 10 }}>
          <themed_1.Text type="p1" style={{ marginRight: 10 }}>
            {activeWallet === "btc" ? btcBalance : cashBalance}
          </themed_1.Text>
        </hideable_area_1.default>),
        });
    }, [activeWallet, btcBalance, cashBalance]);
    (0, react_1.useEffect)(() => {
        formatBalance();
    }, [(_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.defaultAccount.wallets, btcWallet.balance]);
    const formatBalance = () => {
        var _a, _b, _c, _d;
        setBtcBalance(moneyAmountToDisplayCurrencyString({
            moneyAmount: (0, amounts_1.toBtcMoneyAmount)((_a = btcWallet.balance) !== null && _a !== void 0 ? _a : NaN),
        }));
        const extUsdWallet = (0, wallets_utils_1.getUsdWallet)((_c = (_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.defaultAccount) === null || _c === void 0 ? void 0 : _c.wallets);
        const extUsdWalletBalance = (0, amounts_1.toUsdMoneyAmount)((_d = extUsdWallet === null || extUsdWallet === void 0 ? void 0 : extUsdWallet.balance) !== null && _d !== void 0 ? _d : NaN);
        setCashBalance(moneyAmountToDisplayCurrencyString({
            moneyAmount: extUsdWalletBalance,
        }));
    };
    return (<Tab.Navigator initialRouteName={initialRouteName} screenOptions={{
            tabBarLabelStyle: { fontSize: 18, fontWeight: "600" },
            tabBarIndicatorStyle: { backgroundColor: colors.primary },
        }}>
      {persistentState.isAdvanceMode && (<Tab.Screen name="BTCTransactionHistory" component={BTCTransactionHistory_1.BTCTransactionHistory} options={{ title: LL.TransactionHistoryTabs.titleBTC() }} listeners={() => ({
                swipeEnd: (e) => {
                    setActiveWallet("btc");
                },
                tabPress: (e) => {
                    setActiveWallet("btc");
                },
            })}/>)}

      <Tab.Screen name="USDTransactionHistory" component={USDTransactionHistory_1.USDTransactionHistory} options={{ title: LL.TransactionHistoryTabs.titleUSD() }} listeners={() => ({
            swipeEnd: (e) => {
                setActiveWallet("usd");
            },
            tabPress: (e) => {
                setActiveWallet("usd");
            },
        })}/>
    </Tab.Navigator>);
};
exports.TransactionHistoryTabs = TransactionHistoryTabs;
//# sourceMappingURL=TransactionHistoryTabs.js.map