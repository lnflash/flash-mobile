"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const locale_detector_1 = require("../../app/utils/locale-detector");
describe("matchOsLocaleToSupportedLocale", () => {
    it("exactly matches a supported locale", () => {
        const supportedCountyAndLang = [
            { countryCode: "CA", languageTag: "fr-CA", languageCode: "fr", isRTL: false },
        ];
        const locale = (0, locale_detector_1.matchOsLocaleToSupportedLocale)(supportedCountyAndLang);
        expect(locale).toEqual("fr");
    });
    it("approximately matches a supported locale", () => {
        const unsupportedCountrySupportedLang = [
            { countryCode: "SV", languageTag: "es-SV", languageCode: "es", isRTL: false },
        ];
        const locale = (0, locale_detector_1.matchOsLocaleToSupportedLocale)(unsupportedCountrySupportedLang);
        expect(locale).toEqual("es");
    });
    it("returns english when there is no locale match", () => {
        const unsupportedCountryAndLang = [
            { countryCode: "XY", languageTag: "na-XY", languageCode: "na", isRTL: false },
        ];
        const locale = (0, locale_detector_1.matchOsLocaleToSupportedLocale)(unsupportedCountryAndLang);
        expect(locale).toEqual("en");
    });
});
//# sourceMappingURL=locale-detector.test.js.map