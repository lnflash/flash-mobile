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
exports.MessagesScreen = exports.Messages = void 0;
require("react-native-get-random-values");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const screen_1 = require("../../components/screen");
const themed_1 = require("@rneui/themed");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
const helper_1 = require("@app/utils/helper");
const react_native_chat_ui_1 = require("@flyerhq/react-native-chat-ui");
const chatMessage_1 = require("./chatMessage");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const nostr_tools_1 = require("nostr-tools");
const nostr_1 = require("@app/utils/nostr");
const react_1 = require("react");
const chatContext_1 = require("./chatContext");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const utils_1 = require("./utils");
const utils_2 = require("@noble/hashes/utils");
const Messages = ({ route }) => {
    let userPubkey = (0, nostr_tools_1.getPublicKey)((0, utils_2.hexToBytes)(route.params.userPrivateKey));
    let groupId = route.params.groupId;
    const { poolRef } = (0, chatContext_1.useChatContext)();
    const [profileMap, setProfileMap] = (0, react_1.useState)();
    const [preferredRelaysMap, setPreferredRelaysMap] = (0, react_1.useState)();
    function handleProfileEvent(event) {
        let profile = JSON.parse(event.content);
        setProfileMap((profileMap) => {
            let newProfileMap = profileMap || new Map();
            newProfileMap.set(event.pubkey, profile);
            return newProfileMap;
        });
    }
    (0, react_1.useEffect)(() => {
        let closer;
        if (poolRef) {
            closer = (0, nostr_1.fetchNostrUsers)(groupId.split(","), poolRef.current, handleProfileEvent);
            (0, nostr_1.fetchPreferredRelays)(groupId.split(","), poolRef.current).then((relayMap) => {
                setPreferredRelaysMap(relayMap);
            });
        }
        return () => {
            if (closer)
                closer.close();
        };
    }, [groupId, poolRef]);
    return (<exports.MessagesScreen userPubkey={userPubkey} groupId={route.params.groupId} profileMap={profileMap} preferredRelaysMap={preferredRelaysMap}/>);
};
exports.Messages = Messages;
const MessagesScreen = ({ userPubkey, groupId, profileMap, preferredRelaysMap, }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    let { rumors, poolRef } = (0, chatContext_1.useChatContext)();
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [initialized, setInitialized] = React.useState(false);
    const [messages, setMessages] = (0, react_1.useState)(new Map());
    const user = { id: userPubkey };
    const convertRumorsToMessages = (rumors) => {
        let chatSet = new Map();
        (rumors || []).forEach((r) => {
            chatSet.set(r.id, {
                author: { id: r.pubkey },
                createdAt: r.created_at * 1000,
                id: r.id,
                type: "text",
                text: r.content,
            });
        });
        return chatSet;
    };
    React.useEffect(() => {
        let isMounted = true;
        async function initialize() {
            if (poolRef)
                setInitialized(true);
        }
        if (!initialized)
            initialize();
        let chatRumors = (0, nostr_1.convertRumorsToGroups)(rumors).get(groupId);
        const lastRumor = (chatRumors || []).sort((a, b) => b.created_at - a.created_at)[0];
        if (lastRumor)
            (0, utils_1.updateLastSeen)(groupId, lastRumor.created_at);
        let newChatMap = new Map([...messages, ...convertRumorsToMessages(chatRumors || [])]);
        setMessages(newChatMap);
        return () => {
            isMounted = false;
        };
    }, [poolRef, rumors]);
    const handleSendPress = async (message) => {
        let textMessage = {
            author: user,
            createdAt: Date.now(),
            text: message.text,
            type: "text",
            id: message.text,
        };
        let sent = false;
        let onSent = (rumor) => {
            console.log("OnSent");
            if (!sent) {
                console.log("On sent setting");
                textMessage.id = rumor.id;
                setMessages((prevChat) => {
                    let newChatMap = new Map(prevChat);
                    newChatMap.set(textMessage.id, textMessage);
                    return newChatMap;
                });
                sent = true;
            }
        };
        let result = await (0, nostr_1.sendNip17Message)(groupId.split(","), message.text, preferredRelaysMap || new Map(), onSent);
        console.log("Output is", result);
        if (result.outputs.filter((output) => output.acceptedRelays.length !== 0).length === 0) {
            console.log("inside errored message");
            textMessage.metadata = { errors: true };
            textMessage.id = result.rumor.id;
            setMessages((prevChat) => {
                let newChatMap = new Map(prevChat);
                newChatMap.set(textMessage.id, textMessage);
                return newChatMap;
            });
        }
        console.log("setting message with metadata", textMessage);
    };
    return (<screen_1.Screen>
      <react_native_1.View style={styles.aliasView} key="profileView">
        <Ionicons_1.default name="arrow-back-outline" onPress={navigation.goBack} style={styles.backButton} key="backButton"/>
        <themed_1.Text type="p1" key="displayname">
          {groupId
            .split(",")
            .filter((p) => p !== userPubkey)
            .map((user) => {
            var _a, _b, _c;
            return (((_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(user)) === null || _a === void 0 ? void 0 : _a.name) ||
                ((_b = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(user)) === null || _b === void 0 ? void 0 : _b.username) ||
                ((_c = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(user)) === null || _c === void 0 ? void 0 : _c.lud16) ||
                nostr_tools_1.nip19.npubEncode(user).slice(0, 9) + "..");
        })
            .join(", ")}
        </themed_1.Text>
        <react_native_1.View style={{ display: "flex", flexDirection: "row" }} key="header">
          <galoy_icon_button_1.GaloyIconButton name={"lightning"} size="medium" 
    //text={LL.HomeScreen.pay()}
    style={{ margin: 5 }} onPress={() => {
            var _a;
            let ids = groupId.split(",");
            let recipientId = ids.filter((id) => id !== userPubkey)[0];
            navigation.navigate("sendBitcoinDestination", {
                username: (_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(recipientId)) === null || _a === void 0 ? void 0 : _a.lud16,
            });
        }} key="lightning-button"/>
          {groupId
            .split(",")
            .filter((p) => p !== userPubkey)
            .map((pubkey) => {
            var _a;
            return (<react_native_1.Image source={{
                    uri: ((_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(pubkey)) === null || _a === void 0 ? void 0 : _a.picture) ||
                        "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
                }} style={styles.userPic} key="profile-picture"/>);
        })}
        </react_native_1.View>
      </react_native_1.View>
      {!initialized && <react_native_1.ActivityIndicator />}
      <react_native_1.View style={styles.chatBodyContainer} key="chatContainer">
        <react_native_1.View style={styles.chatView} key="chatView">
          <react_native_safe_area_context_1.SafeAreaProvider>
            <react_native_chat_ui_1.Chat messages={Array.from(messages.values()).sort((a, b) => {
            return b.createdAt - a.createdAt;
        })} key="messages" onPreviewDataFetched={() => { }} onSendPress={handleSendPress} l10nOverride={{
            emptyChatPlaceholder: initialized
                ? helper_1.isIos
                    ? "No messages here yet"
                    : "..."
                : helper_1.isIos
                    ? "Fetching Messages..."
                    : "...",
        }} user={user} renderBubble={({ child, message, nextMessageInGroup }) => {
            return (<react_native_1.View style={{
                    backgroundColor: userPubkey === message.author.id ? "#8fbc8f" : "white",
                    borderRadius: 15,
                    overflow: "hidden",
                }}>
                    {child}
                  </react_native_1.View>);
        }} renderTextMessage={(message, nextMessage, prevMessage) => (<chatMessage_1.ChatMessage key={message.id} message={message} 
        // recipientId={userPubkey}
        nextMessage={nextMessage} prevMessage={prevMessage}/>)} flatListProps={{
            contentContainerStyle: {
                paddingTop: messages.size ? (react_native_1.Platform.OS == "ios" ? 50 : 0) : 100,
            },
        }} theme={Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme), { colors: Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme.colors), { inputBackground: colors._black, background: colors._lightGrey }), fonts: Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme.fonts), { sentMessageBodyTextStyle: Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme.fonts.sentMessageBodyTextStyle), { fontSize: 12 }) }) })}/>
          </react_native_safe_area_context_1.SafeAreaProvider>
        </react_native_1.View>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.MessagesScreen = MessagesScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    actionsContainer: {
        margin: 12,
    },
    aliasView: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingRight: 10,
        paddingLeft: 10,
        paddingBottom: 6,
        paddingTop: helper_1.isIos ? 40 : 10,
    },
    chatBodyContainer: {
        flex: 1,
    },
    chatView: {
        flex: 1,
        marginHorizontal: 30,
        borderRadius: 24,
        overflow: "hidden",
    },
    userPic: {
        borderRadius: 50,
        height: 50,
        width: 50,
        borderWidth: 1,
        borderColor: colors.green,
    },
    backButton: {
        fontSize: 26,
        color: colors.primary3,
    },
}));
//# sourceMappingURL=messages.js.map