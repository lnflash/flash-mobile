"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
/**
 * A "modern" sleep statement.
 *
 * @param ms The number of milliseconds to wait.
 */
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
exports.sleep = sleep;
//# sourceMappingURL=sleep.js.map