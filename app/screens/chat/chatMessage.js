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
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const chatContext_1 = require("./chatContext");
const nostr_1 = require("@app/utils/nostr");
const nostr_tools_1 = require("nostr-tools");
const supportAgents_1 = require("@app/config/supportAgents");
const USER_COLORS = [
    "#d32f2f",
    "#388e3c",
    "#1976d2",
    "#f57c00",
    "#7b1fa2",
    "#0097a7",
    "#c2185b",
    "#512da8",
    "#00796b",
    "#689f38",
    "#5d4037",
    "#455a64",
    "#0288d1",
    "#c62828",
    "#fbc02d", // yellow (deep but readable)
];
function getColorForUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % USER_COLORS.length;
    return USER_COLORS[index];
}
const ChatMessage = ({ message, showSender = false, // ✅ Default to false for backward compatibility
 }) => {
    var _a, _b;
    const styles = useStyles();
    const isMounted = (0, react_1.useRef)(false);
    const { profileMap, addEventToProfiles, poolRef } = (0, chatContext_1.useChatContext)();
    const isAgent = supportAgents_1.SUPPORT_AGENTS.has(message.author.id);
    (0, react_1.useEffect)(() => {
        isMounted.current = true;
        if (!showSender)
            return;
        if (profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(message.author.id))
            return;
        if (!poolRef)
            return;
        else {
            (0, nostr_1.fetchNostrUsers)([message.author.id], poolRef.current, (event) => {
                addEventToProfiles(event);
            });
        }
        return () => {
            isMounted.current = false;
        };
    }, [poolRef]);
    return (<react_native_1.View style={styles.container}>
      {/* ✅ Optional sender display */}
      {showSender && (<react_native_1.View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <react_native_1.Text style={Object.assign(Object.assign({}, styles.sender), { color: getColorForUserId(message.author.id) })}>
            {((_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(message.author.id)) === null || _a === void 0 ? void 0 : _a.name) ||
                nostr_tools_1.nip19.npubEncode(message.author.id).slice(0, 10) ||
                "Unknown"}
          </react_native_1.Text>
          {isAgent && (<react_native_1.View style={styles.badge}>
              <react_native_1.Text style={styles.badgeText}>Support</react_native_1.Text>
            </react_native_1.View>)}
        </react_native_1.View>)}
      <react_native_1.View style={{ flexDirection: "row", alignItems: "center" }}>
        {((_b = message.metadata) === null || _b === void 0 ? void 0 : _b.errors) && (<galoy_icon_1.GaloyIcon name="warning" size={20} color="yellow" style={styles.errorIcon}/>)}
        <react_native_1.Text style={styles.content}>{message.text}</react_native_1.Text>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.ChatMessage = ChatMessage;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        borderRadius: 12,
        padding: 10,
        overflow: "hidden",
    },
    sender: {
        fontSize: 12,
        fontWeight: "bold",
        color: colors.grey3,
        marginBottom: 4,
    },
    content: {
        color: colors._black,
    },
    errorIcon: {
        marginRight: 10,
    },
    badge: {
        marginLeft: 6,
        paddingHorizontal: 6,
        marginBottom: 6,
        paddingVertical: 2,
        borderRadius: 8,
        backgroundColor: "#1976d2", // blue badge
    },
    badgeText: {
        color: "white",
        fontSize: 10,
        fontWeight: "bold",
        paddingBottom: 2,
    },
}));
//# sourceMappingURL=chatMessage.js.map