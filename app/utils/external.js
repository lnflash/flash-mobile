"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openWhatsApp = void 0;
const react_native_1 = require("react-native");
const openWhatsApp = async (number, message) => react_native_1.Linking.openURL(`whatsapp://send?phone=${encodeURIComponent(number)}&text=${encodeURIComponent(message)}`);
exports.openWhatsApp = openWhatsApp;
//# sourceMappingURL=external.js.map