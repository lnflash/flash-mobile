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
exports.HomeScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const wallet_overview_1 = __importDefault(require("@app/components/wallet-overview/wallet-overview"));
const set_default_account_modal_1 = require("@app/components/set-default-account-modal");
const unverified_seed_modal_1 = require("@app/components/unverified-seed-modal");
const screen_1 = require("@app/components/screen");
const home_screen_1 = require("@app/components/home-screen");
// gql
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
// store
const redux_1 = require("@app/store/redux");
const userSlice_1 = require("@app/store/redux/slices/userSlice");
const persistent_state_1 = require("@app/store/persistent-state");
const HomeScreen = () => {
    var _a, _b;
    const { colors } = (0, themed_1.useTheme)().theme;
    const dispatch = (0, redux_1.useAppDispatch)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const [modalVisible, setModalVisible] = (0, react_1.useState)(false);
    const [refreshTriggered, setRefreshTriggered] = (0, react_1.useState)(false);
    const [defaultAccountModalVisible, setDefaultAccountModalVisible] = (0, react_1.useState)(false);
    const [isUnverifiedSeedModalVisible, setIsUnverifiedSeedModalVisible] = (0, react_1.useState)(false);
    // queries
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data: dataAuthed, loading: loadingAuthed, error, refetch: refetchAuthed, } = (0, generated_1.useHomeAuthedQuery)({
        skip: !isAuthed,
        fetchPolicy: "network-only",
        errorPolicy: "all",
        nextFetchPolicy: "cache-and-network", // this enables offline mode use-case
    });
    const { refetch: refetchRealtimePrice } = (0, generated_1.useRealtimePriceQuery)({
        skip: !isAuthed,
        fetchPolicy: "network-only",
        nextFetchPolicy: "cache-and-network", // this enables offline mode use-case
    });
    const transactions = ((_b = (_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.transactions) === null || _b === void 0 ? void 0 : _b.edges) || [];
    (0, react_1.useEffect)(() => {
        if (dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) {
            dispatch((0, userSlice_1.setUserData)(dataAuthed.me));
            saveDefaultWallet();
        }
    }, [dataAuthed]);
    const saveDefaultWallet = () => {
        var _a, _b, _c, _d;
        const defaultWallet = (0, wallets_utils_1.getDefaultWallet)((_b = (_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets, (_d = (_c = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _c === void 0 ? void 0 : _c.defaultAccount) === null || _d === void 0 ? void 0 : _d.defaultWalletId);
        if (!persistentState.defaultWallet ||
            (persistentState.defaultWallet.walletCurrency === "USD" &&
                persistentState.defaultWallet.id !== (defaultWallet === null || defaultWallet === void 0 ? void 0 : defaultWallet.id))) {
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { defaultWallet });
                return undefined;
            });
        }
    };
    const refetch = (0, react_1.useCallback)(() => {
        if (isAuthed) {
            refetchRealtimePrice();
            refetchAuthed();
            setRefreshTriggered(true);
            setTimeout(() => setRefreshTriggered(false), 1000);
        }
    }, [isAuthed, refetchAuthed, refetchRealtimePrice]);
    const renderRefreshControl = () => (<react_native_1.RefreshControl refreshing={refreshTriggered} onRefresh={refetch} colors={[colors.primary]} // Android refresh indicator colors
     tintColor={colors.primary} // iOS refresh indicator color
    />);
    return (<screen_1.Screen backgroundColor={colors.background}>
      <home_screen_1.Header />
      <react_native_1.ScrollView refreshControl={renderRefreshControl()}>
        <home_screen_1.Username />
        <wallet_overview_1.default setIsUnverifiedSeedModalVisible={setIsUnverifiedSeedModalVisible}/>
        <home_screen_1.Info refreshTriggered={refreshTriggered} error={error}/>
        <home_screen_1.Buttons setModalVisible={setModalVisible} setDefaultAccountModalVisible={setDefaultAccountModalVisible}/>
        <home_screen_1.QuickStart />
        <home_screen_1.Transactions refreshTriggered={refreshTriggered} loadingAuthed={loadingAuthed} transactionsEdges={transactions}/>
      </react_native_1.ScrollView>
      <set_default_account_modal_1.SetDefaultAccountModal isVisible={defaultAccountModalVisible} toggleModal={() => setDefaultAccountModalVisible(!defaultAccountModalVisible)}/>
      <unverified_seed_modal_1.UnVerifiedSeedModal isVisible={isUnverifiedSeedModalVisible} setIsVisible={setIsUnverifiedSeedModalVisible}/>
      <home_screen_1.AccountCreateModal modalVisible={modalVisible} setModalVisible={setModalVisible}/>
    </screen_1.Screen>);
};
exports.HomeScreen = HomeScreen;
//# sourceMappingURL=home-screen.js.map