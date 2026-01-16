"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLightningAddress = void 0;
const errors_1 = require("@app/types/errors");
const validateLightningAddress = (lightningAddress) => {
    if (lightningAddress.length < 3) {
        return {
            valid: false,
            error: errors_1.SetAddressError.TOO_SHORT,
        };
    }
    if (lightningAddress.length > 50) {
        return {
            valid: false,
            error: errors_1.SetAddressError.TOO_LONG,
        };
    }
    if (!/^[\p{L}0-9_]+$/u.test(lightningAddress)) {
        return {
            valid: false,
            error: errors_1.SetAddressError.INVALID_CHARACTER,
        };
    }
    if (/^[0-9]/.test(lightningAddress)) {
        return {
            valid: false,
            error: errors_1.SetAddressError.STARTS_WITH_NUMBER,
        };
    }
    return {
        valid: true,
    };
};
exports.validateLightningAddress = validateLightningAddress;
//# sourceMappingURL=validations.js.map