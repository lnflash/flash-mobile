"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useNetworkError = exports.NetworkErrorContextProvider = void 0;
const react_1 = require("react");
const NetworkErrorContext = (0, react_1.createContext)({
    networkError: undefined,
    clearNetworkError: () => { },
});
exports.NetworkErrorContextProvider = NetworkErrorContext.Provider;
const useNetworkError = () => (0, react_1.useContext)(NetworkErrorContext);
exports.useNetworkError = useNetworkError;
//# sourceMappingURL=network-error-context.js.map