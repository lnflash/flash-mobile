"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLnUpdateHashPaid = exports.LnUpdateHashPaidProvider = void 0;
const react_1 = require("react");
const LnUpdateHashPaid = (0, react_1.createContext)("");
exports.LnUpdateHashPaidProvider = LnUpdateHashPaid.Provider;
const useLnUpdateHashPaid = () => (0, react_1.useContext)(LnUpdateHashPaid);
exports.useLnUpdateHashPaid = useLnUpdateHashPaid;
//# sourceMappingURL=ln-update-context.js.map