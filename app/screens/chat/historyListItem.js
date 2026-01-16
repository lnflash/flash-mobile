"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryListItem = void 0;
const themed_1 = require("@rneui/themed");
const style_1 = require("./style");
const react_native_1 = require("react-native");
const nostr_tools_1 = require("nostr-tools");
const native_1 = require("@react-navigation/native");
const react_1 = require("react");
const chatContext_1 = require("./chatContext");
const nostr_1 = require("@app/utils/nostr");
const utils_1 = require("./utils");
const utils_2 = require("@noble/hashes/utils");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const HistoryListItem = ({ item, userPrivateKey, groups, }) => {
    var _a, _b, _c;
    const { poolRef, profileMap, addEventToProfiles } = (0, chatContext_1.useChatContext)();
    const [hasUnread, setHasUnread] = (0, react_1.useState)(false);
    const userPublicKey = userPrivateKey ? (0, nostr_tools_1.getPublicKey)(userPrivateKey) : "";
    const selfNote = item.split(",").length === 1;
    function handleProfileEvent(event) {
        addEventToProfiles(event);
    }
    (0, react_1.useEffect)(() => {
        let closer = null;
        if ((poolRef === null || poolRef === void 0 ? void 0 : poolRef.current) && !closer) {
            let fetchPubkeys = [];
            item.split(",").forEach((p) => {
                if (!(profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(p))) {
                    fetchPubkeys.push(p);
                }
            });
            if (fetchPubkeys.length !== 0)
                closer = (0, nostr_1.fetchNostrUsers)(fetchPubkeys, poolRef === null || poolRef === void 0 ? void 0 : poolRef.current, handleProfileEvent);
        }
        return () => {
            if (closer) {
                closer.close();
            }
        };
    }, [poolRef, profileMap]);
    (0, native_1.useFocusEffect)(() => {
        const checkUnreadStatus = async () => {
            const lastSeen = await (0, utils_1.getLastSeen)(item);
            const lastRumor = (groups.get(item) || []).sort((a, b) => b.created_at - a.created_at)[0];
            if (lastRumor && (!lastSeen || lastSeen < lastRumor.created_at)) {
                setHasUnread(true);
            }
            else {
                setHasUnread(false);
            }
        };
        checkUnreadStatus();
    });
    const styles = (0, style_1.useStyles)();
    const navigation = (0, native_1.useNavigation)();
    const lastRumor = (groups.get(item) || []).sort((a, b) => b.created_at - a.created_at)[0];
    return (<themed_1.ListItem key={item} style={styles.item} containerStyle={styles.itemContainer} onPress={() => navigation.navigate("messages", {
            groupId: item,
            userPrivateKey: (0, utils_2.bytesToHex)(userPrivateKey),
        })}>
      {item
            .split(",")
            .filter((p) => p !== userPublicKey)
            .map((p) => {
            var _a;
            return (<react_native_1.Image source={{
                    uri: ((_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(p)) === null || _a === void 0 ? void 0 : _a.picture) ||
                        "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
                }} style={styles.profilePicture} key={p}/>);
        })}
      {selfNote ? (<react_native_1.Image source={{
                uri: "https://cdn.pixabay.com/photo/2016/07/29/21/39/school-1555899_960_720.png",
            }} style={styles.selfNotePicture} key={"self-note-image"}/>) : null}
      <react_native_1.View style={{ flexDirection: "column", maxWidth: "80%" }}>
        <themed_1.ListItem.Content key="heading">
          <themed_1.ListItem.Subtitle style={styles.itemText} key="subheading">
            {" "}
            {item
            .split(",")
            .filter((p) => p !== userPublicKey)
            .map((pubkey) => {
            var _a, _b, _c;
            return (((_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(pubkey)) === null || _a === void 0 ? void 0 : _a.nip05) ||
                ((_b = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(pubkey)) === null || _b === void 0 ? void 0 : _b.name) ||
                ((_c = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(pubkey)) === null || _c === void 0 ? void 0 : _c.username) ||
                nostr_tools_1.nip19.npubEncode(pubkey).slice(0, 9) + "..");
        })
            .join(", ")}
            {selfNote ? (<react_native_1.View style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                <react_native_1.Text style={Object.assign(Object.assign({}, styles.itemText), { fontWeight: "bold" })}>
                  Note to Self
                </react_native_1.Text>
                <Ionicons_1.default name="checkmark-done-circle-outline" size={20} style={styles.verifiedIcon}></Ionicons_1.default>
              </react_native_1.View>) : null}
          </themed_1.ListItem.Subtitle>
        </themed_1.ListItem.Content>
        <themed_1.ListItem.Content key="last message">
          <react_native_1.View style={{
            flexWrap: "wrap",
            flexDirection: "row",
        }}>
            <react_native_1.Text style={Object.assign({}, styles.itemText)}>
              {((_a = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(lastRumor.pubkey)) === null || _a === void 0 ? void 0 : _a.name) ||
            ((_b = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(lastRumor.pubkey)) === null || _b === void 0 ? void 0 : _b.nip05) ||
            ((_c = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(lastRumor.pubkey)) === null || _c === void 0 ? void 0 : _c.username) ||
            nostr_tools_1.nip19.npubEncode(lastRumor.pubkey).slice(0, 9) + "..."}
              {": "}
              {lastRumor.content.replace(/\s+/g, " ").slice(0, 55)}
              {lastRumor.content.length > 45 ? "..." : ""}
            </react_native_1.Text>
          </react_native_1.View>
        </themed_1.ListItem.Content>
      </react_native_1.View>
      {hasUnread && <react_native_1.View style={styles.unreadIndicator}/>}
    </themed_1.ListItem>);
};
exports.HistoryListItem = HistoryListItem;
//# sourceMappingURL=historyListItem.js.map