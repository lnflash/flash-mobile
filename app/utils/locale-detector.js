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
exports.getLocaleFromLanguage = exports.getLanguageFromString = exports.Languages = exports.detectDefaultLocale = exports.matchOsLocaleToSupportedLocale = void 0;
const i18n_util_1 = require("@app/i18n/i18n-util");
const RNLocalize = __importStar(require("react-native-localize"));
const matchOsLocaleToSupportedLocale = (localesFromOs) => {
    const languageCodeFromOs = localesFromOs.map((osLocale) => osLocale.languageCode);
    let firstSupportedLocale = "en";
    for (const languageCode of languageCodeFromOs) {
        const match = i18n_util_1.locales.find((locale) => languageCode.startsWith(locale));
        if (match) {
            firstSupportedLocale = match;
            break;
        }
    }
    return firstSupportedLocale;
};
exports.matchOsLocaleToSupportedLocale = matchOsLocaleToSupportedLocale;
const detectDefaultLocale = () => {
    const localesFromOs = RNLocalize.getLocales();
    return (0, exports.matchOsLocaleToSupportedLocale)(localesFromOs);
};
exports.detectDefaultLocale = detectDefaultLocale;
exports.Languages = ["DEFAULT", ...i18n_util_1.locales];
const getLanguageFromString = (language) => {
    if (!language) {
        return "DEFAULT";
    }
    const exactMatchLanguage = i18n_util_1.locales.find((locale) => locale === language);
    if (exactMatchLanguage) {
        return exactMatchLanguage;
    }
    // previously we used the following values for setting the language sever side
    // ["DEFAULT", "en-US", "es-SV", "pt-BR", "fr-CA", "de-DE", "cs"]
    const approximateMatchLocale = i18n_util_1.locales.find((locale) => locale.startsWith(language.split("-")[0]));
    return approximateMatchLocale || "DEFAULT";
};
exports.getLanguageFromString = getLanguageFromString;
const getLocaleFromLanguage = (language) => {
    if (language === "DEFAULT") {
        return (0, exports.detectDefaultLocale)();
    }
    return language;
};
exports.getLocaleFromLanguage = getLocaleFromLanguage;
//# sourceMappingURL=locale-detector.js.map