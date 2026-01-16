"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTimer = void 0;
function parseTimer(seconds) {
    if (!seconds) {
        return "00:00";
    }
    const minute = parseInt(String(seconds / 60), 10);
    const second = parseInt(String(seconds % 60), 10);
    return `${minute.toString().padStart(2, "0")}:${second > 0 ? second.toString().padStart(2, "0") : "00"}`;
}
exports.parseTimer = parseTimer;
//# sourceMappingURL=timer.js.map