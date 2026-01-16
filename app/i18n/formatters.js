"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initFormatters = void 0;
const initFormatters = (_locale) => {
    const formatters = {
        sats: (value) => {
            if (value === 0) {
                return `₿${value.toPrecision(1)}`;
            }
            else if (value instanceof Number) {
                return `₿${value.toPrecision(1)}`;
            }
            return `₿${value}`;
        },
    };
    return formatters;
};
exports.initFormatters = initFormatters;
//# sourceMappingURL=formatters.js.map