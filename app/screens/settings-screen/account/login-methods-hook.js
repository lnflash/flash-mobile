"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLoginMethods = void 0;
const generated_1 = require("@app/graphql/generated");
const useLoginMethods = () => {
    var _a, _b, _c, _d, _e;
    const { data } = (0, generated_1.useSettingsScreenQuery)({ fetchPolicy: "cache-and-network" });
    const email = ((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.email) === null || _b === void 0 ? void 0 : _b.address) || undefined;
    const emailVerified = Boolean(email && ((_d = (_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.email) === null || _d === void 0 ? void 0 : _d.verified));
    const phone = (_e = data === null || data === void 0 ? void 0 : data.me) === null || _e === void 0 ? void 0 : _e.phone;
    const phoneVerified = Boolean(phone);
    const bothEmailAndPhoneVerified = phoneVerified && emailVerified;
    return {
        loading: !data,
        email,
        emailVerified,
        phone,
        phoneVerified,
        bothEmailAndPhoneVerified,
    };
};
exports.useLoginMethods = useLoginMethods;
//# sourceMappingURL=login-methods-hook.js.map