"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencySetting = void 0;
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const CurrencySetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const { displayCurrency } = (0, use_display_currency_1.useDisplayCurrency)();
    return (<row_1.SettingsRow title={LL.common.currency()} subtitle={displayCurrency} leftIcon="cash-outline" action={() => navigate("currency")}/>);
};
exports.CurrencySetting = CurrencySetting;
//# sourceMappingURL=preferences-currency.js.map