"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useActivityIndicator = void 0;
const react_1 = require("react");
const ActivityIndicatorContext_1 = require("@app/contexts/ActivityIndicatorContext");
const useActivityIndicator = () => {
    const context = (0, react_1.useContext)(ActivityIndicatorContext_1.ActivityIndicatorContext);
    return context;
};
exports.useActivityIndicator = useActivityIndicator;
//# sourceMappingURL=useActivityIndicator.js.map