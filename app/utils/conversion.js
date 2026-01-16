"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNumberArray = exports.toMilliSatoshi = exports.toLong = exports.base64ToBytes = void 0;
const byte_base64_1 = require("byte-base64");
const long_1 = __importDefault(require("long"));
const base64ToBytes = (data) => {
    return typeof data === "string"
        ? (0, byte_base64_1.base64ToBytes)(data)
        : data instanceof Uint8Array
            ? data
            : Uint8Array.from(data || []);
};
exports.base64ToBytes = base64ToBytes;
const toLong = (value) => {
    return value instanceof Uint8Array
        ? long_1.default.fromBytes((0, exports.toNumberArray)(value))
        : Array.isArray(value)
            ? long_1.default.fromBytes(value)
            : long_1.default.fromValue(value);
};
exports.toLong = toLong;
const toMilliSatoshi = (value) => {
    return (0, exports.toLong)(value).multiply(1000);
};
exports.toMilliSatoshi = toMilliSatoshi;
const toNumberArray = (arr) => {
    let numberArr = [];
    for (let i = 0; i < arr.length; i++) {
        numberArr = numberArr.concat(arr[i]);
    }
    return numberArr;
};
exports.toNumberArray = toNumberArray;
//# sourceMappingURL=conversion.js.map