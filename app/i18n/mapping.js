"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocaleToTranslateLanguageSelector = void 0;
require("@formatjs/intl-getcanonicallocales/polyfill");
require("@formatjs/intl-locale/polyfill");
require("@formatjs/intl-relativetimeformat/polyfill");
require("@formatjs/intl-relativetimeformat/locale-data/af");
require("@formatjs/intl-relativetimeformat/locale-data/ar");
require("@formatjs/intl-relativetimeformat/locale-data/ca");
require("@formatjs/intl-relativetimeformat/locale-data/cs");
require("@formatjs/intl-relativetimeformat/locale-data/de");
require("@formatjs/intl-relativetimeformat/locale-data/en");
require("@formatjs/intl-relativetimeformat/locale-data/el");
require("@formatjs/intl-relativetimeformat/locale-data/es");
require("@formatjs/intl-relativetimeformat/locale-data/fr");
require("@formatjs/intl-relativetimeformat/locale-data/hr");
require("@formatjs/intl-relativetimeformat/locale-data/hy");
require("@formatjs/intl-relativetimeformat/locale-data/it");
require("@formatjs/intl-relativetimeformat/locale-data/nl");
require("@formatjs/intl-relativetimeformat/locale-data/ms");
require("@formatjs/intl-relativetimeformat/locale-data/pt");
require("@formatjs/intl-relativetimeformat/locale-data/qu");
require("@formatjs/intl-relativetimeformat/locale-data/sr");
require("@formatjs/intl-relativetimeformat/locale-data/sw");
require("@formatjs/intl-relativetimeformat/locale-data/th");
require("@formatjs/intl-relativetimeformat/locale-data/tr");
require("@formatjs/intl-relativetimeformat/locale-data/vi");
// we don't use transfiex for this because we don't want the language to be translated.
// for instance, for French we want "Francais", not "French" or "ภาษาฝรั่งเศส"
exports.LocaleToTranslateLanguageSelector = {
    af: "Afrikaans",
    ar: "العربية",
    ca: "Catalan",
    cs: "Česky",
    de: "Deutsch",
    en: "English",
    el: "Ελληνικά",
    es: "Español",
    fr: "Français",
    hr: "Hrvatski",
    hy: "Հայերեն",
    it: "Italiano",
    nl: "Nederlands",
    ms: "Bahasa Melayu",
    pt: "Português",
    qu: "Quechua",
    sr: "Српски",
    sw: "KiSwahili",
    th: "ไทย",
    tr: "Türkçe",
    vi: "Tiếng Việt",
};
//# sourceMappingURL=mapping.js.map