"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mobile_1 = require("libphonenumber-js/mobile");
describe("parsePhoneNumber", () => {
    it("correctly handles extra 0", () => {
        const phoneWithLeadingZero = (0, mobile_1.parsePhoneNumberFromString)("07400123456", "GB");
        const phoneWithoutLeadingZero = (0, mobile_1.parsePhoneNumberFromString)("7400123456", "GB");
        expect(phoneWithLeadingZero === null || phoneWithLeadingZero === void 0 ? void 0 : phoneWithLeadingZero.isValid()).toBe(true);
        expect(phoneWithoutLeadingZero === null || phoneWithoutLeadingZero === void 0 ? void 0 : phoneWithoutLeadingZero.isValid()).toBe(true);
        expect(phoneWithLeadingZero === null || phoneWithLeadingZero === void 0 ? void 0 : phoneWithLeadingZero.number).toBe(phoneWithoutLeadingZero === null || phoneWithoutLeadingZero === void 0 ? void 0 : phoneWithoutLeadingZero.number);
    });
});
//# sourceMappingURL=phone-number-parser.test.js.map