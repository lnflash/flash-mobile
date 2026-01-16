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
const chatContext_1 = require("@app/screens/chat/chatContext");
const utils_1 = require("@app/screens/chat/utils");
const nostr_1 = require("@app/utils/nostr");
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const NotificationBadge = () => {
    const { rumors } = (0, chatContext_1.useChatContext)();
    const [count, setCount] = (0, react_1.useState)(0);
    (0, react_1.useEffect)(() => {
        async function initialize() {
            let fetchedCount = await (0, utils_1.getUnreadChatsCount)((0, nostr_1.convertRumorsToGroups)(rumors));
            setCount(fetchedCount);
        }
        initialize();
    });
    if (count <= 0)
        return null;
    return (<react_native_1.View style={styles.container}>
      <react_native_1.Text style={styles.text}>{count}</react_native_1.Text>
    </react_native_1.View>);
};
const styles = react_native_1.StyleSheet.create({
    container: {
        position: "absolute",
        right: -10,
        top: -5,
        backgroundColor: "green",
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    text: {
        color: "white",
        fontWeight: "bold",
        fontSize: 12,
    },
});
exports.default = NotificationBadge;
//# sourceMappingURL=notification-badge.js.map