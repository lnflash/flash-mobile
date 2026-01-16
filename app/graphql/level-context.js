"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLevel = exports.LevelContextProvider = exports.AccountLevel = void 0;
const react_1 = require("react");
exports.AccountLevel = {
    NonAuth: "NonAuth",
    Zero: "ZERO",
    One: "ONE",
    Two: "TWO",
    Three: "THREE",
};
const Level = (0, react_1.createContext)({
    isAtLeastLevelZero: false,
    isAtLeastLevelOne: false,
    currentLevel: exports.AccountLevel.NonAuth,
});
exports.LevelContextProvider = Level.Provider;
const useLevel = () => (0, react_1.useContext)(Level);
exports.useLevel = useLevel;
//# sourceMappingURL=level-context.js.map