"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetDefaultAccountModal = void 0;
const react_1 = __importDefault(require("react"));
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// hooks
const hooks_1 = require("@app/hooks");
const client_1 = require("@apollo/client");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const generated_1 = require("@app/graphql/generated");
const persistent_state_1 = require("@app/store/persistent-state");
// utils
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const client_only_query_1 = require("@app/graphql/client-only-query");
// assets
const cash_svg_1 = __importDefault(require("@app/assets/icons/cash.svg"));
const bitcoin_svg_1 = __importDefault(require("@app/assets/icons/bitcoin.svg"));
const SetDefaultAccountModal = ({ isVisible, toggleModal }) => {
    var _a, _b;
    const navigation = (0, native_1.useNavigation)();
    const client = (0, client_1.useApolloClient)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const { data } = (0, generated_1.useSetDefaultAccountModalQuery)({
        fetchPolicy: "cache-only",
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const onPressHandler = (currency) => {
        let defaultWallet = usdWallet;
        if (currency === "BTC") {
            defaultWallet = btcWallet;
        }
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { defaultWallet });
            return undefined;
        });
        (0, client_only_query_1.setHasPromptedSetDefaultAccount)(client);
        toggleModal();
        navigation.navigate("receiveBitcoin");
    };
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.7} backdropColor={colors.grey3} backdropTransitionOutTiming={0} avoidKeyboard={true}>
      <react_native_1.View style={styles.container}>
        <react_native_1.TouchableOpacity style={styles.closeIcon} onPress={toggleModal}>
          <themed_1.Icon name="close" size={30} type="ionicon" color={colors.black}/>
        </react_native_1.TouchableOpacity>
        <themed_1.Text type="h1" bold style={styles.text}>
          {LL.SetAccountModal.title()}
        </themed_1.Text>
        <themed_1.Text type={"p1"} style={styles.text}>
          {LL.SetAccountModal.description()}
        </themed_1.Text>
        <react_native_1.View style={styles.modalActionsContainer}>
          <react_native_1.TouchableOpacity style={styles.button} onPress={() => onPressHandler("USD")}>
            <cash_svg_1.default />
            <react_native_1.View style={styles.buttonText}>
              <themed_1.Text type={"h1"}>{LL.common.stablesatsUsd()}</themed_1.Text>
              <themed_1.Text type={"p3"}>{LL.SetAccountModal.stablesatsTag()}</themed_1.Text>
            </react_native_1.View>
          </react_native_1.TouchableOpacity>
          <react_native_1.TouchableOpacity style={styles.button} onPress={() => onPressHandler("BTC")}>
            <bitcoin_svg_1.default />
            <react_native_1.View style={styles.buttonText}>
              <themed_1.Text type={"h1"}>{LL.common.bitcoin()}</themed_1.Text>
              <themed_1.Text type={"p3"}>{LL.SetAccountModal.bitcoinTag()}</themed_1.Text>
            </react_native_1.View>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.SetDefaultAccountModal = SetDefaultAccountModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    button: {
        minHeight: 90,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 20,
        columnGap: 12,
        padding: 12,
        backgroundColor: colors.grey4,
    },
    buttonText: {
        flex: 1,
    },
    container: {
        maxHeight: "80%",
        borderRadius: 20,
        padding: 20,
        backgroundColor: colors.white,
    },
    text: {
        marginBottom: 10,
        textAlign: "center",
    },
    modalActionsContainer: {
        rowGap: 10,
        marginTop: 10,
    },
    closeIcon: {
        width: "100%",
        alignItems: "flex-end",
    },
}));
//# sourceMappingURL=set-default-account-modal.js.map