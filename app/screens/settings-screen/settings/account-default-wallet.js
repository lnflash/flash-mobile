"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultWallet = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const persistent_state_1 = require("@app/store/persistent-state");
const DefaultWallet = () => {
    var _a;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const defaultWalletCurrency = ((_a = persistentState.defaultWallet) === null || _a === void 0 ? void 0 : _a.walletCurrency) === "BTC" ? "BTC" : "Cash (USD)";
    if (persistentState.isAdvanceMode) {
        return (<row_1.SettingsRow title={LL.SettingsScreen.defaultWallet()} subtitle={defaultWalletCurrency} leftIcon="wallet-outline" action={() => {
                navigate("defaultWallet");
            }}/>);
    }
    else {
        return null;
    }
};
exports.DefaultWallet = DefaultWallet;
//# sourceMappingURL=account-default-wallet.js.map