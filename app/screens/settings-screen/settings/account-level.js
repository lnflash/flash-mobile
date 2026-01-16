"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountLevelSetting = void 0;
const native_1 = require("@react-navigation/native");
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
// components
const row_1 = require("../row");
const accountType = {
    NonAuth: "UNAUTHORIZED ACCOUNT",
    ZERO: "TRIAL ACCOUNT",
    ONE: "PERSONAL ACCOUNT",
    TWO: "PRO ACCOUNT",
    THREE: "MERCHANT ACCOUNT",
};
const AccountLevelSetting = () => {
    const { currentLevel: level } = (0, level_context_1.useLevel)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    return (<row_1.SettingsRow title={LL.common.account()} subtitle={accountType[level]} leftIcon="people" action={() => {
            navigate("accountScreen");
        }}/>);
};
exports.AccountLevelSetting = AccountLevelSetting;
//# sourceMappingURL=account-level.js.map