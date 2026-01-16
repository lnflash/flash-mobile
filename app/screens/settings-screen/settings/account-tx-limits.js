"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxLimits = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
// components
const row_1 = require("../row");
const TxLimits = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    return (<row_1.SettingsRow shorter title={LL.common.transactionLimits()} leftIcon="information-circle-outline" action={() => navigate("transactionLimitsScreen")}/>);
};
exports.TxLimits = TxLimits;
//# sourceMappingURL=account-tx-limits.js.map