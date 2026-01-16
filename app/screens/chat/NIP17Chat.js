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
exports.NIP17Chat = void 0;
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const screen_1 = require("../../components/screen");
const utils_1 = require("@noble/hashes/utils");
const testProps_1 = require("../../utils/testProps");
const i18n_react_1 = require("@app/i18n/i18n-react");
const nostr_tools_1 = require("nostr-tools");
const nostr_1 = require("@app/utils/nostr");
const style_1 = require("./style");
const historyListItem_1 = require("./historyListItem");
const chatContext_1 = require("./chatContext");
const native_1 = require("@react-navigation/native");
const redux_1 = require("@app/store/redux");
const import_nsec_modal_1 = require("../../components/import-nsec/import-nsec-modal");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const generated_1 = require("@app/graphql/generated");
const UserSearchBar_1 = require("./UserSearchBar");
const GroupChatProvider_1 = require("./GroupChat/GroupChatProvider");
const searchListItem_1 = require("./searchListItem");
const contacts_1 = __importDefault(require("./contacts"));
const material_top_tabs_1 = require("@react-navigation/material-top-tabs");
const contactDetailsScreen_1 = __importDefault(require("./contactDetailsScreen"));
const Tab = (0, material_top_tabs_1.createMaterialTopTabNavigator)();
const NIP17Chat = () => {
    const styles = (0, style_1.useStyles)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data: dataAuthed } = (0, generated_1.useHomeAuthedQuery)({
        skip: !isAuthed,
        fetchPolicy: "network-only",
        errorPolicy: "all",
    });
    const { rumors, poolRef, profileMap, resetChat, activeSubscription, initializeChat } = (0, chatContext_1.useChatContext)();
    const [initialized, setInitialized] = (0, react_1.useState)(false);
    const [searchedUsers, setSearchedUsers] = (0, react_1.useState)([]);
    const [privateKey, setPrivateKey] = (0, react_1.useState)();
    const [showImportModal, setShowImportModal] = (0, react_1.useState)(false);
    const [skipMismatchCheck, setskipMismatchCheck] = (0, react_1.useState)(false);
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { userData } = (0, redux_1.useAppSelector)((state) => state.user);
    const navigation = (0, native_1.useNavigation)();
    const RootNavigator = (0, native_1.useNavigation)();
    const { groupMetadata } = (0, GroupChatProvider_1.useNostrGroupChat)();
    React.useEffect(() => {
        const unsubscribe = () => {
            console.log("unsubscribing");
            setInitialized(false);
        };
        async function initialize() {
            var _a;
            console.log("Initializing nip17 screen use effect");
            let secretKeyString = await (0, nostr_1.fetchSecretFromLocalStorage)();
            if (!secretKeyString) {
                console.log("Couldn't find secret key in local storage");
                setShowImportModal(true);
                return;
            }
            let secret = nostr_tools_1.nip19.decode(secretKeyString).data;
            setPrivateKey(secret);
            const accountNpub = (_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.npub;
            const storedNpub = nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(secret));
            if (!skipMismatchCheck && accountNpub && storedNpub !== accountNpub) {
                console.log("Account Info mismatch", accountNpub, storedNpub);
                setShowImportModal(true);
            }
            if (!activeSubscription)
                initializeChat();
            setInitialized(true);
        }
        if (!initialized && poolRef)
            initialize();
        return unsubscribe;
    }, [poolRef, isAuthed]);
    (0, native_1.useFocusEffect)(React.useCallback(() => {
        let isMounted = true;
        async function checkSecretKey() {
            var _a;
            if (!isMounted)
                return;
            let secretKeyString = await (0, nostr_1.fetchSecretFromLocalStorage)();
            if (!secretKeyString) {
                setShowImportModal(true);
                return;
            }
            let secret = nostr_tools_1.nip19.decode(secretKeyString).data;
            const accountNpub = (_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.npub;
            const storedNpub = nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(secret));
            if (!skipMismatchCheck && accountNpub && storedNpub !== accountNpub) {
                setShowImportModal(true);
            }
        }
        if (initialized) {
            setSearchedUsers([]);
            checkSecretKey();
        }
        return () => {
            isMounted = false;
        };
    }, [setSearchedUsers, dataAuthed, isAuthed, skipMismatchCheck]));
    let SearchBarContent;
    let ListEmptyContent;
    SearchBarContent = (<>
      <UserSearchBar_1.UserSearchBar setSearchedUsers={setSearchedUsers}/>
    </>);
    if (!initialized) {
        ListEmptyContent = (<react_native_1.View style={styles.activityIndicatorContainer}>
        <react_native_1.ActivityIndicator size="large" color={colors.primary}/>
      </react_native_1.View>);
    }
    else {
        ListEmptyContent = (<react_native_1.View style={styles.emptyListNoContacts}>
        <react_native_1.Text {...(0, testProps_1.testProps)(LL.ChatScreen.noChatsTitle())} style={styles.emptyListTitle}>
          {LL.ChatScreen.noChatsTitle()}
        </react_native_1.Text>
        <react_native_1.Text style={styles.emptyListText}>{LL.ChatScreen.noChatsYet()}</react_native_1.Text>
      </react_native_1.View>);
    }
    let groups = (0, nostr_1.convertRumorsToGroups)(rumors || []);
    let groupIds = Array.from(groups.keys()).sort((a, b) => {
        let groupARumors = groups.get(a) || [];
        let groupBRumors = groups.get(b) || [];
        let lastARumor = groupARumors[groupARumors.length ? groupARumors.length - 1 : 0];
        let lastBRumor = groupBRumors[groupBRumors.length ? groupBRumors.length - 1 : 0];
        return ((lastBRumor === null || lastBRumor === void 0 ? void 0 : lastBRumor.created_at) || 0) - ((lastARumor === null || lastARumor === void 0 ? void 0 : lastARumor.created_at) || 0);
    });
    const userPublicKey = privateKey ? (0, nostr_tools_1.getPublicKey)(privateKey) : null;
    const userProfile = userPublicKey ? profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(userPublicKey) : null;
    // Android status bar height
    const statusBarHeight = react_native_1.Platform.OS === "android" ? react_native_1.StatusBar.currentHeight || 0 : 0;
    return (<screen_1.Screen style={{ flex: 1 }}>
      <react_native_1.StatusBar translucent backgroundColor="transparent"/>
      {privateKey && !showImportModal ? (<react_native_1.View style={{ flex: 1, paddingTop: statusBarHeight }}>
          <Tab.Navigator screenOptions={({ route }) => {
                const label = "Profile";
                return {
                    // tabBarLabelStyle: { fontSize: 18, fontWeight: "600" },
                    // tabBarIndicatorStyle: { backgroundColor: "#60aa55" },
                    // tabBarIndicatorStyle: { backgroundColor: "#60aa55" },
                    tabBarIcon: ({ color }) => {
                        let iconName;
                        if (route.name === "Profile") {
                            iconName = "person";
                        }
                        if (route.name === "Chats") {
                            iconName = "chatbubble-ellipses-outline"; // Chat icon
                        }
                        else if (route.name === "Contacts") {
                            iconName = "people-outline"; // Contacts icon
                        }
                        else {
                            iconName = "person-circle-outline";
                        }
                        return <Ionicons_1.default name={iconName} size={24} color={color}/>;
                    },
                    tabBarShowLabel: false,
                    tabBarActiveTintColor: colors.primary,
                    tabBarIndicatorStyle: { backgroundColor: colors.primary },
                };
            }} style={{ borderColor: colors.primary }}>
            <Tab.Screen name="Chats">
              {() => (<react_native_1.View style={{ flex: 1 }}>
                  {SearchBarContent}
                  {searchedUsers.length !== 0 ? (<react_native_gesture_handler_1.FlatList contentContainerStyle={styles.listContainer} data={searchedUsers} ListEmptyComponent={ListEmptyContent} renderItem={({ item }) => (<searchListItem_1.SearchListItem item={item} userPrivateKey={privateKey}/>)} keyExtractor={(item) => item.id}/>) : (<react_native_1.View style={{ flex: 1, flexDirection: "column" }}>
                      {/* Signed in as */}
                      <react_native_1.View style={styles.usernameContainer}>
                        <react_native_1.Text style={styles.usernameText} onPress={() => { }}>
                          signed in as:{" "}
                          <react_native_1.Text style={{ color: colors.primary, fontWeight: "bold" }}>
                            {(userData === null || userData === void 0 ? void 0 : userData.username) ||
                        nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(privateKey))}
                          </react_native_1.Text>
                        </react_native_1.Text>
                      </react_native_1.View>
                      <react_native_1.TouchableOpacity onPress={() => RootNavigator.navigate("Nip29GroupChat", {
                        groupId: "support-group-id",
                    })} style={{ marginRight: 20, marginLeft: 20, marginBottom: 4 }}>
                        <react_native_1.View style={Object.assign({}, styles.itemContainer)}>
                          <react_native_1.View style={{
                        flexDirection: "row",
                        marginVertical: 4,
                    }}>
                            <react_native_1.Image source={groupMetadata.picture
                        ? { uri: groupMetadata.picture }
                        : require("../../assets/images/Flash-Mascot.png")} style={styles.communityPicture}/>
                            <react_native_1.View style={{
                        flexDirection: "column",
                        maxWidth: "80%",
                        alignItems: "flex-start",
                    }}>
                              <react_native_1.View style={{ flexDirection: "row", alignItems: "center" }}>
                                <react_native_1.Text style={Object.assign(Object.assign({}, styles.itemText), { fontWeight: "bold", marginBottom: 4, marginTop: 4 })}>
                                  {groupMetadata.name || "Support Group Chat"}
                                </react_native_1.Text>
                                <Ionicons_1.default name="checkmark-done-circle-outline" size={20} style={styles.verifiedIcon}/>
                              </react_native_1.View>
                              <react_native_1.Text style={Object.assign(Object.assign({}, styles.itemText), { marginTop: 4, marginBottom: 5 })} numberOfLines={3} // show max 3 lines
                 ellipsizeMode="tail" // add "..." at the end if overflowing
                >
                                {groupMetadata.about || "..."}
                              </react_native_1.Text>
                            </react_native_1.View>
                          </react_native_1.View>
                        </react_native_1.View>
                      </react_native_1.TouchableOpacity>
                      <react_native_gesture_handler_1.FlatList contentContainerStyle={styles.listContainer} data={groupIds} ListEmptyComponent={ListEmptyContent} scrollEnabled={true} renderItem={({ item }) => (<historyListItem_1.HistoryListItem item={item} userPrivateKey={privateKey} groups={groups}/>)} keyExtractor={(item) => item}/>
                    </react_native_1.View>)}
                </react_native_1.View>)}
            </Tab.Screen>
            <Tab.Screen name={`Profile: ${userProfile === null || userProfile === void 0 ? void 0 : userProfile.name}`} component={contactDetailsScreen_1.default} initialParams={{
                contactPubkey: (0, nostr_tools_1.getPublicKey)(privateKey),
                userPrivateKey: (0, utils_1.bytesToHex)(privateKey),
            }}/>
            <Tab.Screen name="Contacts">
              {() => (<react_native_1.View style={{ height: "100%" }}>
                  <contacts_1.default userPrivateKey={(0, utils_1.bytesToHex)(privateKey)}/>
                </react_native_1.View>)}
            </Tab.Screen>
          </Tab.Navigator>
        </react_native_1.View>) : (<react_native_1.Text>Loading your nostr keys...</react_native_1.Text>)}
      <import_nsec_modal_1.ImportNsecModal isActive={showImportModal} onCancel={() => {
            setShowImportModal(false);
        }} onSubmit={() => {
            resetChat();
        }}/>
    </screen_1.Screen>);
};
exports.NIP17Chat = NIP17Chat;
//# sourceMappingURL=NIP17Chat.js.map