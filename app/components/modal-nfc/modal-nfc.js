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
exports.ModalNfc = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const react_native_nfc_manager_1 = __importStar(require("react-native-nfc-manager"));
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const config_1 = require("@app/config");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const payment_destination_1 = require("@app/screens/send-bitcoin-screen/payment-destination");
const index_types_1 = require("@app/screens/send-bitcoin-screen/payment-destination/index.types");
const amounts_1 = require("@app/types/amounts");
const analytics_1 = require("@app/utils/analytics");
const base_1 = require("@rneui/base");
const themed_1 = require("@rneui/themed");
const galoy_secondary_button_1 = require("../atomic/galoy-secondary-button");
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const ModalNfc = ({ isActive, setIsActive, settlementAmount, receiveViaNFC, onPaid, note }) => {
    var _a, _b;
    const { data } = (0, generated_1.useScanningQrCodeScreenQuery)({ skip: !(0, is_authed_context_1.useIsAuthed)() });
    const wallets = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.wallets;
    const bitcoinNetwork = (_b = data === null || data === void 0 ? void 0 : data.globals) === null || _b === void 0 ? void 0 : _b.network;
    const [accountDefaultWalletQuery] = (0, generated_1.useAccountDefaultWalletLazyQuery)({
        fetchPolicy: "no-cache",
    });
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const dismiss = React.useCallback(() => {
        setIsActive(false);
        react_native_nfc_manager_1.default.cancelTechnologyRequest();
    }, [setIsActive]);
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    React.useEffect(() => {
        if (isActive && !settlementAmount) {
            react_native_1.Alert.alert(LL.ReceiveScreen.enterAmountFirst());
            setIsActive(false);
            return;
        }
        if (!convertMoneyAmount)
            return;
        if (isActive &&
            settlementAmount &&
            convertMoneyAmount &&
            convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(settlementAmount === null || settlementAmount === void 0 ? void 0 : settlementAmount.amount), generated_1.WalletCurrency.Btc)
                .amount === 0) {
            react_native_1.Alert.alert(LL.ReceiveScreen.cantReceiveZeroSats());
            setIsActive(false);
            return;
        }
        if (!LL ||
            !wallets ||
            !bitcoinNetwork ||
            !isActive ||
            !receiveViaNFC ||
            !settlementAmount) {
            return;
        }
        const init = async () => {
            var _a, _b;
            let result;
            let lnurl;
            try {
                const isSupported = await react_native_nfc_manager_1.default.isSupported();
                if (!isSupported) {
                    react_native_1.Alert.alert(LL.SettingsScreen.nfcNotSupported());
                    dismiss();
                    return;
                }
                console.log("starting scanNFCTag");
                react_native_nfc_manager_1.default.start();
                await react_native_nfc_manager_1.default.requestTechnology(react_native_nfc_manager_1.NfcTech.Ndef);
                const tag = await react_native_nfc_manager_1.default.getTag();
                result = (_a = tag === null || tag === void 0 ? void 0 : tag.ndefMessage) === null || _a === void 0 ? void 0 : _a.find((record) => {
                    const payload = record.payload;
                    const payloadString = react_native_nfc_manager_1.Ndef.text.decodePayload(new Uint8Array(payload));
                    console.log("decodedPayloadString: " + payloadString);
                    if (payloadString.toLowerCase().includes("lnurl")) {
                        return record;
                    }
                    return false;
                });
                if (!result) {
                    react_native_1.Alert.alert(LL.SettingsScreen.nfcNotCompatible());
                    dismiss();
                    return;
                }
                lnurl = react_native_nfc_manager_1.Ndef.text.decodePayload(new Uint8Array(result.payload));
            }
            catch (error) {
                if (!base_1.isIOS) {
                    // TODO: error that show as an Alert or onscreen message
                    // but only when it's not user initiated
                    // currently error returned is empty
                    react_native_1.Alert.alert(LL.SettingsScreen.nfcError());
                }
                console.error({ error }, `can't fetch the Ndef payload`);
                dismiss();
                return;
            }
            // TODO: add a loading icon because this call do a fetch() to an external server
            // and the response can be arbitrary long
            if ((settlementAmount === null || settlementAmount === void 0 ? void 0 : settlementAmount.currency) === "USD") {
                const destination = await (0, payment_destination_1.parseDestination)({
                    rawInput: lnurl,
                    myWalletIds: wallets.map((wallet) => wallet.id),
                    bitcoinNetwork,
                    lnurlDomains: config_1.LNURL_DOMAINS,
                    accountDefaultWalletQuery,
                });
                (0, analytics_1.logParseDestinationResult)(destination);
                if (destination.valid && settlementAmount && convertMoneyAmount) {
                    if (destination.destinationDirection === index_types_1.DestinationDirection.Send) {
                        react_native_1.Alert.alert(LL.SettingsScreen.nfcOnlyReceive());
                    }
                    else {
                        let amount = settlementAmount.amount;
                        if (settlementAmount.currency === generated_1.WalletCurrency.Usd) {
                            amount = convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(settlementAmount.amount), generated_1.WalletCurrency.Btc).amount;
                        }
                        destination.validDestination.minWithdrawable = amount * 1000; // coz msats
                        destination.validDestination.maxWithdrawable = amount * 1000; // coz msats
                        receiveViaNFC(destination);
                    }
                }
            }
            else {
                try {
                    const input = await (0, react_native_breez_sdk_liquid_1.parse)(lnurl);
                    if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_WITHDRAW) {
                        const lnUrlWithdrawResult = await (0, react_native_breez_sdk_liquid_1.lnurlWithdraw)({
                            data: input.data,
                            amountMsat: settlementAmount.amount * 1000,
                            description: note,
                        });
                        console.log(lnUrlWithdrawResult);
                        if (lnUrlWithdrawResult.type === react_native_breez_sdk_liquid_1.LnUrlWithdrawResultVariant.OK) {
                            onPaid();
                        }
                        else {
                            alert(lnUrlWithdrawResult.data || LL.RedeemBitcoinScreen.redeemingError());
                        }
                    }
                    else if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_ERROR) {
                        alert(((_b = input === null || input === void 0 ? void 0 : input.data) === null || _b === void 0 ? void 0 : _b.reason) || LL.RedeemBitcoinScreen.redeemingError());
                    }
                }
                catch (err) {
                    console.error(err);
                    react_native_1.Alert.alert(err.message);
                }
            }
            dismiss();
        };
        init();
        // Necessary because receiveViaNFC gets rerendered at useReceiveBitcoin
        // And rerendering that shouldn't cause this useEffect to retrigger
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        LL,
        wallets,
        bitcoinNetwork,
        accountDefaultWalletQuery,
        isActive,
        dismiss,
        settlementAmount,
        setIsActive,
        convertMoneyAmount,
    ]);
    return (<react_native_modal_1.default swipeDirection={["down"]} isVisible={isActive && !base_1.isIOS} onSwipeComplete={dismiss} onBackdropPress={dismiss} backdropOpacity={0.3} backdropColor={colors.grey3} swipeThreshold={50} propagateSwipe style={styles.modal}>
      <react_native_1.Pressable style={styles.flex} onPress={dismiss}></react_native_1.Pressable>
      <react_native_safe_area_context_1.SafeAreaView style={styles.modalForeground}>
        <react_native_1.View style={styles.iconContainer}>
          <Ionicons_1.default name="remove" size={72} color={colors.grey3} style={styles.icon}/>
        </react_native_1.View>
        <themed_1.Text type="h1" bold style={styles.message}>
          {LL.SettingsScreen.nfcScanNow()}
        </themed_1.Text>
        <react_native_1.View style={styles.scanIconContainer}>
          <Ionicons_1.default name="scan" size={140} color={colors.grey1}/>
        </react_native_1.View>
        <react_native_1.View style={styles.buttonContainer}>
          <galoy_secondary_button_1.GaloySecondaryButton title={LL.common.cancel()} onPress={dismiss}/>
        </react_native_1.View>
      </react_native_safe_area_context_1.SafeAreaView>
    </react_native_modal_1.default>);
};
exports.ModalNfc = ModalNfc;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    flex: {
        maxHeight: "25%",
        flex: 1,
    },
    buttonContainer: {
        marginBottom: 32,
    },
    icon: {
        height: 40,
        top: -40,
    },
    iconContainer: {
        height: 14,
    },
    scanIconContainer: {
        height: 40,
        flex: 1,
    },
    message: {
        marginVertical: 8,
    },
    modal: {
        margin: 0,
        flex: 3,
    },
    modalForeground: {
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 10,
        flex: 1,
        backgroundColor: colors.white,
    },
    modalContent: {
        backgroundColor: "white",
    },
}));
//# sourceMappingURL=modal-nfc.js.map