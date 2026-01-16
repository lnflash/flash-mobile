"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchListItem = void 0;
const themed_1 = require("@rneui/themed");
const style_1 = require("./style");
const react_native_1 = require("react-native");
const native_1 = require("@react-navigation/native");
const nostr_tools_1 = require("nostr-tools");
const utils_1 = require("@noble/hashes/utils");
const chatContext_1 = require("./chatContext");
const nostr_1 = require("@app/utils/nostr");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const utils_2 = require("./utils");
const react_1 = require("react");
const react_native_2 = require("react-native");
const SearchListItem = ({ item, userPrivateKey, }) => {
    const { poolRef, contactsEvent } = (0, chatContext_1.useChatContext)();
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const isUserAdded = () => {
        if (!contactsEvent)
            return false;
        let existingContacts = (0, utils_2.getContactsFromEvent)(contactsEvent);
        return existingContacts.map((p) => p.pubkey).includes(item.id);
    };
    const styles = (0, style_1.useStyles)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const navigation = (0, native_1.useNavigation)();
    const getIcon = () => {
        let itemPubkey = item.groupId
            .split(",")
            .filter((p) => p !== (0, nostr_tools_1.getPublicKey)(userPrivateKey))[0];
        if (contactsEvent)
            return (0, utils_2.getContactsFromEvent)(contactsEvent).filter((c) => c.pubkey === itemPubkey)
                .length === 0
                ? "person-add"
                : "checkmark-outline";
        else
            return "person-add";
    };
    const handleAddContact = async () => {
        if (isUserAdded() || !poolRef)
            return;
        try {
            setIsLoading(true);
            await (0, nostr_1.addToContactList)(userPrivateKey, item.id, poolRef.current, () => Promise.resolve(true), contactsEvent);
        }
        catch (error) {
            console.error("Error adding contact:", error);
        }
        finally {
            setIsLoading(false);
        }
    };
    return (<themed_1.ListItem key={item.id} style={styles.item} containerStyle={styles.itemContainer} onPress={() => {
            navigation.navigate("messages", {
                groupId: item.groupId,
                userPrivateKey: (0, utils_1.bytesToHex)(userPrivateKey),
            });
        }}>
      <react_native_1.Image source={{
            uri: item.picture ||
                "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }} style={styles.profilePicture}/>
      <themed_1.ListItem.Content>
        <themed_1.ListItem.Title style={styles.itemText}>
          {item.alias ||
            item.username ||
            item.name ||
            item.lud16 ||
            nostr_tools_1.nip19.npubEncode(item.id)}
        </themed_1.ListItem.Title>
      </themed_1.ListItem.Content>

      {isLoading ? (<react_native_2.ActivityIndicator size="small" color={colors.primary}/>) : (<react_native_1.TouchableOpacity onPress={handleAddContact}>
          <Ionicons_1.default name={getIcon()} size={24} color={colors.primary}/>
        </react_native_1.TouchableOpacity>)}
    </themed_1.ListItem>);
};
exports.SearchListItem = SearchListItem;
//# sourceMappingURL=searchListItem.js.map