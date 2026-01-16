"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpgradeAccountLevelOne = void 0;
const level_context_1 = require("@app/graphql/level-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("../../row");
const UpgradeAccountLevelOne = () => {
    const { currentLevel } = (0, level_context_1.useLevel)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    if (currentLevel !== level_context_1.AccountLevel.One)
        return <></>;
    return (<row_1.SettingsRow title={LL.AccountScreen.upgrade()} leftIcon="person-outline" action={() => navigate("fullOnboardingFlow")}/>);
};
exports.UpgradeAccountLevelOne = UpgradeAccountLevelOne;
//# sourceMappingURL=upgrade.js.map