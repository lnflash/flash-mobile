"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const timer_1 = require("../app/utils/timer");
describe("parseTimer", () => {
    it("parse time when is more than 1 minute", () => {
        const outputTime = (0, timer_1.parseTimer)(65);
        expect(outputTime).toStrictEqual("01:05");
    });
    it("parse time when is less than 1 minute", () => {
        const outputTime = (0, timer_1.parseTimer)(40);
        expect(outputTime).toStrictEqual("00:40");
    });
    it("parse time when is less than 10 second", () => {
        const outputTime = (0, timer_1.parseTimer)(8);
        expect(outputTime).toStrictEqual("00:08");
    });
    it("parse time when is negative", () => {
        const outputTime = (0, timer_1.parseTimer)(-5);
        expect(outputTime).toStrictEqual("00:00");
    });
});
//# sourceMappingURL=timer.spec.js.map