"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toastShow = void 0;
const react_native_toast_message_1 = __importDefault(require("react-native-toast-message"));
const i18n_util_1 = require("@app/i18n/i18n-util");
const analytics_1 = require("./analytics");
const toastShow = ({ message, currentTranslation, onHide, type = "error", autoHide, position = "bottom", }) => {
    const englishTranslation = (0, i18n_util_1.i18nObject)("en");
    const englishMessage = typeof message === "function" ? message(englishTranslation) : message;
    const translations = currentTranslation || englishTranslation;
    const translatedMessage = typeof message === "function" ? message(translations) : message;
    (0, analytics_1.logToastShown)({
        message: englishMessage,
        type,
        isTranslated: translatedMessage !== englishMessage,
    });
    // FIXME: Toast might not be shown if there is a modal already,
    // like in the case of the quiz rewards questions
    //
    // a potential solution:
    // https://github.com/calintamas/react-native-toast-message/issues/164#issuecomment-803556361
    react_native_toast_message_1.default.show({
        type,
        text1: type === "error" ? translations.common.error() : translations.common.success(),
        text2: translatedMessage,
        position,
        onHide,
        visibilityTime: 10000,
        autoHide,
    });
};
exports.toastShow = toastShow;
//# sourceMappingURL=toast.js.map