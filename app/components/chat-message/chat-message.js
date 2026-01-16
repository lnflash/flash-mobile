"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMessage = void 0;
/* eslint-disable camelcase */
/* eslint-disable react-hooks/exhaustive-deps */
require("react-native-get-random-values");
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const ChatMessage = ({ message, recipientId }) => {
    const styles = useStyles();
    const isMounted = (0, react_1.useRef)(false);
    (0, react_1.useEffect)(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);
    return (<react_native_1.View style={styles.container}>
      <react_native_1.Text style={Object.assign(Object.assign({}, styles.content), { color: recipientId !== message.author.id ? "#ffffff" : "#000000" })}>
        {message.text}
      </react_native_1.Text>
    </react_native_1.View>);
};
exports.ChatMessage = ChatMessage;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        borderRadius: 12,
        padding: 10,
        overflow: "hidden",
    },
    content: {
        color: colors.black,
    },
}));
//# sourceMappingURL=chat-message.js.map