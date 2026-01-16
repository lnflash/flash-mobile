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
exports.Delete = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
// components
const button_1 = require("../../button");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
// hooks
const hooks_1 = require("@app/hooks");
const use_logout_1 = __importDefault(require("@app/hooks/use-logout"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const use_nostr_profile_1 = __importDefault(require("@app/hooks/use-nostr-profile"));
const account_delete_context_1 = require("../account-delete-context");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const generated_1 = require("@app/graphql/generated");
// utils
const config_1 = require("@app/config");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const amounts_1 = require("@app/types/amounts");
const Delete = () => {
    var _a, _b;
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { cleanUp } = (0, use_logout_1.default)();
    const { deleteNostrData } = (0, use_nostr_profile_1.default)();
    const { formatMoneyAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const { setAccountIsBeingDeleted } = (0, account_delete_context_1.useAccountDeleteContext)();
    const [text, setText] = (0, react_1.useState)("");
    const [modalVisible, setModalVisible] = (0, react_1.useState)(false);
    const [deleteAccount] = (0, generated_1.useAccountDeleteMutation)({ fetchPolicy: "no-cache" });
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const usdWalletBalance = (0, amounts_1.toUsdMoneyAmount)(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance);
    const btcWalletBalance = (0, amounts_1.toBtcMoneyAmount)(btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance);
    let usdBalanceWarning = "";
    let btcBalanceWarning = "";
    let balancePositive = false;
    if (usdWalletBalance.amount > 0) {
        const balance = formatMoneyAmount && formatMoneyAmount({ moneyAmount: usdWalletBalance });
        usdBalanceWarning = LL.AccountScreen.usdBalanceWarning({ balance });
        balancePositive = true;
    }
    if (btcWalletBalance.amount > 0) {
        const balance = formatMoneyAmount && formatMoneyAmount({ moneyAmount: btcWalletBalance });
        btcBalanceWarning = LL.AccountScreen.btcBalanceWarning({ balance });
        balancePositive = true;
    }
    const fullMessage = (usdBalanceWarning +
        "\n" +
        btcBalanceWarning +
        "\n" +
        LL.support.deleteAccountBalanceWarning()).trim();
    const closeModal = () => {
        setModalVisible(false);
        setText("");
    };
    const deleteAccountAction = async () => {
        if (balancePositive) {
            react_native_1.Alert.alert(LL.common.warning(), fullMessage, [
                { text: LL.common.cancel(), onPress: () => { } },
                {
                    text: LL.common.yes(),
                    onPress: async () => setModalVisible(true),
                },
            ]);
        }
        else {
            setModalVisible(true);
        }
    };
    const deleteUserAccount = async () => {
        var _a, _b, _c, _d;
        try {
            navigation.setOptions({
                headerLeft: () => null,
                gestureEnabled: false, // Disables swipe to go back gesture
            });
            setAccountIsBeingDeleted(true);
            const res = await deleteAccount();
            if ((_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.accountDelete) === null || _b === void 0 ? void 0 : _b.success) {
                await deleteNostrData();
                await cleanUp(true);
                setAccountIsBeingDeleted(false);
                navigation.reset({
                    index: 0,
                    routes: [{ name: "getStarted" }],
                });
                react_native_1.Alert.alert(LL.support.bye(), LL.support.deleteAccountConfirmation(), [
                    {
                        text: LL.common.ok(),
                        onPress: () => { },
                    },
                ]);
            }
            else {
                react_native_1.Alert.alert(LL.common.error(), LL.support.deleteAccountError({ email: config_1.CONTACT_EMAIL_ADDRESS }) +
                    "\n\n" +
                    ((_d = (_c = res.data) === null || _c === void 0 ? void 0 : _c.accountDelete) === null || _d === void 0 ? void 0 : _d.errors[0].message));
            }
        }
        catch (err) {
            console.error(err);
            react_native_1.Alert.alert(LL.common.error(), LL.support.deleteAccountError({ email: config_1.CONTACT_EMAIL_ADDRESS }));
        }
    };
    const userWroteDelete = text.toLowerCase().trim() === LL.support.delete().toLocaleLowerCase().trim();
    const AccountDeletionModal = (<react_native_modal_1.default isVisible={modalVisible} onBackdropPress={closeModal} backdropOpacity={0.8} backdropColor={colors.white} avoidKeyboard={true}>
      <react_native_1.View style={styles.view}>
        <react_native_1.View style={styles.actionButtons}>
          <themed_1.Text type="h1" bold>
            {LL.support.deleteAccount()}
          </themed_1.Text>
          <galoy_icon_button_1.GaloyIconButton name="close" onPress={closeModal} size={"medium"}/>
        </react_native_1.View>
        <themed_1.Text type="p1">{LL.support.typeDelete({ delete: LL.support.delete() })}</themed_1.Text>
        <react_native_1.TextInput autoCapitalize="none" style={styles.textInput} onChangeText={setText} value={text} placeholder={LL.support.delete()} placeholderTextColor={colors.grey3}/>
        <react_native_1.View style={styles.actionButtons}>
          <galoy_primary_button_1.GaloyPrimaryButton title="Confirm" disabled={!userWroteDelete} onPress={() => {
            closeModal();
            react_native_1.Alert.alert(LL.support.finalConfirmationAccountDeletionTitle(), LL.support.finalConfirmationAccountDeletionMessage(), [
                { text: LL.common.cancel(), onPress: () => { } },
                { text: LL.common.ok(), onPress: () => deleteUserAccount() },
            ]);
        }}/>
          <galoy_secondary_button_1.GaloySecondaryButton title="Cancel" onPress={closeModal}/>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_modal_1.default>);
    return (<>
      <button_1.SettingsButton loading={loading} title={LL.support.deleteAccount()} variant="danger" onPress={deleteAccountAction}/>
      {AccountDeletionModal}
    </>);
};
exports.Delete = Delete;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    view: {
        marginHorizontal: 20,
        backgroundColor: colors.grey5,
        padding: 20,
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        rowGap: 20,
    },
    textInput: {
        fontSize: 16,
        backgroundColor: colors.grey4,
        padding: 12,
        color: colors.black,
        borderRadius: 8,
    },
    actionButtons: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
}));
//# sourceMappingURL=delete.js.map