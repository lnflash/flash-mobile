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
exports.getMatchingCurrencies = exports.wordMatchesCurrency = exports.DisplayCurrencyScreen = void 0;
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const client_1 = require("@apollo/client");
const native_1 = require("@react-navigation/native");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
// components
const screen_1 = require("../../components/screen");
const buttons_1 = require("@app/components/buttons");
const ActivityIndicatorContext_1 = require("@app/contexts/ActivityIndicatorContext");
const menu_select_1 = require("@app/components/menu-select");
// hooks
const persistent_state_1 = require("@app/store/persistent-state");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
// gql
const generated_1 = require("@app/graphql/generated");
// utils
const testProps_1 = require("@app/utils/testProps");
(0, client_1.gql) `
  mutation accountUpdateDisplayCurrency($input: AccountUpdateDisplayCurrencyInput!) {
    accountUpdateDisplayCurrency(input: $input) {
      errors {
        message
      }
      account {
        id
        displayCurrency
      }
    }
  }
`;
const DisplayCurrencyScreen = () => {
    var _a, _b;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const navigation = (0, native_1.useNavigation)();
    const [newCurrency, setNewCurrency] = (0, react_1.useState)("");
    const [searchText, setSearchText] = (0, react_1.useState)("");
    const [matchingCurrencies, setMatchingCurrencies] = (0, react_1.useState)([]);
    const { updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const [updateDisplayCurrency] = (0, generated_1.useAccountUpdateDisplayCurrencyMutation)();
    const { data: dataAuthed } = (0, generated_1.useDisplayCurrencyQuery)({ skip: !isAuthed });
    const { data, loading } = (0, generated_1.useCurrencyListQuery)({
        fetchPolicy: "cache-and-network",
        skip: !isAuthed,
    });
    const displayCurrency = (_b = (_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.displayCurrency;
    (0, react_1.useEffect)(() => {
        (data === null || data === void 0 ? void 0 : data.currencyList) && setMatchingCurrencies(data.currencyList.slice());
    }, [data === null || data === void 0 ? void 0 : data.currencyList]);
    const reset = () => {
        var _a, _b;
        setSearchText("");
        setMatchingCurrencies((_b = (_a = data === null || data === void 0 ? void 0 : data.currencyList) === null || _a === void 0 ? void 0 : _a.slice()) !== null && _b !== void 0 ? _b : []);
    };
    const updateMatchingCurrency = (0, react_1.useCallback)((newSearchText) => {
        if (!(data === null || data === void 0 ? void 0 : data.currencyList)) {
            return;
        }
        setSearchText(newSearchText);
        const currencies = data.currencyList.slice();
        const matchSearch = (0, exports.getMatchingCurrencies)(newSearchText, currencies);
        const currencyWithSearch = newSearchText.length > 0 ? matchSearch : currencies;
        // make sure the display currency is always in the list
        if (!currencyWithSearch.find((c) => c.id === displayCurrency)) {
            const currency = currencies.find((c) => c.id === displayCurrency);
            currency && currencyWithSearch.push(currency);
        }
        // sort to make sure selection currency always on top
        currencyWithSearch.sort((a, b) => {
            if (a.id === displayCurrency) {
                return -1;
            }
            if (b.id === displayCurrency) {
                return 1;
            }
            return 0;
        });
        setMatchingCurrencies(currencyWithSearch);
    }, [data === null || data === void 0 ? void 0 : data.currencyList, displayCurrency]);
    const handleCurrencyChange = async (currencyId) => {
        if (loading)
            return;
        await updateDisplayCurrency({
            variables: { input: { currency: currencyId } },
            refetchQueries: [generated_1.RealtimePriceDocument],
        });
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { currencyChanged: true });
            return undefined;
        });
        setNewCurrency(currencyId);
    };
    const handleSave = () => {
        navigation.dispatch(native_1.CommonActions.reset({
            index: 0,
            routes: [{ name: "Primary" }],
        }));
    };
    if (loading)
        return <ActivityIndicatorContext_1.Loading />;
    if (!(data === null || data === void 0 ? void 0 : data.currencyList)) {
        return (<react_native_1.View style={styles.errorContainer}>
        <themed_1.Text type="h1">{LL.DisplayCurrencyScreen.errorLoading()}</themed_1.Text>
      </react_native_1.View>);
    }
    return (<screen_1.Screen>
      <themed_1.SearchBar {...(0, testProps_1.testProps)(LL.common.search())} placeholder={LL.common.search()} value={searchText} onChangeText={updateMatchingCurrency} platform="default" round showLoading={false} containerStyle={styles.searchBarContainer} inputContainerStyle={styles.searchBarInputContainerStyle} inputStyle={styles.searchBarText} rightIconContainerStyle={styles.searchBarRightIconStyle} searchIcon={<Ionicons_1.default name="search" size={24}/>} clearIcon={<Ionicons_1.default name="close" size={24} onPress={reset}/>}/>
      <react_native_1.ScrollView>
        <menu_select_1.MenuSelect value={newCurrency || displayCurrency || ""} onChange={handleCurrencyChange}>
          {matchingCurrencies.map((currency) => (<menu_select_1.MenuSelectItem key={currency.id} value={currency.id}>
              {currency.id} - {currency.name} {currency.flag && `- ${currency.flag}`}
            </menu_select_1.MenuSelectItem>))}
        </menu_select_1.MenuSelect>
      </react_native_1.ScrollView>
      <buttons_1.PrimaryBtn label={LL.common.confirm()} onPress={handleSave} btnStyle={styles.buttonContainer}/>
    </screen_1.Screen>);
};
exports.DisplayCurrencyScreen = DisplayCurrencyScreen;
const wordMatchesCurrency = (searchWord, currency) => {
    const matchForName = currency.name.toLowerCase().includes(searchWord.toLowerCase());
    const matchForId = currency.id.toLowerCase().includes(searchWord.toLowerCase());
    return matchForName || matchForId;
};
exports.wordMatchesCurrency = wordMatchesCurrency;
const getMatchingCurrencies = (searchText, currencies) => {
    const searchWordArray = searchText.split(" ").filter((text) => text.trim().length > 0);
    return currencies.filter((currency) => searchWordArray.some((word) => (0, exports.wordMatchesCurrency)(word, currency)));
};
exports.getMatchingCurrencies = getMatchingCurrencies;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    errorContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    searchBarContainer: {
        backgroundColor: colors.white,
        borderBottomWidth: 0,
        borderTopWidth: 0,
        marginHorizontal: 26,
        marginVertical: 8,
        paddingTop: 8,
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
    buttonContainer: {
        margin: 20,
    },
}));
//# sourceMappingURL=display-currency-screen.js.map