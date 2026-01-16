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
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const react_native_haptic_feedback_1 = __importDefault(require("react-native-haptic-feedback"));
// components
const send_flow_1 = require("@app/components/send-flow");
const screen_1 = require("@app/components/screen");
const buttons_1 = require("@app/components/buttons");
// hooks
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const use_send_payment_1 = require("./use-send-payment");
const hooks_1 = require("@app/hooks");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
// types
const amounts_1 = require("@app/types/amounts");
const generated_1 = require("@app/graphql/generated");
// utils
const analytics_1 = require("@app/utils/analytics");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const chatContext_1 = require("../chat/chatContext");
const nostr_1 = require("@app/utils/nostr");
const nostr_tools_1 = require("nostr-tools");
const require_contact_list_modal_1 = require("./require-contact-list-modal");
const SendBitcoinConfirmationScreen = ({ route, navigation }) => {
    var _a, _b;
    const { paymentDetail, flashUserAddress, feeRateSatPerVbyte, invoiceAmount } = route.params;
    const { paymentType, sendingWalletDescriptor, sendPaymentMutation, settlementAmount, isSendingMax, convertMoneyAmount, } = paymentDetail;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { formatDisplayAndWalletAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const [usdWalletText, setUsdWalletText] = (0, react_1.useState)("");
    const [btcWalletText, setBtcWalletText] = (0, react_1.useState)("");
    const [isValidAmount, setIsValidAmount] = (0, react_1.useState)(true);
    const [paymentError, setPaymentError] = (0, react_1.useState)();
    const [invalidAmountErr, setInvalidAmountErr] = (0, react_1.useState)();
    const [fee, setFee] = (0, react_1.useState)({ status: "loading" });
    const { contactsEvent, poolRef } = (0, chatContext_1.useChatContext)();
    const [npubByUsernameQuery] = (0, generated_1.useNpubByUsernameLazyQuery)();
    const { promptForContactList, ModalComponent: ConfirmOverwriteModal } = (0, require_contact_list_modal_1.useRequireContactList)();
    const { data } = (0, generated_1.useSendBitcoinConfirmationScreenQuery)({ skip: !(0, is_authed_context_1.useIsAuthed)() });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const { loading: sendPaymentLoading, sendPayment, hasAttemptedSend, } = (0, use_send_payment_1.useSendPayment)(sendPaymentMutation, paymentDetail, feeRateSatPerVbyte);
    (0, react_1.useEffect)(() => {
        setWalletText();
        validateAmount();
    }, [usdWallet, btcWallet, fee]);
    const setWalletText = () => {
        const btcBalanceMoneyAmount = (0, amounts_1.toBtcMoneyAmount)(btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance);
        const usdBalanceMoneyAmount = (0, amounts_1.toUsdMoneyAmount)(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance);
        const btcWalletText = formatDisplayAndWalletAmount({
            displayAmount: convertMoneyAmount(btcBalanceMoneyAmount, amounts_1.DisplayCurrency),
            walletAmount: btcBalanceMoneyAmount,
        });
        const usdWalletText = formatDisplayAndWalletAmount({
            displayAmount: convertMoneyAmount(usdBalanceMoneyAmount, amounts_1.DisplayCurrency),
            walletAmount: usdBalanceMoneyAmount,
        });
        setBtcWalletText(btcWalletText);
        setUsdWalletText(usdWalletText);
    };
    const validateAmount = () => {
        const btcBalanceMoneyAmount = (0, amounts_1.toBtcMoneyAmount)(btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance);
        const usdBalanceMoneyAmount = (0, amounts_1.toUsdMoneyAmount)(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance);
        if ((0, amounts_1.moneyAmountIsCurrencyType)(settlementAmount, generated_1.WalletCurrency.Btc) &&
            btcBalanceMoneyAmount &&
            !isSendingMax) {
            const totalAmount = (0, amounts_1.addMoneyAmounts)({
                a: settlementAmount,
                b: fee.amount || amounts_1.ZeroBtcMoneyAmount,
            });
            const validAmount = (0, amounts_1.lessThanOrEqualTo)({
                value: totalAmount,
                lessThanOrEqualTo: btcBalanceMoneyAmount,
            });
            if (!validAmount) {
                const invalidAmountErrorMessage = LL.SendBitcoinScreen.amountExceed({
                    balance: btcWalletText,
                });
                setInvalidAmountErr(invalidAmountErrorMessage);
            }
            setIsValidAmount(validAmount);
        }
        if ((0, amounts_1.moneyAmountIsCurrencyType)(settlementAmount, generated_1.WalletCurrency.Usd) &&
            usdBalanceMoneyAmount &&
            !isSendingMax) {
            const totalAmount = (0, amounts_1.addMoneyAmounts)({
                a: settlementAmount,
                b: fee.amount || amounts_1.ZeroUsdMoneyAmount,
            });
            const validAmount = (0, amounts_1.lessThanOrEqualTo)({
                value: totalAmount,
                lessThanOrEqualTo: usdBalanceMoneyAmount,
            });
            if (!validAmount) {
                const invalidAmountErrorMessage = LL.SendBitcoinScreen.amountExceed({
                    balance: usdWalletText,
                });
                setInvalidAmountErr(invalidAmountErrorMessage);
            }
            setIsValidAmount(validAmount);
        }
    };
    const autoAddContact = (0, react_1.useCallback)(async () => {
        var _a, _b;
        if (!flashUserAddress || !poolRef)
            return;
        try {
            const flashUsername = flashUserAddress.split("@")[0];
            const queryResult = await npubByUsernameQuery({
                variables: { username: flashUsername },
            });
            const destinationNpub = (_b = (_a = queryResult.data) === null || _a === void 0 ? void 0 : _a.npubByUsername) === null || _b === void 0 ? void 0 : _b.npub;
            if (!destinationNpub)
                return;
            const secretKey = await (0, nostr_1.getSecretKey)();
            if (!secretKey)
                return;
            await (0, nostr_1.addToContactList)(secretKey, nostr_tools_1.nip19.decode(destinationNpub).data, poolRef.current, promptForContactList, contactsEvent);
        }
        catch (err) {
            console.warn("Failed to auto-add flash user to contacts", err);
        }
    }, [
        flashUserAddress,
        poolRef,
        npubByUsernameQuery,
        promptForContactList,
        contactsEvent,
    ]);
    const handleSendPayment = (0, react_1.useCallback)(async () => {
        if (sendPayment && (sendingWalletDescriptor === null || sendingWalletDescriptor === void 0 ? void 0 : sendingWalletDescriptor.currency)) {
            console.log("Starting animation and sending payment");
            try {
                (0, analytics_1.logPaymentAttempt)({
                    paymentType: paymentDetail.paymentType,
                    sendingWallet: sendingWalletDescriptor.currency,
                });
                toggleActivityIndicator(true);
                const { status, errorsMessage } = await sendPayment();
                toggleActivityIndicator(false);
                (0, analytics_1.logPaymentResult)({
                    paymentType: paymentDetail.paymentType,
                    paymentStatus: status,
                    sendingWallet: sendingWalletDescriptor.currency,
                });
                if (status === "SUCCESS" || status === "PENDING") {
                    navigation.navigate("sendBitcoinSuccess", {
                        walletCurrency: sendingWalletDescriptor.currency,
                        unitOfAccountAmount: sendingWalletDescriptor.currency === "USD" && invoiceAmount
                            ? invoiceAmount
                            : paymentDetail.unitOfAccountAmount,
                        onSuccessAddContact: autoAddContact,
                    });
                    react_native_haptic_feedback_1.default.trigger("notificationSuccess", {
                        ignoreAndroidSystemSettings: true,
                    });
                }
                else if (status === "ALREADY_PAID") {
                    setPaymentError("Invoice is already paid");
                    react_native_haptic_feedback_1.default.trigger("notificationError", {
                        ignoreAndroidSystemSettings: true,
                    });
                }
                else {
                    setPaymentError(errorsMessage || "Something went wrong");
                    react_native_haptic_feedback_1.default.trigger("notificationError", {
                        ignoreAndroidSystemSettings: true,
                    });
                }
            }
            catch (err) {
                if (err instanceof Error) {
                    (0, crashlytics_1.getCrashlytics)().recordError(err);
                    setPaymentError(err.message || err.toString());
                }
            }
        }
        else {
            return null;
        }
    }, [paymentType, sendPayment, sendingWalletDescriptor === null || sendingWalletDescriptor === void 0 ? void 0 : sendingWalletDescriptor.currency]);
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader">
      <send_flow_1.ConfirmationDestinationAmountNote paymentDetail={paymentDetail} invoiceAmount={invoiceAmount}/>
      <send_flow_1.ConfirmationWalletFee flashUserAddress={flashUserAddress} paymentDetail={paymentDetail} btcWalletText={btcWalletText} usdWalletText={usdWalletText} feeRateSatPerVbyte={feeRateSatPerVbyte} fee={fee} setFee={setFee} setPaymentError={setPaymentError}/>
      <send_flow_1.ConfirmationError paymentError={paymentError} invalidAmountErrorMessage={invalidAmountErr}/>
      <react_native_1.View style={styles.buttonContainer}>
        <buttons_1.PrimaryBtn loading={sendPaymentLoading} label={LL.SendBitcoinConfirmationScreen.title()} disabled={!isValidAmount || hasAttemptedSend} onPress={handleSendPayment}/>
      </react_native_1.View>
      <ConfirmOverwriteModal />
    </screen_1.Screen>);
};
exports.default = SendBitcoinConfirmationScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    buttonContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
}));
//# sourceMappingURL=send-bitcoin-confirmation-screen.js.map