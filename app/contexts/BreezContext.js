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
exports.BreezProvider = exports.BreezContext = void 0;
const react_1 = __importStar(require("react"));
const generated_1 = require("@app/graphql/generated");
const persistent_state_1 = require("@app/store/persistent-state");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const react_native_1 = require("react-native");
exports.BreezContext = (0, react_1.createContext)({
    refreshBreez: () => { },
    loading: false,
    btcWallet: {
        id: "",
        walletCurrency: "BTC",
        balance: 0,
        pendingReceiveSat: 0,
        pendingSendSat: 0,
    },
});
const BreezProvider = ({ children }) => {
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [btcWallet, setBtcWallet] = (0, react_1.useState)({
        id: "",
        walletCurrency: "BTC",
        balance: persistentState.breezBalance || 0,
        pendingReceiveSat: 0,
        pendingSendSat: 0,
    });
    (0, react_1.useEffect)(() => {
        if (react_native_1.Platform.OS === "ios" && Number(react_native_1.Platform.Version) < 13) {
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { isAdvanceMode: false });
                return undefined;
            });
        }
        else {
            if (persistentState.isAdvanceMode) {
                getBreezInfo();
            }
            else {
                setBtcWallet({
                    id: "",
                    walletCurrency: "BTC",
                    balance: 0,
                    pendingReceiveSat: 0,
                    pendingSendSat: 0,
                });
            }
        }
    }, [persistentState.isAdvanceMode]);
    const getBreezInfo = async () => {
        try {
            setLoading(true);
            await (0, breez_sdk_liquid_1.initializeBreezSDK)();
            const { walletInfo } = await (0, react_native_breez_sdk_liquid_1.getInfo)();
            setBtcWallet({
                id: walletInfo.pubkey,
                walletCurrency: generated_1.WalletCurrency.Btc,
                balance: walletInfo.balanceSat,
                pendingReceiveSat: walletInfo.pendingReceiveSat,
                pendingSendSat: walletInfo.pendingSendSat,
            });
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { breezBalance: walletInfo.balanceSat });
                return undefined;
            });
            setLoading(false);
        }
        catch (err) {
            react_native_1.Alert.alert("BTC wallet initialization failed", err.toString());
        }
    };
    const refreshBreez = () => {
        if (persistentState.isAdvanceMode)
            getBreezInfo();
    };
    return (<exports.BreezContext.Provider value={{ btcWallet, loading, refreshBreez }}>
      {children}
    </exports.BreezContext.Provider>);
};
exports.BreezProvider = BreezProvider;
//# sourceMappingURL=BreezContext.js.map