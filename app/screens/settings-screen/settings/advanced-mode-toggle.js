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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedModeToggle = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const amounts_1 = require("@app/types/amounts");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const react_native_1 = require("react-native");
const generated_1 = require("@app/graphql/generated");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const level_context_1 = require("@app/graphql/level-context");
const persistent_state_1 = require("@app/store/persistent-state");
const hooks_1 = require("@app/hooks");
const react_1 = require("react");
const advanced_mode_modal_1 = require("@app/components/advanced-mode-modal");
const Keychain = __importStar(require("react-native-keychain"));
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const AdvancedModeToggle = () => {
    var _a, _b;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { isAtLeastLevelZero } = (0, level_context_1.useLevel)();
    const navigation = (0, native_1.useNavigation)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { moneyAmountToDisplayCurrencyString } = (0, use_display_currency_1.useDisplayCurrency)();
    const [advanceModalVisible, setAdvanceModalVisible] = (0, react_1.useState)(false);
    const [hasRecoveryPhrase, setHasRecoveryPhrase] = (0, react_1.useState)(false);
    const isAdvanceMode = persistentState.isAdvanceMode;
    const { data } = (0, generated_1.useSettingsScreenQuery)({
        fetchPolicy: "cache-first",
        returnPartialData: true,
        skip: !isAtLeastLevelZero,
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    (0, react_1.useEffect)(() => {
        checkRecoveryPhrase();
    }, []);
    const checkRecoveryPhrase = async () => {
        const credentials = await Keychain.getInternetCredentials(breez_sdk_liquid_1.KEYCHAIN_MNEMONIC_KEY);
        if (credentials) {
            setHasRecoveryPhrase(true);
        }
    };
    const onUpdateState = (isAdvanceMode) => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { defaultWallet: isAdvanceMode ? state.defaultWallet : usdWallet, isAdvanceMode });
            return undefined;
        });
        navigation.reset({
            index: 0,
            routes: [{ name: "Primary" }],
        });
    };
    const toggleAdvanceMode = async () => {
        if (isAdvanceMode) {
            if (btcWallet.balance && btcWallet.balance > 0) {
                const btcWalletBalance = (0, amounts_1.toBtcMoneyAmount)(btcWallet.balance || 0);
                const convertedBalance = moneyAmountToDisplayCurrencyString({
                    moneyAmount: btcWalletBalance,
                    isApproximate: true,
                }) || "0";
                const btcBalanceWarning = LL.AccountScreen.btcBalanceWarning({
                    balance: convertedBalance,
                });
                const fullMessage = btcBalanceWarning + "\n" + LL.support.switchToBeginnerMode();
                react_native_1.Alert.alert(LL.common.warning(), fullMessage, [
                    { text: LL.common.cancel(), onPress: () => { } },
                    {
                        text: LL.common.yes(),
                        onPress: () => onUpdateState(false),
                    },
                ]);
            }
            else {
                onUpdateState(false);
            }
        }
        else {
            if (hasRecoveryPhrase) {
                onUpdateState(true);
            }
            else {
                setAdvanceModalVisible(true);
            }
        }
    };
    let leftIcon = isAdvanceMode ? "invert-mode-outline" : "invert-mode";
    let title = isAdvanceMode
        ? LL.SettingsScreen.beginnerMode()
        : LL.SettingsScreen.advanceMode();
    if (hasRecoveryPhrase) {
        leftIcon = isAdvanceMode ? "eye" : "eye-off";
        title = isAdvanceMode
            ? LL.SettingsScreen.hideBtcAccount()
            : LL.SettingsScreen.showBtcAccount();
    }
    if (react_native_1.Platform.OS === "ios" && Number(react_native_1.Platform.Version) < 13) {
        return null;
    }
    else {
        return (<>
        <row_1.SettingsRow title={title} leftIcon={leftIcon} action={toggleAdvanceMode} rightIcon={"sync-outline"}/>
        <advanced_mode_modal_1.AdvancedModeModal hasRecoveryPhrase={hasRecoveryPhrase} isVisible={advanceModalVisible} setIsVisible={setAdvanceModalVisible}/>
      </>);
    }
};
exports.AdvancedModeToggle = AdvancedModeToggle;
//# sourceMappingURL=advanced-mode-toggle.js.map