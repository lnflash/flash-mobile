"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const toolkit_1 = require("@reduxjs/toolkit");
// slices
const userSlice_1 = __importDefault(require("./slices/userSlice"));
exports.default = (0, toolkit_1.combineReducers)({
    user: userSlice_1.default,
});
//# sourceMappingURL=reducers.js.map