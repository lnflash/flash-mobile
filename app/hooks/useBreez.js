"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBreez = void 0;
const react_1 = require("react");
const BreezContext_1 = require("@app/contexts/BreezContext");
const useBreez = () => {
    const context = (0, react_1.useContext)(BreezContext_1.BreezContext);
    return context;
};
exports.useBreez = useBreez;
//# sourceMappingURL=useBreez.js.map