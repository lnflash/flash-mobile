"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const i18n_util_1 = require("../app/i18n/i18n-util");
const i18n_util_sync_1 = require("../app/i18n/i18n-util.sync");
const utils_1 = require("./utils");
describe("Welcome Screen Flow", () => {
    (0, i18n_util_sync_1.loadLocale)("en");
    const LL = (0, i18n_util_1.i18nObject)("en");
    // having an invoice or bitcoin address would popup a modal
    it("Clear the clipboard", async () => {
        await browser.setClipboard("", "plaintext");
    });
    it("reset language in case previous test has failed", async () => {
        var _a, _b;
        const result = await (0, utils_1.resetLanguage)();
        expect(result).toBeTruthy();
        expect((_b = (_a = result.data) === null || _a === void 0 ? void 0 : _a.userUpdateLanguage.user) === null || _b === void 0 ? void 0 : _b.language).toBeFalsy();
    });
    it("reset email in case previous test has failed", async () => {
        var _a, _b, _c, _d, _e, _f;
        const result = await (0, utils_1.resetEmail)();
        expect(result).toBeTruthy();
        expect((_c = (_b = (_a = result.data) === null || _a === void 0 ? void 0 : _a.userEmailDelete.me) === null || _b === void 0 ? void 0 : _b.email) === null || _c === void 0 ? void 0 : _c.address).toBeFalsy();
        expect((_f = (_e = (_d = result.data) === null || _d === void 0 ? void 0 : _d.userEmailDelete.me) === null || _e === void 0 ? void 0 : _e.email) === null || _f === void 0 ? void 0 : _f.verified).toBeFalsy();
    });
    it("Pays Test Username to Create a Contact", async () => {
        var _a;
        const result = await (0, utils_1.payTestUsername)();
        expect((_a = result.data) === null || _a === void 0 ? void 0 : _a.intraLedgerPaymentSend.status).toBe("SUCCESS");
    });
    it("resets display currency to USD", async () => {
        var _a, _b;
        const result = await (0, utils_1.resetDisplayCurrency)();
        expect((_b = (_a = result.data) === null || _a === void 0 ? void 0 : _a.accountUpdateDisplayCurrency.account) === null || _b === void 0 ? void 0 : _b.displayCurrency).toBe("USD");
    });
    it("loads and clicks 'Explore wallet instead'", async () => {
        await (0, utils_1.clickButton)(LL.GetStartedScreen.exploreWallet());
    });
});
//# sourceMappingURL=01-welcome-screen-flow.e2e.spec.js.map