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
exports.useNostrGroupChat = exports.NostrGroupChatProvider = void 0;
const react_1 = __importStar(require("react"));
const nostr_tools_1 = require("nostr-tools");
const nostr_1 = require("@app/utils/nostr");
const chatContext_1 = require("../../../screens/chat/chatContext");
const NostrGroupChatContext = (0, react_1.createContext)(undefined);
// ===== Helpers =====
const makeSystemText = (text) => ({
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author: { id: "system" },
    createdAt: Date.now(),
    type: "text",
    text,
});
const NostrGroupChatProvider = ({ groupId, relayUrls = ["wss://groups.0xchat.com"], adminPubkeys, children, }) => {
    const { poolRef, userPublicKey } = (0, chatContext_1.useChatContext)();
    // Internal message map ensures dedupe by id
    const [messagesMap, setMessagesMap] = (0, react_1.useState)(new Map());
    const [isMember, setIsMember] = (0, react_1.useState)(false);
    const [knownMembers, setKnownMembers] = (0, react_1.useState)(new Set());
    const [metadata, setMetadata] = (0, react_1.useState)({});
    // Track last known membership set to detect new joins for system messages
    const prevMembersRef = (0, react_1.useRef)(new Set());
    // Sorted messages array for the UI (newest first)
    const messages = (0, react_1.useMemo)(() => {
        return Array.from(messagesMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    }, [messagesMap]);
    // ----- Sub: group messages (kind 9) -----
    (0, react_1.useEffect)(() => {
        if (!(poolRef === null || poolRef === void 0 ? void 0 : poolRef.current))
            return;
        const unsub = poolRef.current.subscribeMany(relayUrls, [
            {
                "#h": [groupId],
                "kinds": [9],
            },
        ], {
            onevent: (event) => {
                const msg = {
                    id: event.id,
                    author: { id: event.pubkey },
                    createdAt: event.created_at * 1000,
                    type: "text",
                    text: event.content,
                };
                setMessagesMap((prev) => {
                    if (prev.has(msg.id))
                        return prev;
                    const next = new Map(prev);
                    next.set(msg.id, msg);
                    return next;
                });
            },
        });
        return () => {
            if (unsub)
                unsub.close();
        };
    }, [poolRef === null || poolRef === void 0 ? void 0 : poolRef.current, relayUrls.join("|"), groupId]);
    //metadata
    (0, react_1.useEffect)(() => {
        function parseGroupTags(tags) {
            const result = {};
            for (const tag of tags) {
                const [key, value] = tag;
                if (key === "name")
                    result.name = value;
                else if (key === "about")
                    result.about = value;
                else if (key === "picture")
                    result.picture = value;
            }
            return result;
        }
        const unsub = poolRef === null || poolRef === void 0 ? void 0 : poolRef.current.subscribeMany(relayUrls, [{ "kinds": [39000], "#d": [groupId] }], {
            onevent: (event) => {
                console.log("==============GOT METADATA EVENT=============");
                const parsed = parseGroupTags(event.tags);
                setMetadata(parsed);
            },
            oneose: () => {
                console.log("EOSE TRIGGERED FOR ", 39000);
            },
        });
        return () => unsub === null || unsub === void 0 ? void 0 : unsub.close();
    }, [poolRef === null || poolRef === void 0 ? void 0 : poolRef.current, groupId]);
    // ----- Sub: membership roster (kind 39002) -----
    (0, react_1.useEffect)(() => {
        if (!(poolRef === null || poolRef === void 0 ? void 0 : poolRef.current))
            return;
        const filters = {
            "kinds": [39002],
            "#d": [groupId],
        };
        if (adminPubkeys === null || adminPubkeys === void 0 ? void 0 : adminPubkeys.length)
            filters.authors = adminPubkeys;
        const unsub = poolRef.current.subscribeMany(relayUrls, [filters], {
            onevent: (event) => {
                // Extract all `p` tags as pubkeys
                console.log("==============GOT MEMBERSHIP EVENT=============");
                const currentMembers = event.tags
                    .filter((tag) => (tag === null || tag === void 0 ? void 0 : tag[0]) === "p" && tag[1])
                    .map((tag) => tag[1]);
                // Convert to Set for easy diff
                const currentSet = new Set(currentMembers);
                // Notify self if joined
                if (userPublicKey &&
                    !prevMembersRef.current.has(userPublicKey) &&
                    currentSet.has(userPublicKey)) {
                    setMessagesMap((prevMap) => {
                        const next = new Map(prevMap);
                        next.set(`sys-joined-self-${Date.now()}`, makeSystemText("You joined the group"));
                        return next;
                    });
                    setIsMember(true);
                }
                // Notify other new members
                // Track new members
                currentMembers.forEach((pk) => {
                    if (pk !== userPublicKey &&
                        !prevMembersRef.current.has(pk) &&
                        prevMembersRef.current.size !== 0) {
                        const short = pk.slice(0, 6) + "…" + pk.slice(-4);
                        setMessagesMap((prevMap) => {
                            const next = new Map(prevMap);
                            next.set(`sys-joined-${pk}-${Date.now()}`, makeSystemText(`${short} joined the group`));
                            return next;
                        });
                    }
                });
                // Update prevMembersRef to exactly the current members
                prevMembersRef.current = currentSet;
                // Update knownMembers state
                setKnownMembers(currentSet);
            },
        });
        return () => {
            if (unsub)
                unsub.close();
        };
    }, [
        poolRef === null || poolRef === void 0 ? void 0 : poolRef.current,
        relayUrls.join("|"),
        groupId,
        userPublicKey,
        adminPubkeys === null || adminPubkeys === void 0 ? void 0 : adminPubkeys.join("|"),
    ]);
    // ----- Actions -----
    const sendMessage = (0, react_1.useCallback)(async (text) => {
        if (!(poolRef === null || poolRef === void 0 ? void 0 : poolRef.current))
            throw Error("No PoolRef present");
        if (!userPublicKey)
            throw Error("No user pubkey present");
        const secretKey = await (0, nostr_1.getSecretKey)();
        if (!secretKey)
            throw Error("Could not get Secret Key");
        const nostrEvent = {
            kind: 9,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["h", groupId, relayUrls[0]]],
            content: text,
            pubkey: userPublicKey,
        };
        const signedEvent = (0, nostr_tools_1.finalizeEvent)(nostrEvent, secretKey);
        poolRef.current.publish(relayUrls, signedEvent);
    }, [poolRef === null || poolRef === void 0 ? void 0 : poolRef.current, userPublicKey, groupId, relayUrls]);
    const requestJoin = (0, react_1.useCallback)(async () => {
        if (!(poolRef === null || poolRef === void 0 ? void 0 : poolRef.current))
            throw Error("No PoolRef present");
        if (!userPublicKey)
            throw Error("No user pubkey present");
        const secretKey = await (0, nostr_1.getSecretKey)();
        if (!secretKey)
            throw Error("Could not get Secret Key");
        const joinEvent = {
            kind: 9021,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["h", groupId]],
            content: "I'd like to join this group.",
            pubkey: userPublicKey,
        };
        const signedJoinEvent = (0, nostr_tools_1.finalizeEvent)(joinEvent, secretKey);
        poolRef.current.publish(relayUrls, signedJoinEvent);
        // Optimistic system note
        setMessagesMap((prev) => {
            const next = new Map(prev);
            next.set(`sys-join-req-${Date.now()}`, makeSystemText("Join request sent"));
            return next;
        });
    }, [poolRef === null || poolRef === void 0 ? void 0 : poolRef.current, userPublicKey, groupId, relayUrls]);
    const value = (0, react_1.useMemo)(() => ({
        messages,
        isMember,
        knownMembers,
        sendMessage,
        requestJoin,
        groupMetadata: metadata,
    }), [messages, isMember, knownMembers, sendMessage, requestJoin]);
    return (<NostrGroupChatContext.Provider value={value}>
      {children}
    </NostrGroupChatContext.Provider>);
};
exports.NostrGroupChatProvider = NostrGroupChatProvider;
const useNostrGroupChat = () => {
    const ctx = (0, react_1.useContext)(NostrGroupChatContext);
    if (!ctx)
        throw new Error("useNostrGroupChat must be used inside NostrGroupChatProvider");
    return ctx;
};
exports.useNostrGroupChat = useNostrGroupChat;
//# sourceMappingURL=GroupChatProvider.js.map