"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAppSelector = exports.useAppDispatch = exports.store = void 0;
const toolkit_1 = require("@reduxjs/toolkit");
const react_redux_1 = require("react-redux");
const reducers_1 = __importDefault(require("./reducers"));
exports.store = (0, toolkit_1.configureStore)({
    reducer: reducers_1.default,
});
// Use throughout your app instead of plain `useDispatch` and `useSelector`
exports.useAppDispatch = react_redux_1.useDispatch;
exports.useAppSelector = react_redux_1.useSelector;
//# sourceMappingURL=index.js.map