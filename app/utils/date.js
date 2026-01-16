"use strict";
/* eslint-disable no-param-reassign */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sameMonth = exports.sameDay = void 0;
// refactor these utils
const sameDay = (d1, d2) => {
    const parsedD1 = new Date(1000 * d1); // XXX FIXME
    if (typeof d2 === "number") {
        d2 = new Date(d2);
    }
    return (parsedD1.getFullYear() === d2.getFullYear() &&
        parsedD1.getMonth() === d2.getMonth() &&
        parsedD1.getDate() === d2.getDate());
};
exports.sameDay = sameDay;
const sameMonth = (d1, d2) => {
    const parsedD1 = new Date(1000 * d1); // XXX FIXME
    if (typeof d2 === "number") {
        d2 = new Date(d2);
    }
    return (parsedD1.getFullYear() === d2.getFullYear() && parsedD1.getMonth() === d2.getMonth());
};
exports.sameMonth = sameMonth;
//# sourceMappingURL=date.js.map