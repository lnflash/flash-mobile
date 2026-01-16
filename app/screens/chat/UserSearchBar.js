"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSearchBar = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const nostr_tools_1 = require("nostr-tools");
const react_1 = require("react");
const chatContext_1 = require("./chatContext");
const nostr_1 = require("@app/utils/nostr");
const style_1 = require("./style");
const hooks_1 = require("@app/hooks");
const testProps_1 = require("@app/utils/testProps");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const UserSearchBar = ({ setSearchedUsers }) => {
    const [searchText, setSearchText] = (0, react_1.useState)("");
    const { rumors, poolRef, addEventToProfiles, profileMap } = (0, chatContext_1.useChatContext)();
    const [refreshing, setRefreshing] = (0, react_1.useState)(false);
    const [privateKey, setPrivateKey] = (0, react_1.useState)(null);
    const styles = (0, style_1.useStyles)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const reset = (0, react_1.useCallback)(() => {
        setSearchText("");
        setSearchedUsers([]);
        setRefreshing(false);
    }, []);
    (0, react_1.useEffect)(() => {
        const initialize = async () => {
            let secretKeyString = await (0, nostr_1.fetchSecretFromLocalStorage)();
            if (secretKeyString)
                setPrivateKey(nostr_tools_1.nip19.decode(secretKeyString).data);
        };
        initialize();
    }, []);
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const searchedUsersHandler = (event, closer) => {
        let nostrProfile = JSON.parse(event.content);
        addEventToProfiles(event);
        let userPubkey = (0, nostr_tools_1.getPublicKey)(privateKey);
        let participants = [event.pubkey, userPubkey];
        setSearchedUsers([
            Object.assign(Object.assign({}, nostrProfile), { id: event.pubkey, groupId: (0, nostr_1.getGroupId)(participants) }),
        ]);
        closer.close();
    };
    const updateSearchResults = (0, react_1.useCallback)(async (newSearchText) => {
        if (newSearchText === "")
            reset();
        const nip05Matching = async (alias) => {
            let nostrUser = await nostr_tools_1.nip05.queryProfile(alias.toLocaleLowerCase());
            console.log("nostr user for", alias, nostrUser);
            if (nostrUser) {
                let nostrProfile = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(nostrUser.pubkey);
                let userPubkey = (0, nostr_tools_1.getPublicKey)(privateKey);
                let participants = [nostrUser.pubkey, userPubkey];
                setSearchedUsers([
                    Object.assign(Object.assign({ id: nostrUser.pubkey, username: alias }, nostrProfile), { groupId: (0, nostr_1.getGroupId)(participants) }),
                ]);
                if (!nostrProfile)
                    (0, nostr_1.fetchNostrUsers)([nostrUser.pubkey], poolRef.current, searchedUsersHandler);
                return true;
            }
            return false;
        };
        const aliasPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        if (!newSearchText) {
            setRefreshing(false);
        }
        setRefreshing(true);
        setSearchText(newSearchText);
        if (newSearchText.startsWith("npub1") && newSearchText.length == 63) {
            let hexPubkey = nostr_tools_1.nip19.decode(newSearchText).data;
            let userPubkey = (0, nostr_tools_1.getPublicKey)(privateKey);
            let participants = [hexPubkey, userPubkey];
            setSearchedUsers([{ id: hexPubkey, groupId: (0, nostr_1.getGroupId)(participants) }]);
            (0, nostr_1.fetchNostrUsers)([hexPubkey], poolRef.current, searchedUsersHandler);
            setRefreshing(false);
            return;
        }
        else if (newSearchText.match(aliasPattern)) {
            if (await nip05Matching(newSearchText)) {
                setRefreshing(false);
                return;
            }
        }
        else if (!newSearchText.includes("@")) {
            let modifiedSearchText = newSearchText + "@" + appConfig.galoyInstance.lnAddressHostname;
            console.log("Searching for", modifiedSearchText);
            if (await nip05Matching(modifiedSearchText)) {
                setRefreshing(false);
                return;
            }
        }
    }, [privateKey]);
    return privateKey ? (<themed_1.SearchBar {...(0, testProps_1.testProps)(LL.common.chatSearch())} placeholder={LL.common.chatSearch()} value={searchText} onChangeText={updateSearchResults} platform="default" round showLoading={refreshing && !!searchText} containerStyle={styles.searchBarContainer} inputContainerStyle={styles.searchBarInputContainerStyle} inputStyle={styles.searchBarText} rightIconContainerStyle={styles.searchBarRightIconStyle} searchIcon={<Ionicons_1.default name="search" size={24} color={styles.icon.color}/>} clearIcon={<Ionicons_1.default name="close" size={24} onPress={reset} color={styles.icon.color}/>}/>) : null;
};
exports.UserSearchBar = UserSearchBar;
//# sourceMappingURL=UserSearchBar.js.map