"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnreadChatsCount = exports.getAllLastSeen = exports.getContactsFromEvent = exports.getLastSeen = exports.updateLastSeen = void 0;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const updateLastSeen = async (groupId, timestamp) => {
    try {
        await async_storage_1.default.setItem(`lastSeen_${groupId}`, timestamp.toString());
    }
    catch (error) {
        console.error("Error saving last seen timestamp:", error);
    }
};
exports.updateLastSeen = updateLastSeen;
const getLastSeen = async (groupId) => {
    try {
        const lastSeen = await async_storage_1.default.getItem(`lastSeen_${groupId}`);
        return lastSeen ? parseInt(lastSeen) : 0;
    }
    catch (error) {
        console.error("Error getting last seen timestamp:", error);
        return 0;
    }
};
exports.getLastSeen = getLastSeen;
const getContactsFromEvent = (event) => {
    return event.tags
        .filter((t) => t[0] === "p")
        .map((t) => {
        return { pubkey: t[1] };
    });
};
exports.getContactsFromEvent = getContactsFromEvent;
const getAllLastSeen = async () => {
    try {
        const keys = await async_storage_1.default.getAllKeys();
        const lastSeenKeys = keys.filter((key) => key.startsWith("lastSeen_"));
        const lastSeenPairs = await async_storage_1.default.multiGet(lastSeenKeys);
        return Object.fromEntries(lastSeenPairs.map(([key, value]) => [
            key.replace("lastSeen_", ""),
            parseInt(value || "0"),
        ]));
    }
    catch (error) {
        console.error("Error getting last seen timestamps:", error);
        return {};
    }
};
exports.getAllLastSeen = getAllLastSeen;
const getUnreadChatsCount = async (groups) => {
    const lastSeenMap = await (0, exports.getAllLastSeen)();
    let unreadCount = 0;
    groups.forEach((messages, groupId) => {
        const lastMessage = messages.sort((a, b) => b.created_at - a.created_at)[0];
        const lastSeen = lastSeenMap[groupId] || 0;
        if (lastMessage && lastMessage.created_at > lastSeen) {
            unreadCount++;
        }
    });
    return unreadCount;
};
exports.getUnreadChatsCount = getUnreadChatsCount;
//# sourceMappingURL=utils.js.map