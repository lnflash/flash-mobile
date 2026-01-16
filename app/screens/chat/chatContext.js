"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatContextProvider = exports.useChatContext = void 0;
const hooks_1 = require("@app/hooks");
const nostr_1 = require("@app/utils/nostr");
const nostr_tools_1 = require("nostr-tools");
const react_1 = __importDefault(require("react"));
const react_2 = require("react");
const publicRelays = [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://relay.staging.flashapp.me",
    "wss://relay.snort.social",
    "wss//nos.lol",
];
const ChatContext = (0, react_2.createContext)({
    giftwraps: [],
    setGiftWraps: () => { },
    rumors: [],
    setRumors: () => { },
    poolRef: undefined,
    profileMap: undefined,
    addEventToProfiles: (event) => { },
    resetChat: () => new Promise(() => { }),
    initializeChat: () => { },
    activeSubscription: null,
    userProfileEvent: null,
    userPublicKey: null,
    refreshUserProfile: async () => { },
    contactsEvent: undefined,
    setContactsEvent: (event) => { },
    getContactPubkeys: () => null,
});
const useChatContext = () => (0, react_2.useContext)(ChatContext);
exports.useChatContext = useChatContext;
const ChatContextProvider = ({ children }) => {
    const [giftwraps, setGiftWraps] = (0, react_2.useState)([]);
    const [rumors, setRumors] = (0, react_2.useState)([]);
    const [_, setLastEvent] = (0, react_2.useState)();
    const [closer, setCloser] = (0, react_2.useState)(null);
    const [userProfileEvent, setUserProfileEvent] = (0, react_2.useState)(null);
    const [userPublicKey, setUserPublicKey] = (0, react_2.useState)(null);
    const profileMap = (0, react_2.useRef)(new Map());
    const poolRef = (0, react_2.useRef)(new nostr_tools_1.SimplePool());
    const processedEventIds = (0, react_2.useRef)(new Set());
    const [contactsEvent, setContactsEvent] = (0, react_2.useState)();
    const { appConfig: { galoyInstance: { relayUrl }, }, } = (0, hooks_1.useAppConfig)();
    const handleGiftWraps = (event, secret) => {
        setGiftWraps((prevEvents) => [...(prevEvents || []), event]);
        try {
            let rumor = (0, nostr_1.getRumorFromWrap)(event, secret);
            setRumors((prevRumors) => {
                let previousRumors = prevRumors || [];
                if (!previousRumors.map((r) => r.id).includes(rumor)) {
                    return [...(prevRumors || []), rumor];
                }
                return prevRumors;
            });
        }
        catch (e) {
            console.log("Error in decrypting...", e);
        }
    };
    react_1.default.useEffect(() => {
        let closer;
        if (poolRef && !closer)
            initializeChat();
        async function initialize(count = 0) {
            let secretKeyString = await (0, nostr_1.fetchSecretFromLocalStorage)();
            if (!secretKeyString) {
                if (count >= 3)
                    return;
                setTimeout(() => initialize(count + 1), 500);
                return;
            }
            let secret = nostr_tools_1.nip19.decode(secretKeyString).data;
            const publicKey = (0, nostr_tools_1.getPublicKey)(secret);
            const cachedGiftwraps = await (0, nostr_1.loadGiftwrapsFromStorage)();
            setGiftWraps(cachedGiftwraps);
            let cachedRumors;
            cachedRumors = cachedGiftwraps
                .map((wrap) => {
                try {
                    return (0, nostr_1.getRumorFromWrap)(wrap, secret);
                }
                catch (e) {
                    return null;
                }
            })
                .filter((r) => r !== null);
            setRumors(cachedRumors || []);
            let closer = await fetchNewGiftwraps(cachedGiftwraps, publicKey);
            (0, nostr_1.fetchContactList)((0, nostr_tools_1.getPublicKey)(secret), (event) => {
                setContactsEvent(event);
            });
            setCloser(closer);
        }
        if (poolRef && !closer)
            initialize();
    }, [poolRef]);
    react_1.default.useEffect(() => {
        const initializeUserProfile = async () => {
            if (!poolRef.current || !userPublicKey)
                return;
            await refreshUserProfile();
        };
        if (userPublicKey) {
            initializeUserProfile();
        }
    }, [userPublicKey]);
    const refreshUserProfile = async () => {
        if (!poolRef.current)
            return;
        let publicKey = userPublicKey;
        if (!publicKey) {
            let secret = await (0, nostr_1.getSecretKey)();
            if (!secret) {
                setUserProfileEvent(null);
                return;
            }
            publicKey = (0, nostr_tools_1.getPublicKey)(secret);
            setUserPublicKey(publicKey);
        }
        (0, nostr_1.fetchContactList)(publicKey, (event) => {
            setContactsEvent(event);
        });
        return new Promise((resolve) => {
            (0, nostr_1.fetchNostrUsers)([publicKey], poolRef.current, (event, profileCloser) => {
                setUserProfileEvent(event);
                try {
                    let content = JSON.parse(event.content);
                    profileMap.current.set(event.pubkey, content);
                }
                catch (e) {
                    console.log("Couldn't parse the profile", e);
                }
                profileCloser.close();
                resolve();
            });
        });
    };
    const getContactPubkeys = () => {
        if (!contactsEvent)
            return null;
        return contactsEvent.tags
            .filter((t) => {
            if (t[0] === "p")
                return true;
            return false;
        })
            .map((t) => t[1]);
    };
    const initializeChat = async (count = 0) => {
        if (closer)
            closer.close();
        let secretKeyString = await (0, nostr_1.fetchSecretFromLocalStorage)();
        if (!secretKeyString) {
            if (count >= 3)
                return;
            setTimeout(() => initializeChat(count + 1), 500);
            return;
        }
        let secret = nostr_tools_1.nip19.decode(secretKeyString).data;
        const publicKey = (0, nostr_tools_1.getPublicKey)(secret);
        setUserPublicKey(publicKey);
        const cachedGiftwraps = await (0, nostr_1.loadGiftwrapsFromStorage)();
        setGiftWraps(cachedGiftwraps);
        let cachedRumors = [];
        try {
            cachedRumors = cachedGiftwraps.map((wrap) => (0, nostr_1.getRumorFromWrap)(wrap, secret));
        }
        catch (e) {
            console.log("ERROR WHILE DECRYPTING RUMORS", e);
        }
        setRumors(cachedRumors);
        let newCloser = await fetchNewGiftwraps(cachedGiftwraps, publicKey);
        setCloser(newCloser);
    };
    const fetchNewGiftwraps = async (cachedGiftwraps, publicKey) => {
        cachedGiftwraps = cachedGiftwraps.sort((a, b) => a.created_at - b.created_at);
        const lastCachedEvent = cachedGiftwraps[cachedGiftwraps.length - 1];
        let secretKeyString = await (0, nostr_1.fetchSecretFromLocalStorage)();
        if (!secretKeyString) {
            return null;
        }
        let secret = nostr_tools_1.nip19.decode(secretKeyString).data;
        let closer = (0, nostr_1.fetchGiftWrapsForPublicKey)(publicKey, (event) => {
            if (!processedEventIds.current.has(event.id)) {
                processedEventIds.current.add(event.id);
                setGiftWraps((prev) => {
                    const updatedGiftwraps = mergeGiftwraps(prev, [event]);
                    (0, nostr_1.saveGiftwrapsToStorage)(updatedGiftwraps);
                    return updatedGiftwraps;
                });
                let rumor = (0, nostr_1.getRumorFromWrap)(event, secret);
                setRumors((prevRumors) => {
                    let previousRumors = prevRumors || [];
                    if (!previousRumors.map((r) => r.id).includes(rumor)) {
                        return [...(prevRumors || []), rumor];
                    }
                    return prevRumors;
                });
            }
        }, poolRef.current, (lastCachedEvent === null || lastCachedEvent === void 0 ? void 0 : lastCachedEvent.created_at) - 20 * 60);
        return closer;
    };
    const mergeGiftwraps = (cachedGiftwraps, fetchedGiftwraps) => {
        const existingIds = new Set(cachedGiftwraps.map((wrap) => wrap.id));
        const newGiftwraps = fetchedGiftwraps.filter((wrap) => !existingIds.has(wrap.id));
        return [...cachedGiftwraps, ...newGiftwraps];
    };
    const addEventToProfiles = (event) => {
        try {
            let content = JSON.parse(event.content);
            profileMap.current.set(event.pubkey, content);
            setLastEvent(event);
        }
        catch (e) {
            console.log("Couldn't parse the profile");
        }
    };
    const resetChat = async () => {
        setGiftWraps([]);
        setRumors([]);
        setUserPublicKey(null);
        setUserProfileEvent(null);
        closer === null || closer === void 0 ? void 0 : closer.close();
        let secretKeyString = await (0, nostr_1.fetchSecretFromLocalStorage)();
        if (!secretKeyString)
            return;
        let secret = nostr_tools_1.nip19.decode(secretKeyString).data;
        const publicKey = (0, nostr_tools_1.getPublicKey)(secret);
        setUserPublicKey((0, nostr_tools_1.getPublicKey)(secret));
        let newCloser = (0, nostr_1.fetchGiftWrapsForPublicKey)(publicKey, (event) => handleGiftWraps(event, secret), poolRef.current);
        setCloser(newCloser);
    };
    return (<ChatContext.Provider value={{
            giftwraps,
            setGiftWraps,
            initializeChat,
            rumors,
            setRumors,
            poolRef,
            profileMap: profileMap.current,
            addEventToProfiles,
            resetChat,
            activeSubscription: closer,
            userProfileEvent,
            userPublicKey,
            refreshUserProfile,
            contactsEvent,
            setContactsEvent,
            getContactPubkeys,
        }}>
      {children}
    </ChatContext.Provider>);
};
exports.ChatContextProvider = ChatContextProvider;
//# sourceMappingURL=chatContext.js.map