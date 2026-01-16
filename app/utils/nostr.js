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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContactListEvent = exports.saveGiftwrapsToStorage = exports.loadGiftwrapsFromStorage = exports.customPublish = exports.ensureRelay = exports.sendNip17Message = exports.addToContactList = exports.setPreferredRelay = exports.fetchContactList = exports.sendNIP4Message = exports.fetchPreferredRelays = exports.fetchNostrUsers = exports.getSecretKey = exports.getGroupId = exports.convertRumorsToGroups = exports.fetchGiftWrapsForPublicKey = exports.fetchSecretFromLocalStorage = exports.getRumorFromWrap = exports.decryptNip44Message = exports.createWrap = exports.createSeal = exports.createRumor = exports.publicRelays = void 0;
const utils_1 = require("@app/screens/chat/utils");
const utils_2 = require("@noble/curves/abstract/utils");
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const nostr_tools_1 = require("nostr-tools");
const react_native_1 = require("react-native");
const Keychain = __importStar(require("react-native-keychain"));
const pool_1 = require("./nostr/pool");
exports.publicRelays = [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://relay.snort.social",
    "wss//nos.lol",
];
const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key";
const now = () => Math.round(Date.now() / 1000);
const createRumor = (event, privateKey) => {
    const rumor = Object.assign(Object.assign({ created_at: now(), content: "", tags: [] }, event), { pubkey: (0, nostr_tools_1.getPublicKey)(privateKey) });
    rumor.id = (0, nostr_tools_1.getEventHash)(rumor);
    return rumor;
};
exports.createRumor = createRumor;
function encrypNip44Message(privateKey, message, receiverPublicKey) {
    let conversationKey = nostr_tools_1.nip44.v2.utils.getConversationKey((0, utils_2.bytesToHex)(privateKey), receiverPublicKey);
    let ciphertext = nostr_tools_1.nip44.v2.encrypt(message, conversationKey);
    return ciphertext;
}
const createSeal = (rumor, privateKey, recipientPublicKey) => {
    return (0, nostr_tools_1.finalizeEvent)({
        kind: 13,
        content: encrypNip44Message(privateKey, JSON.stringify(rumor), recipientPublicKey),
        created_at: now(),
        tags: [],
    }, privateKey);
};
exports.createSeal = createSeal;
const createWrap = (event, recipientPublicKey) => {
    const randomKey = (0, nostr_tools_1.generateSecretKey)();
    return (0, nostr_tools_1.finalizeEvent)({
        kind: 1059,
        content: encrypNip44Message(randomKey, JSON.stringify(event), recipientPublicKey),
        created_at: now(),
        tags: [["p", recipientPublicKey]],
    }, randomKey);
};
exports.createWrap = createWrap;
const decryptNip44Message = (cipher, publicKey, privateKey) => {
    let conversationKey = nostr_tools_1.nip44.v2.utils.getConversationKey((0, utils_2.bytesToHex)(privateKey), publicKey);
    let message = nostr_tools_1.nip44.v2.decrypt(cipher, conversationKey);
    return message;
};
exports.decryptNip44Message = decryptNip44Message;
const getRumorFromWrap = (wrapEvent, privateKey) => {
    let sealString = (0, exports.decryptNip44Message)(wrapEvent.content, wrapEvent.pubkey, privateKey);
    let seal = JSON.parse(sealString);
    let rumorString = (0, exports.decryptNip44Message)(seal.content, seal.pubkey, privateKey);
    let rumor = JSON.parse(rumorString);
    return rumor;
};
exports.getRumorFromWrap = getRumorFromWrap;
const fetchSecretFromLocalStorage = async () => {
    let credentials = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY);
    return credentials ? credentials.password : null;
};
exports.fetchSecretFromLocalStorage = fetchSecretFromLocalStorage;
const fetchGiftWrapsForPublicKey = (pubkey, eventHandler, pool, since) => {
    let filter = {
        "kinds": [1059],
        "#p": [pubkey],
        "limit": 150,
    };
    if (since)
        filter.since = since;
    let closer = pool.subscribeMany(["wss://relay.flashapp.me", "wss://relay.damus.io", "wss://nostr.oxtr.dev"], [filter], {
        onevent: eventHandler,
        onclose: () => {
            closer.close();
            console.log("Re-establishing connection");
            closer = (0, exports.fetchGiftWrapsForPublicKey)(pubkey, eventHandler, pool);
        },
    });
    return closer;
};
exports.fetchGiftWrapsForPublicKey = fetchGiftWrapsForPublicKey;
const convertRumorsToGroups = (rumors) => {
    let groups = new Map();
    rumors.forEach((rumor) => {
        let participants = rumor.tags.filter((t) => t[0] === "p").map((p) => p[1]);
        let id = (0, exports.getGroupId)([...participants, rumor.pubkey]);
        groups.set(id, [...(groups.get(id) || []), rumor]);
    });
    return groups;
};
exports.convertRumorsToGroups = convertRumorsToGroups;
const getGroupId = (participantsHex) => {
    const participantsSet = new Set(participantsHex);
    let participants = Array.from(participantsSet);
    participants.sort();
    let id = participants.join(",");
    return id;
};
exports.getGroupId = getGroupId;
const getSecretKey = async () => {
    let secretKeyString = await (0, exports.fetchSecretFromLocalStorage)();
    if (!secretKeyString) {
        return null;
    }
    let secret = nostr_tools_1.nip19.decode(secretKeyString).data;
    return secret;
};
exports.getSecretKey = getSecretKey;
const fetchNostrUsers = (pubKeys, pool, handleProfileEvent) => {
    const closer = pool.subscribeMany(exports.publicRelays, [
        {
            kinds: [0],
            authors: pubKeys,
        },
    ], {
        onevent: (event) => {
            handleProfileEvent(event, closer);
        },
        onclose: () => {
            closer.close();
        },
        oneose: () => {
            closer.close();
        },
    });
    return closer;
};
exports.fetchNostrUsers = fetchNostrUsers;
const fetchPreferredRelays = async (pubKeys, pool) => {
    let filter = {
        kinds: [10050],
        authors: pubKeys,
    };
    let relayEvents = await pool.querySync(exports.publicRelays, filter);
    let relayMap = new Map();
    relayEvents.forEach((event) => {
        relayMap.set(event.pubkey, event.tags.filter((t) => t[0] === "relay").map((t) => t[1]));
    });
    return relayMap;
};
exports.fetchPreferredRelays = fetchPreferredRelays;
const sendNIP4Message = async (message, recipient) => {
    let privateKey = await (0, exports.getSecretKey)();
    let NIP4Messages = {};
};
exports.sendNIP4Message = sendNIP4Message;
const fetchContactList = async (userPubkey, onEvent) => {
    let filter = {
        kinds: [3],
        authors: [userPubkey],
    };
    pool_1.pool.subscribeMany(["wss://relay.damus.io", "wss://relay.prmal.net", "wss://nos.lol"], [filter], {
        onevent: onEvent,
        onclose: () => {
            console.log("Closing Subscription for Contacts");
        },
        oneose: () => {
            console.log("EOSE RECEIVED, DID SUBSCRIPTION CLOSE?");
        },
    });
};
exports.fetchContactList = fetchContactList;
const setPreferredRelay = async (secretKey) => {
    let secret = null;
    if (!secretKey) {
        secret = await (0, exports.getSecretKey)();
        if (!secret) {
            react_native_1.Alert.alert("Nostr Private Key Not Assigned");
            return;
        }
    }
    else {
        secret = secretKey;
    }
    const pubKey = (0, nostr_tools_1.getPublicKey)(secret);
    let relayEvent = {
        pubkey: pubKey,
        tags: [
            ["relay", "wss://relay.flashapp.me"],
            ["relay", "wss://relay.damus.io"],
            ["relay", "wss://relay.primal.net"],
        ],
        created_at: now(),
        kind: 10050,
        content: "",
    };
    const finalEvent = (0, nostr_tools_1.finalizeEvent)(relayEvent, secret);
    let messages = await Promise.allSettled(pool_1.pool.publish(exports.publicRelays, finalEvent));
    console.log("Message from relays", messages);
    setTimeout(() => {
        pool_1.pool.close(exports.publicRelays);
    }, 5000);
};
exports.setPreferredRelay = setPreferredRelay;
const addToContactList = async (userPrivateKey, hexPubKeyToAdd, pool, confirmOverwrite, // 🔸 mandatory callback
contactsEvent) => {
    const userPubkey = (0, nostr_tools_1.getPublicKey)(userPrivateKey);
    const existingContacts = contactsEvent ? (0, utils_1.getContactsFromEvent)(contactsEvent) : [];
    const tags = (contactsEvent === null || contactsEvent === void 0 ? void 0 : contactsEvent.tags) || [];
    // ✅ Prevent duplicates
    if (existingContacts.some((p) => p.pubkey === hexPubKeyToAdd)) {
        console.log("Contact already in list.");
        return;
    }
    // 🟡 No existing contact list event found
    if (!contactsEvent) {
        const confirmed = await confirmOverwrite();
        if (!confirmed) {
            console.log("User declined to create a new contact list.");
            return;
        }
    }
    // 🧩 Build updated contact list event
    tags.push(["p", hexPubKeyToAdd]);
    const newEvent = {
        kind: 3,
        pubkey: userPubkey,
        content: (contactsEvent === null || contactsEvent === void 0 ? void 0 : contactsEvent.content) || "",
        created_at: Math.floor(Date.now() / 1000),
        tags,
    };
    const finalNewEvent = (0, nostr_tools_1.finalizeEvent)(newEvent, userPrivateKey);
    const messages = await Promise.allSettled(pool.publish(["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"], finalNewEvent));
    console.log("Contact Publish: Relay replies", messages);
};
exports.addToContactList = addToContactList;
async function sendNip17Message(recipients, message, preferredRelaysMap, onSent) {
    let privateKey = await (0, exports.getSecretKey)();
    if (!privateKey) {
        throw Error("Couldnt find private key in local storage");
    }
    let p_tags = recipients.map((recipientId) => ["p", recipientId]);
    let rumor = (0, exports.createRumor)({ content: message, kind: 14, tags: p_tags }, privateKey);
    let outputs = [];
    console.log("total recipients", recipients);
    await Promise.allSettled(recipients.map(async (recipientId) => {
        console.log("sending rumor for recipient ", recipientId);
        let recipientAcceptedRelays = [];
        let recipientRelays = preferredRelaysMap.get(recipientId);
        recipientRelays = [
            ...(recipientRelays || [
                "wss://relay.flashapp.me",
                "wss://relay.damus.io",
                "wss://nostr.oxtr.dev",
            ]),
        ];
        let seal = (0, exports.createSeal)(rumor, privateKey, recipientId);
        let wrap = (0, exports.createWrap)(seal, recipientId);
        console.log("wrap created");
        try {
            let response = await Promise.allSettled((0, exports.customPublish)(recipientRelays, wrap, (url) => {
                console.log("Accepted relay callback triggered:", url);
                onSent === null || onSent === void 0 ? void 0 : onSent(rumor);
                recipientAcceptedRelays.push(url);
            }, (url) => {
                console.log("Rejected relay:", url);
            }));
        }
        catch (e) {
            console.log("error in publishing", e);
        }
        outputs.push({ acceptedRelays: recipientAcceptedRelays, rejectedRelays: [] });
    }));
    console.log("Final output is", outputs);
    return { outputs, rumor };
}
exports.sendNip17Message = sendNip17Message;
const ensureRelay = async (url, params) => {
    url = normalizeURL(url);
    let relay = new nostr_tools_1.Relay(url);
    if (params === null || params === void 0 ? void 0 : params.connectionTimeout)
        relay.connectionTimeout = params.connectionTimeout;
    await relay.connect();
    return relay;
};
exports.ensureRelay = ensureRelay;
const customPublish = (relays, event, onAcceptedRelays, onRejectedRelays) => {
    console.log("Custom publish invoked ");
    const timeoutPromise = (url) => new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Publish to ${url} timed out`)), 2000);
    });
    return relays.map(normalizeURL).map(async (url, i, arr) => {
        console.log("trying to publish to", url);
        if (arr.indexOf(url) !== i) {
            return Promise.reject("duplicate url");
        }
        return Promise.race([
            (async () => {
                let r = await (0, exports.ensureRelay)(url);
                return r.publish(event).then((value) => {
                    console.log("Accepted on", url);
                    onAcceptedRelays === null || onAcceptedRelays === void 0 ? void 0 : onAcceptedRelays(url);
                    return value;
                }, (reason) => {
                    console.log("Rejected on", url);
                    onRejectedRelays === null || onRejectedRelays === void 0 ? void 0 : onRejectedRelays(url);
                    return reason;
                });
            })(),
            timeoutPromise(url),
        ]);
    });
};
exports.customPublish = customPublish;
function normalizeURL(url) {
    if (url.indexOf("://") === -1)
        url = "wss://" + url;
    let p = new URL(url);
    p.pathname = p.pathname.replace(/\/+/g, "/");
    if (p.pathname.endsWith("/"))
        p.pathname = p.pathname.slice(0, -1);
    if ((p.port === "80" && p.protocol === "ws:") ||
        (p.port === "443" && p.protocol === "wss:"))
        p.port = "";
    p.searchParams.sort();
    p.hash = "";
    return p.toString();
}
const loadGiftwrapsFromStorage = async () => {
    try {
        const savedGiftwraps = await async_storage_1.default.getItem("giftwraps");
        return savedGiftwraps ? JSON.parse(savedGiftwraps) : [];
    }
    catch (e) {
        console.error("Error loading giftwraps from storage:", e);
        return [];
    }
};
exports.loadGiftwrapsFromStorage = loadGiftwrapsFromStorage;
const saveGiftwrapsToStorage = async (giftwraps) => {
    try {
        await async_storage_1.default.setItem("giftwraps", JSON.stringify(giftwraps));
    }
    catch (e) {
        console.error("Error saving giftwraps to storage:", e);
    }
};
exports.saveGiftwrapsToStorage = saveGiftwrapsToStorage;
const createContactListEvent = async (secretKey) => {
    const selfPublicKey = (0, nostr_tools_1.getPublicKey)(secretKey);
    let event = {
        kind: 3,
        tags: [["p", selfPublicKey]],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: selfPublicKey,
    };
    event = (0, nostr_tools_1.finalizeEvent)(event, secretKey);
    const messages = await Promise.allSettled(pool_1.pool.publish(["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"], event));
    console.log("Message from relays for contact list publish", messages);
};
exports.createContactListEvent = createContactListEvent;
//# sourceMappingURL=nostr.js.map