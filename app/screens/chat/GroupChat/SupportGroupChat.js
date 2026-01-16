"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportGroupChatScreen = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const screen_1 = require("../../../components/screen");
const react_native_chat_ui_1 = require("@flyerhq/react-native-chat-ui");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const chatMessage_1 = require("../chatMessage");
const GroupChatProvider_1 = require("./GroupChatProvider");
const chatContext_1 = require("../chatContext");
const InnerGroupChat = () => {
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { messages, isMember, sendMessage, requestJoin } = (0, GroupChatProvider_1.useNostrGroupChat)();
    const { userPublicKey } = (0, chatContext_1.useChatContext)();
    const renderTextMessage = (message, showName, nextMessage) => {
        if (message.author.id === "system") {
            return (<react_native_1.View style={{ alignItems: "center", paddingVertical: 8, backgroundColor: "#e0e0e0" }}>
          <react_native_1.View style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 }}>
            <themed_1.Text style={{ fontSize: 12, color: "#555", textAlign: "center" }}>
              {message.text}
            </themed_1.Text>
          </react_native_1.View>
        </react_native_1.View>);
        }
        return (<chatMessage_1.ChatMessage key={message.id} message={message} showSender={!!showName} nextMessage={0} prevMessage={false}/>);
    };
    return (<screen_1.Screen>
      <react_native_safe_area_context_1.SafeAreaProvider>
        <react_native_1.View style={styles.chatView}>
          <react_native_chat_ui_1.Chat messages={messages} onSendPress={(partial) => sendMessage(partial.text)} user={{ id: userPublicKey || "me" }} renderTextMessage={(message, showName, nextMessage) => renderTextMessage(message, showName, nextMessage)} customBottomComponent={!isMember
            ? () => (<react_native_1.View style={{ padding: 16, alignItems: "center" }}>
                      <themed_1.Button title="Join Support Group" onPress={requestJoin}/>
                    </react_native_1.View>)
            : undefined} renderBubble={({ child, message }) => (<react_native_1.View style={{
                backgroundColor: message.author.id === "me" ? "#8fbc8f" : "white",
                borderRadius: 15,
                overflow: "hidden",
            }}>
                {child}
              </react_native_1.View>)} l10nOverride={{ emptyChatPlaceholder: "No messages yet..." }} flatListProps={{
            contentContainerStyle: {
                paddingTop: messages.length ? (react_native_1.Platform.OS === "ios" ? 50 : 0) : 100,
            },
        }} theme={Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme), { colors: Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme.colors), { inputBackground: colors._black, background: colors._lightGrey }), fonts: Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme.fonts), { sentMessageBodyTextStyle: Object.assign(Object.assign({}, react_native_chat_ui_1.defaultTheme.fonts.sentMessageBodyTextStyle), { fontSize: 12 }) }) })}/>
        </react_native_1.View>
      </react_native_safe_area_context_1.SafeAreaProvider>
    </screen_1.Screen>);
};
const SupportGroupChatScreen = ({ route, }) => {
    return <InnerGroupChat />;
};
exports.SupportGroupChatScreen = SupportGroupChatScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    chatView: {
        flex: 1,
        marginHorizontal: 30,
        borderRadius: 24,
        overflow: "hidden",
    },
}));
//# sourceMappingURL=SupportGroupChat.js.map