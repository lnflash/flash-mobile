"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportWallet = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const persistent_state_1 = require("@app/store/persistent-state");
const row_1 = require("../row");
const ImportWallet = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    if (persistentState.isAdvanceMode) {
        return (<row_1.SettingsRow title={LL.SettingsScreen.importWallet()} leftIcon="grid-outline" action={() => navigate("ImportWalletOptions", { insideApp: true })}/>);
    }
    else {
        return null;
    }
};
exports.ImportWallet = ImportWallet;
//# sourceMappingURL=import-wallet.js.map