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
exports.CardScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
// hooks
const generated_1 = require("@app/graphql/generated");
const themed_1 = require("@rneui/themed");
const hooks_1 = require("@app/hooks");
const native_1 = require("@react-navigation/native");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
// components
const screen_1 = require("@app/components/screen");
const card_1 = require("@app/components/card");
// utils
const index_types_1 = require("@app/screens/send-bitcoin-screen/payment-destination/index.types");
const payment_destination_1 = require("@app/screens/send-bitcoin-screen/payment-destination");
const config_1 = require("@app/config");
const CardScreen = () => {
    var _a, _b;
    const navigation = (0, native_1.useNavigation)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { lnurl, resetFlashcard } = (0, hooks_1.useFlashcard)();
    const [reloadLnurl, setReloadLnurl] = (0, react_1.useState)();
    const { data } = (0, generated_1.useScanningQrCodeScreenQuery)({ skip: !isAuthed });
    const [accountDefaultWalletQuery] = (0, generated_1.useAccountDefaultWalletLazyQuery)({
        fetchPolicy: "no-cache",
    });
    const wallets = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.wallets;
    const bitcoinNetwork = (_b = data === null || data === void 0 ? void 0 : data.globals) === null || _b === void 0 ? void 0 : _b.network;
    (0, react_1.useEffect)(() => {
        if (!isAuthed) {
            const unsubscribe = navigation.addListener("beforeRemove", () => {
                resetFlashcard();
            });
            return unsubscribe;
        }
    }, [isAuthed, navigation]);
    (0, react_1.useEffect)(() => {
        if (lnurl)
            parseAndSetDestination(lnurl);
    }, [lnurl]);
    const parseAndSetDestination = async (lnurlMatch) => {
        if (!wallets || !bitcoinNetwork || !lnurlMatch)
            return;
        try {
            const destination = await (0, payment_destination_1.parseDestination)({
                rawInput: lnurlMatch,
                myWalletIds: wallets.map((wallet) => wallet.id),
                bitcoinNetwork,
                lnurlDomains: config_1.LNURL_DOMAINS,
                accountDefaultWalletQuery,
            });
            if (destination.valid) {
                if (destination.destinationDirection === index_types_1.DestinationDirection.Send) {
                    setReloadLnurl(destination);
                }
            }
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
                react_native_1.Alert.alert(err.toString(), "", [
                    {
                        text: "Ok",
                    },
                ]);
            }
        }
    };
    const onReload = () => {
        if (reloadLnurl)
            navigation.navigate("sendBitcoinDetails", {
                paymentDestination: reloadLnurl,
                isFromFlashcard: true,
            });
    };
    const onTopup = () => {
        if (lnurl)
            navigation.navigate("flashcardTopup", {
                flashcardLnurl: lnurl,
            });
    };
    return (<screen_1.Screen keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled" backgroundColor={colors.background}>
      {lnurl ? <card_1.Flashcard onReload={onReload} onTopup={onTopup}/> : <card_1.EmptyCard />}
    </screen_1.Screen>);
};
exports.CardScreen = CardScreen;
//# sourceMappingURL=card.js.map