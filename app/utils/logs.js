"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_native_1 = require("react-native");
const react_native_config_1 = __importDefault(require("react-native-config"));
// Interferes in tests
if (react_native_config_1.default.IGNORE_LOGS)
    react_native_1.LogBox.ignoreLogs(["[GraphQL error]:"]);
//# sourceMappingURL=logs.js.map