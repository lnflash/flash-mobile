"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeSetting = void 0;
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const ThemeSetting = () => {
    var _a;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const colorSchemeData = (0, generated_1.useColorSchemeQuery)();
    let colorScheme = LL.SettingsScreen.setByOs();
    switch ((_a = colorSchemeData === null || colorSchemeData === void 0 ? void 0 : colorSchemeData.data) === null || _a === void 0 ? void 0 : _a.colorScheme) {
        case "light":
            colorScheme = LL.ThemeScreen.setToLight();
            break;
        case "dark":
            colorScheme = LL.ThemeScreen.setToDark();
            break;
    }
    return (<row_1.SettingsRow title={LL.SettingsScreen.theme()} subtitle={colorScheme} leftIcon="contrast-outline" action={() => navigate("theme")}/>);
};
exports.ThemeSetting = ThemeSetting;
//# sourceMappingURL=preferences-theme.js.map