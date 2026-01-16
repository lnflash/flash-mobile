"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageSetting = void 0;
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const mapping_1 = require("@app/i18n/mapping");
const locale_detector_1 = require("@app/utils/locale-detector");
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const LanguageSetting = () => {
    var _a;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    const language = (0, locale_detector_1.getLanguageFromString)((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.language);
    return (<row_1.SettingsRow loading={loading} title={LL.common.language()} subtitle={language === "DEFAULT"
            ? LL.SettingsScreen.setByOs()
            : mapping_1.LocaleToTranslateLanguageSelector[language]} leftIcon="language" action={() => navigate("language")}/>);
};
exports.LanguageSetting = LanguageSetting;
//# sourceMappingURL=preferences-language.js.map