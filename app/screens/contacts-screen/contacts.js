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
exports.ContactsScreen = void 0;
const base_1 = require("@rneui/base");
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const screen_1 = require("../../components/screen");
const testProps_1 = require("../../utils/testProps");
const toast_1 = require("../../utils/toast");
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
(0, client_1.gql) `
  query contacts {
    me {
      id
      contacts {
        id
        username
        alias
        transactionsCount
      }
    }
  }
`;
const ContactsScreen = () => {
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const navigation = (0, native_1.useNavigation)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const [matchingContacts, setMatchingContacts] = (0, react_1.useState)([]);
    const [searchText, setSearchText] = (0, react_1.useState)("");
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { loading, data, error } = (0, generated_1.useContactsQuery)({
        skip: !isAuthed,
        fetchPolicy: "cache-and-network",
    });
    if (error) {
        (0, toast_1.toastShow)({ message: error.message });
    }
    const contacts = (0, react_1.useMemo)(() => {
        var _a, _b;
        return (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.contacts.slice()) !== null && _b !== void 0 ? _b : [];
    }, [data]);
    const reset = (0, react_1.useCallback)(() => {
        setSearchText("");
        setMatchingContacts(contacts);
    }, [contacts]);
    React.useEffect(() => {
        setMatchingContacts(contacts);
    }, [contacts]);
    // This implementation of search will cause a match if any word in the search text
    // matches the contacts name or prettyName.
    const updateMatchingContacts = (0, react_1.useCallback)((newSearchText) => {
        setSearchText(newSearchText);
        if (newSearchText.length > 0) {
            const searchWordArray = newSearchText
                .split(" ")
                .filter((text) => text.trim().length > 0);
            const matchingContacts = contacts.filter((contact) => searchWordArray.some((word) => wordMatchesContact(word, contact)));
            setMatchingContacts(matchingContacts);
        }
        else {
            setMatchingContacts(contacts);
        }
    }, [contacts]);
    const wordMatchesContact = (searchWord, contact) => {
        let contactPrettyNameMatchesSearchWord;
        const contactNameMatchesSearchWord = contact.username
            .toLowerCase()
            .includes(searchWord.toLowerCase());
        if (contact.alias) {
            contactPrettyNameMatchesSearchWord = contact.alias
                .toLowerCase()
                .includes(searchWord.toLowerCase());
        }
        else {
            contactPrettyNameMatchesSearchWord = false;
        }
        return contactNameMatchesSearchWord || contactPrettyNameMatchesSearchWord;
    };
    let SearchBarContent;
    let ListEmptyContent;
    if (contacts.length > 0) {
        SearchBarContent = (<base_1.SearchBar {...(0, testProps_1.testProps)(LL.common.search())} placeholder={LL.common.search()} value={searchText} onChangeText={updateMatchingContacts} platform="default" round showLoading={false} containerStyle={styles.searchBarContainer} inputContainerStyle={styles.searchBarInputContainerStyle} inputStyle={styles.searchBarText} rightIconContainerStyle={styles.searchBarRightIconStyle} searchIcon={<Ionicons_1.default name="search" size={24} color={styles.icon.color}/>} clearIcon={<Ionicons_1.default name="close" size={24} onPress={reset} color={styles.icon.color}/>}/>);
    }
    else {
        SearchBarContent = <></>;
    }
    if (contacts.length > 0) {
        ListEmptyContent = (<react_native_1.View style={styles.emptyListNoMatching}>
        <react_native_1.Text style={styles.emptyListTitle}>
          {LL.ContactsScreen.noMatchingContacts()}
        </react_native_1.Text>
      </react_native_1.View>);
    }
    else if (loading) {
        ListEmptyContent = (<react_native_1.View style={styles.activityIndicatorContainer}>
        <react_native_1.ActivityIndicator size="large" color={colors.primary}/>
      </react_native_1.View>);
    }
    else {
        ListEmptyContent = (<react_native_1.View style={styles.emptyListNoContacts}>
        <react_native_1.Text {...(0, testProps_1.testProps)(LL.ContactsScreen.noContactsTitle())} style={styles.emptyListTitle}>
          {LL.ContactsScreen.noContactsTitle()}
        </react_native_1.Text>
        <react_native_1.Text style={styles.emptyListText}>{LL.ContactsScreen.noContactsYet()}</react_native_1.Text>
      </react_native_1.View>);
    }
    return (<screen_1.Screen>
      {SearchBarContent}
      <react_native_gesture_handler_1.FlatList contentContainerStyle={styles.listContainer} data={matchingContacts} ListEmptyComponent={ListEmptyContent} renderItem={({ item }) => (<themed_1.ListItem key={item.username} style={styles.item} containerStyle={styles.itemContainer} onPress={() => navigation.navigate("contactDetail", { contact: item })}>
            <Ionicons_1.default name={"person-outline"} size={24} color={colors.primary}/>
            <themed_1.ListItem.Content>
              <themed_1.ListItem.Title style={styles.itemText}>{item.alias}</themed_1.ListItem.Title>
            </themed_1.ListItem.Content>
          </themed_1.ListItem>)} keyExtractor={(item) => item.username}/>
    </screen_1.Screen>);
};
exports.ContactsScreen = ContactsScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    activityIndicatorContainer: {
        alignItems: "center",
        flex: 1,
        justifyContent: "center",
    },
    emptyListNoContacts: {
        marginHorizontal: 12,
        marginTop: 32,
    },
    emptyListNoMatching: {
        marginHorizontal: 26,
        marginTop: 8,
    },
    emptyListText: {
        fontSize: 18,
        marginTop: 30,
        textAlign: "center",
        color: colors.black,
    },
    emptyListTitle: {
        color: colors.black,
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
    },
    item: {
        marginHorizontal: 32,
        marginVertical: 8,
    },
    itemContainer: {
        borderRadius: 8,
        backgroundColor: colors.grey5,
    },
    listContainer: { flexGrow: 1 },
    searchBarContainer: {
        backgroundColor: colors.white,
        borderBottomColor: colors.white,
        borderTopColor: colors.white,
        marginHorizontal: 26,
        marginVertical: 8,
    },
    searchBarInputContainerStyle: {
        backgroundColor: colors.grey5,
    },
    searchBarRightIconStyle: {
        padding: 8,
    },
    searchBarText: {
        color: colors.black,
        textDecorationLine: "none",
    },
    itemText: { color: colors.black },
    icon: {
        color: colors.black,
    },
}));
//# sourceMappingURL=contacts.js.map