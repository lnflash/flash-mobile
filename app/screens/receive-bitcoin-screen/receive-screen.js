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
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const themed_1 = require("@rneui/themed");
// hooks
const native_1 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const use_receive_bitcoin_1 = require("./use-receive-bitcoin");
const redux_1 = require("@app/store/redux");
const hooks_1 = require("@app/hooks");
const persistent_state_1 = require("@app/store/persistent-state");
// breez
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
// components
const screen_1 = require("@app/components/screen");
const qr_view_1 = require("./qr-view");
const set_lightning_address_modal_1 = require("@app/components/set-lightning-address-modal");
const my_ln_updates_sub_1 = require("./my-ln-updates-sub");
const modal_nfc_1 = require("@app/components/modal-nfc");
const receive_screen_1 = require("@app/components/receive-screen");
// gql
const generated_1 = require("@app/graphql/generated");
// types
const index_types_1 = require("./payment/index.types");
const ReceiveScreen = () => {
    var _a, _b, _c, _d, _e;
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { userData } = (0, redux_1.useAppSelector)((state) => state.user);
    const { data, loading, error } = (0, generated_1.useWalletsQuery)();
    const request = (0, use_receive_bitcoin_1.useReceiveBitcoin)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const [displayReceiveNfc, setDisplayReceiveNfc] = (0, react_1.useState)(false);
    const [updatedPaymentState, setUpdatedPaymentState] = react_1.default.useState();
    const [lnurlp, setLnurlp] = (0, react_1.useState)();
    const [breezListenerId, setBreezListenerId] = (0, react_1.useState)();
    const lnAddressHostname = appConfig.galoyInstance.lnAddressHostname;
    const wallets = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.wallets;
    const usdWallet = wallets === null || wallets === void 0 ? void 0 : wallets.find((el) => el.walletCurrency === generated_1.WalletCurrency.Usd);
    (0, react_1.useEffect)(() => {
        if ((request === null || request === void 0 ? void 0 : request.state) === index_types_1.PaymentRequestState.Paid ||
            updatedPaymentState === index_types_1.PaymentRequestState.Paid) {
            const id = setTimeout(() => navigation.goBack(), 5000);
            return () => clearTimeout(id);
        }
    }, [request === null || request === void 0 ? void 0 : request.state, updatedPaymentState, navigation]);
    (0, react_1.useEffect)(() => {
        if (persistentState.isAdvanceMode && !breezListenerId)
            addBreezEventListener();
        return removeBreezEventListener;
    }, [persistentState.isAdvanceMode, breezListenerId]);
    (0, react_1.useEffect)(() => {
        if (request &&
            request.type === "PayCode" &&
            request.receivingWalletDescriptor.currency === "USD" &&
            Boolean(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.lnurlp) &&
            Boolean(userData.username)) {
            setLnurlp(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.lnurlp);
        }
        else {
            setLnurlp(undefined);
        }
    }, [request, usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.lnurlp]);
    const addBreezEventListener = async () => {
        const listenerId = await (0, react_native_breez_sdk_liquid_1.addEventListener)((e) => {
            if (e.type === react_native_breez_sdk_liquid_1.SdkEventVariant.PAYMENT_WAITING_CONFIRMATION ||
                e.type === react_native_breez_sdk_liquid_1.SdkEventVariant.PAYMENT_SUCCEEDED) {
                setUpdatedPaymentState(index_types_1.PaymentRequestState.Paid);
            }
        });
        setBreezListenerId(listenerId);
    };
    const removeBreezEventListener = () => {
        if (breezListenerId) {
            (0, react_native_breez_sdk_liquid_1.removeEventListener)(breezListenerId);
        }
    };
    const handleCopy = () => {
        if (request) {
            if (request.type === "PayCode") {
                clipboard_1.default.setString(`${request.username}@${lnAddressHostname}`);
            }
            else {
                if (request.copyToClipboard) {
                    request.copyToClipboard();
                }
            }
        }
    };
    if (request) {
        return (<>
        <receive_screen_1.Header request={request} setDisplayReceiveNfc={setDisplayReceiveNfc}/>
        <screen_1.Screen preset="scroll" keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled" style={styles.screenStyle}>
          <receive_screen_1.InvoiceInfo request={request} lnurlp={lnurlp} handleCopy={handleCopy}/>
          <qr_view_1.QRView type={((_c = (_b = request.info) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.invoiceType) || index_types_1.Invoice.OnChain} getFullUri={!!lnurlp ? lnurlp : (_e = (_d = request.info) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.getFullUriFn} loading={!!lnurlp ? loading : request.state === index_types_1.PaymentRequestState.Loading} completed={updatedPaymentState === index_types_1.PaymentRequestState.Paid ||
                request.state === index_types_1.PaymentRequestState.Paid} err={request.state === index_types_1.PaymentRequestState.Error || (!!lnurlp && error)
                ? LL.ReceiveScreen.error()
                : ""} expired={request.state === index_types_1.PaymentRequestState.Expired} regenerateInvoiceFn={request.regenerateInvoice} copyToClipboard={handleCopy} isPayCode={request.type === index_types_1.Invoice.PayCode} canUsePayCode={!!lnurlp || request.canUsePaycode} toggleIsSetLightningAddressModalVisible={request.toggleIsSetLightningAddressModalVisible}/>
          <receive_screen_1.WalletReceiveTypeTabs request={request}/>
          <receive_screen_1.AmountNote request={request}/>
          <receive_screen_1.OnChainCharge request={request}/>
          <set_lightning_address_modal_1.SetLightningAddressModal isVisible={request.isSetLightningAddressModalVisible} toggleModal={request.toggleIsSetLightningAddressModalVisible}/>
          <modal_nfc_1.ModalNfc isActive={displayReceiveNfc} setIsActive={setDisplayReceiveNfc} settlementAmount={request.settlementAmount} receiveViaNFC={request.receiveViaNFC} onPaid={() => setUpdatedPaymentState(index_types_1.PaymentRequestState.Paid)} note={request.memo}/>
        </screen_1.Screen>
      </>);
    }
    else {
        return null;
    }
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        flexGrow: 1,
        padding: 20,
        paddingTop: 0,
    },
}));
exports.default = (0, my_ln_updates_sub_1.withMyLnUpdateSub)(ReceiveScreen);
//# sourceMappingURL=receive-screen.js.map