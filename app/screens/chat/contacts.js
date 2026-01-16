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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const style_1 = require("./style");
const chatContext_1 = require("./chatContext");
const native_1 = require("@react-navigation/native"); // <-- Added useRoute, RouteProp
const themed_1 = require("@rneui/themed");
const UserSearchBar_1 = require("./UserSearchBar");
const searchListItem_1 = require("./searchListItem");
const utils_1 = require("@noble/curves/abstract/utils");
const utils_2 = require("./utils");
const contactCard_1 = __importDefault(require("./contactCard"));
const nostr_1 = require("@app/utils/nostr");
const i18n_react_1 = require("@app/i18n/i18n-react");
const Contacts = ({ userPrivateKey: propKey }) => {
    var _a;
    const baseStyles = (0, style_1.useStyles)();
    const [searchedUsers, setSearchedUsers] = (0, react_1.useState)([]);
    const { poolRef, profileMap, contactsEvent, addEventToProfiles } = (0, chatContext_1.useChatContext)();
    const navigation = (0, native_1.useNavigation)();
    // 3. Hook into the route to get params from Settings
    const route = (0, native_1.useRoute)();
    const { theme } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const colors = theme.colors;
    // 4. Determine the actual key to use
    // If passed as a prop (Tabs), use it. If not, look in navigation params (Settings).
    const realUserKey = propKey || ((_a = route.params) === null || _a === void 0 ? void 0 : _a.userPrivateKey);
    const [showAltMessage, setShowAltMessage] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const timer = setTimeout(() => {
            setShowAltMessage(true);
        }, 3000);
        return () => clearTimeout(timer);
    }, []);
    (0, react_1.useEffect)(() => {
        if (!poolRef)
            return;
        let contactPubkeys = (contactsEvent === null || contactsEvent === void 0 ? void 0 : contactsEvent.tags.filter((p) => p[0] === "p").map((p) => p[1])) || [];
        let closer = (0, nostr_1.fetchNostrUsers)(contactPubkeys, poolRef.current, (event) => {
            addEventToProfiles(event);
        });
        return () => {
            if (closer)
                closer.close();
        };
    }, [poolRef, contactsEvent]);
    // 5. Safety check: If we still don't have a key, handle it (optional but recommended)
    if (!realUserKey) {
        return (<react_native_1.View style={[{ flex: 1 }, { justifyContent: "center", alignItems: "center" }]}>
        <react_native_1.ActivityIndicator size="large" color={colors.primary}/>
      </react_native_1.View>);
    }
    // ... The rest of your styles and logic ...
    const styles = Object.assign(Object.assign({}, baseStyles), { container: {
            flex: 1,
        }, contactCardWrapper: {
            borderRadius: 8,
            marginBottom: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            elevation: 2,
        } });
    let ListEmptyContent = (<react_native_1.View style={styles.activityIndicatorContainer}>
      <react_native_1.ActivityIndicator size="large" color={colors.primary}/>
    </react_native_1.View>);
    const navigateToContactDetails = (contactPubkey) => {
        navigation.navigate("contactDetails", {
            contactPubkey,
            userPrivateKey: realUserKey, // Use the resolved key
        });
    };
    return (<react_native_1.View style={styles.container}>
      <UserSearchBar_1.UserSearchBar setSearchedUsers={setSearchedUsers}/>
      {searchedUsers.length !== 0 ? (<react_native_1.FlatList contentContainerStyle={styles.listContainer} data={searchedUsers} ListEmptyComponent={ListEmptyContent} renderItem={({ item }) => (<searchListItem_1.SearchListItem item={item} 
            // Use the resolved key here
            userPrivateKey={(0, utils_1.hexToBytes)(realUserKey)}/>)} keyExtractor={(item) => item.id}/>) : contactsEvent ? (<react_native_1.FlatList contentContainerStyle={Object.assign({}, styles.listContainer)} data={(0, utils_2.getContactsFromEvent)(contactsEvent)} ListEmptyComponent={<react_native_1.Text>{LL.Nostr.Contacts.noCantacts()}</react_native_1.Text>} renderItem={({ item }) => (<contactCard_1.default item={item} profileMap={profileMap} containerStyle={styles.itemContainer} style={styles.item} onPress={() => navigateToContactDetails(item.pubkey)}/>)} keyExtractor={(item) => item.pubkey}/>) : (<react_native_1.View style={styles.activityIndicatorContainer}>
          {showAltMessage ? (<>
              <react_native_1.ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }}/>
              <react_native_1.Text style={{ margin: 10, textAlign: "center" }}>
                {LL.Nostr.Contacts.stillLoading()}
              </react_native_1.Text>
            </>) : (<react_native_1.ActivityIndicator size="large" color={colors.primary}/>)}
        </react_native_1.View>)}
    </react_native_1.View>);
};
exports.default = Contacts;
//# sourceMappingURL=contacts.js.map