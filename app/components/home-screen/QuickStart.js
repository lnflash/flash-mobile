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
const react_native_reanimated_carousel_1 = __importDefault(require("react-native-reanimated-carousel"));
const themed_1 = require("@rneui/themed");
const Keychain = __importStar(require("react-native-keychain"));
// assets
const account_svg_1 = __importDefault(require("@app/assets/illustrations/account.svg"));
const dollar_svg_1 = __importDefault(require("@app/assets/illustrations/dollar.svg"));
const empty_flashcard_svg_1 = __importDefault(require("@app/assets/icons/empty-flashcard.svg"));
const non_custodial_wallet_svg_1 = __importDefault(require("@app/assets/illustrations/non-custodial-wallet.svg"));
const gold_wallet_svg_1 = __importDefault(require("@app/assets/illustrations/gold-wallet.svg"));
const secure_wallet_svg_1 = __importDefault(require("@app/assets/illustrations/secure-wallet.svg"));
const social_chat_svg_1 = __importDefault(require("@app/assets/illustrations/social-chat.svg"));
// components
const upgrade_account_modal_1 = require("../upgrade-account-modal");
const advanced_mode_modal_1 = require("../advanced-mode-modal");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const persistent_state_1 = require("@app/store/persistent-state");
const generated_1 = require("@app/graphql/generated");
// utils
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const width = react_native_1.Dimensions.get("window").width;
const QuickStart = () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const ref = (0, react_1.useRef)(null);
    const [advanceModalVisible, setAdvanceModalVisible] = (0, react_1.useState)(false);
    const [upgradeAccountModalVisible, setUpgradeAccountModalVisible] = (0, react_1.useState)(false);
    const [hasRecoveryPhrase, setHasRecoveryPhrase] = (0, react_1.useState)(false);
    const { data, loading } = (0, generated_1.useHomeAuthedQuery)();
    (0, react_1.useEffect)(() => {
        checkRecoveryPhrase();
    }, []);
    const checkRecoveryPhrase = async () => {
        const credentials = await Keychain.getInternetCredentials(breez_sdk_liquid_1.KEYCHAIN_MNEMONIC_KEY);
        if (credentials)
            setHasRecoveryPhrase(true);
    };
    let carouselData = [
        {
            type: "upgrade",
            title: LL.HomeScreen.upgradeTitle(),
            description: LL.HomeScreen.upgradeDesc(),
            image: account_svg_1.default,
            onPress: () => setUpgradeAccountModalVisible(true),
        },
        {
            type: "currency",
            title: LL.HomeScreen.currencyTitle(),
            description: LL.HomeScreen.currencyDesc(),
            image: dollar_svg_1.default,
            onPress: () => navigation.navigate("currency"),
        },
        {
            type: "flashcard",
            title: LL.HomeScreen.flashcardTitle(),
            description: LL.HomeScreen.flashcardDesc(),
            image: empty_flashcard_svg_1.default,
            onPress: () => navigation.navigate("Map"),
        },
        {
            type: "nonCustodialWallet",
            title: LL.HomeScreen.nonCustodialWalletTitle(),
            description: LL.HomeScreen.nonCustodialWalletDesc(),
            image: non_custodial_wallet_svg_1.default,
            onPress: () => {
                onHide("nonCustodialWallet");
                react_native_1.Linking.openURL("https://documentation.getflash.io/en/guides/non-custodial-wallets");
            },
        },
        {
            type: "email",
            title: LL.HomeScreen.emailTitle(),
            description: LL.HomeScreen.emailDesc(),
            image: account_svg_1.default,
            onPress: () => navigation.navigate("emailRegistrationInitiate"),
        },
        {
            type: "btcWallet",
            title: LL.HomeScreen.btcWalletTitle(),
            description: LL.HomeScreen.btcWalletDesc(),
            image: gold_wallet_svg_1.default,
            onPress: () => setAdvanceModalVisible(!advanceModalVisible),
        },
        {
            type: "backup",
            title: LL.HomeScreen.backupTitle(),
            description: LL.HomeScreen.backupDesc(),
            image: secure_wallet_svg_1.default,
            onPress: () => navigation.navigate("BackupOptions"),
        },
        {
            type: "socialPost",
            title: LL.NostrQuickStart.postHeading(),
            description: LL.NostrQuickStart.postDesc(),
            image: social_chat_svg_1.default,
            onPress: () => navigation.navigate("makeNostrPost"),
        },
    ];
    if (((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.level) !== generated_1.AccountLevel.Zero ||
        ((_b = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _b === void 0 ? void 0 : _b.includes("upgrade"))) {
        carouselData = carouselData.filter((el) => el.type !== "upgrade");
    }
    if (persistentState.currencyChanged ||
        ((_c = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _c === void 0 ? void 0 : _c.includes("currency"))) {
        carouselData = carouselData.filter((el) => el.type !== "currency");
    }
    if (persistentState.flashcardAdded ||
        ((_d = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _d === void 0 ? void 0 : _d.includes("flashcard"))) {
        carouselData = carouselData.filter((el) => el.type !== "flashcard");
    }
    if ((_e = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _e === void 0 ? void 0 : _e.includes("nonCustodialWallet")) {
        carouselData = carouselData.filter((el) => el.type !== "nonCustodialWallet");
    }
    if (((_f = data === null || data === void 0 ? void 0 : data.me) === null || _f === void 0 ? void 0 : _f.defaultAccount.level) === generated_1.AccountLevel.Zero ||
        !!((_h = (_g = data === null || data === void 0 ? void 0 : data.me) === null || _g === void 0 ? void 0 : _g.email) === null || _h === void 0 ? void 0 : _h.address) ||
        ((_j = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _j === void 0 ? void 0 : _j.includes("email"))) {
        carouselData = carouselData.filter((el) => el.type !== "email");
    }
    if (persistentState.isAdvanceMode ||
        ((_k = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _k === void 0 ? void 0 : _k.includes("btcWallet")) ||
        hasRecoveryPhrase) {
        carouselData = carouselData.filter((el) => el.type !== "btcWallet");
    }
    if (persistentState.backedUpBtcWallet ||
        !persistentState.isAdvanceMode ||
        ((_l = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _l === void 0 ? void 0 : _l.includes("backup"))) {
        carouselData = carouselData.filter((el) => el.type !== "backup");
    }
    if (!persistentState.chatEnabled ||
        persistentState.hasPostedToNostr ||
        ((_m = persistentState === null || persistentState === void 0 ? void 0 : persistentState.closedQuickStartTypes) === null || _m === void 0 ? void 0 : _m.includes("socialPost"))) {
        carouselData = carouselData.filter((el) => el.type !== "socialPost");
    }
    const onHide = (type) => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { closedQuickStartTypes: state.closedQuickStartTypes
                        ? [...state.closedQuickStartTypes, type]
                        : [type] });
            return undefined;
        });
    };
    const renderItem = ({ item, index }) => {
        const Image = item.image;
        return (<react_native_1.TouchableOpacity onPress={item.onPress} key={index} style={styles.itemContainer}>
        <Image height={width / 3} width={width / 3}/>
        <react_native_1.View style={styles.texts}>
          <themed_1.Text type="h1" bold style={styles.title}>
            {item.title}
          </themed_1.Text>
          <themed_1.Text type="bl">{item.description}</themed_1.Text>
        </react_native_1.View>
        <react_native_1.TouchableOpacity style={styles.close} onPress={() => onHide(item.type)}>
          <themed_1.Icon name={"close"} type="ionicon" color={colors.black} size={35}/>
        </react_native_1.TouchableOpacity>
      </react_native_1.TouchableOpacity>);
    };
    if (carouselData.length > 0) {
        return (<react_native_1.View>
        <react_native_reanimated_carousel_1.default ref={ref} width={width} height={width / 2.5} data={carouselData} renderItem={renderItem} mode="parallax" loop={carouselData.length !== 1} containerStyle={{ marginTop: 10 }}/>
        <upgrade_account_modal_1.UpgradeAccountModal isVisible={upgradeAccountModalVisible} closeModal={() => setUpgradeAccountModalVisible(false)}/>
        <advanced_mode_modal_1.AdvancedModeModal hasRecoveryPhrase={hasRecoveryPhrase} isVisible={advanceModalVisible} setIsVisible={setAdvanceModalVisible}/>
      </react_native_1.View>);
    }
    else {
        return <react_native_1.View style={{ height: 20 }}/>;
    }
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    itemContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: 20,
        borderColor: colors.black,
        padding: 10,
    },
    texts: {
        flex: 1,
    },
    title: {
        marginBottom: 2,
        width: "85%",
    },
    close: {
        position: "absolute",
        top: 0,
        right: 0,
        padding: 5,
    },
}));
exports.default = QuickStart;
//# sourceMappingURL=QuickStart.js.map