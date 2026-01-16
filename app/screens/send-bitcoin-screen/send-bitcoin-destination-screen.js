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
exports.defaultDestinationState = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
// componenets
const screen_1 = require("@app/components/screen");
const buttons_1 = require("@app/components/buttons");
const send_flow_1 = require("@app/components/send-flow");
const confirm_destination_modal_1 = require("./confirm-destination-modal");
const destination_information_1 = require("./destination-information");
// hooks
const generated_1 = require("@app/graphql/generated");
const hooks_1 = require("@app/hooks");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const client_1 = require("@galoymoney/client");
const index_types_1 = require("./payment-destination/index.types");
// utils
const config_1 = require("@app/config");
const amounts_1 = require("@app/types/amounts");
const payment_destination_1 = require("./payment-destination");
const analytics_1 = require("@app/utils/analytics");
// store
const send_bitcoin_reducer_1 = require("./send-bitcoin-reducer");
const nostr_tools_1 = require("nostr-tools");
const chatContext_1 = require("../chat/chatContext");
exports.defaultDestinationState = {
    unparsedDestination: "",
    destinationState: send_bitcoin_reducer_1.DestinationState.Entering,
};
const SendBitcoinDestinationScreen = ({ navigation, route }) => {
    var _a, _b, _c, _d;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = usestyles();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const { lnAddressHostname: lnDomain } = appConfig.galoyInstance;
    const [destinationState, dispatchDestinationStateAction] = (0, react_1.useReducer)(send_bitcoin_reducer_1.sendBitcoinDestinationReducer, exports.defaultDestinationState);
    const [goToNextScreenWhenValid, setGoToNextScreenWhenValid] = (0, react_1.useState)(false);
    const [flashUserAddress, setFlashUserAddress] = (0, react_1.useState)();
    const [lnUsdInvoiceAmount] = (0, generated_1.useLnUsdInvoiceAmountMutation)();
    const [accountDefaultWalletQuery] = (0, generated_1.useAccountDefaultWalletLazyQuery)({
        fetchPolicy: "no-cache",
    });
    const [npubByUsernameQuery] = (0, generated_1.useNpubByUsernameLazyQuery)();
    const { getContactPubkeys } = (0, chatContext_1.useChatContext)();
    const { data } = (0, generated_1.useSendBitcoinDestinationQuery)({
        fetchPolicy: "cache-and-network",
        returnPartialData: true,
        skip: !isAuthed,
    });
    // forcing price refresh
    (0, generated_1.useRealtimePriceQuery)({
        fetchPolicy: "network-only",
        skip: !isAuthed,
    });
    const wallets = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.wallets;
    const bitcoinNetwork = (_b = data === null || data === void 0 ? void 0 : data.globals) === null || _b === void 0 ? void 0 : _b.network;
    (0, react_1.useEffect)(() => {
        handleNavigation();
    }, [destinationState, goToNextScreenWhenValid]);
    (0, react_1.useEffect)(() => {
        var _a, _b, _c, _d;
        if ((_a = route.params) === null || _a === void 0 ? void 0 : _a.username) {
            handleChangeText((_b = route.params) === null || _b === void 0 ? void 0 : _b.username);
        }
        if ((_c = route.params) === null || _c === void 0 ? void 0 : _c.payment) {
            handleChangeText((_d = route.params) === null || _d === void 0 ? void 0 : _d.payment);
        }
    }, [(_c = route.params) === null || _c === void 0 ? void 0 : _c.username, (_d = route.params) === null || _d === void 0 ? void 0 : _d.payment]);
    const handleNavigation = async () => {
        if (!goToNextScreenWhenValid ||
            destinationState.destinationState !== send_bitcoin_reducer_1.DestinationState.Valid) {
            return;
        }
        else {
            if (destinationState.destination.destinationDirection === index_types_1.DestinationDirection.Send) {
                // go to send bitcoin details screen
                let invoiceAmount;
                if (destinationState.destination.validDestination.paymentType === "lightning" &&
                    wallets) {
                    toggleActivityIndicator(true);
                    const walletId = wallets[0].id;
                    const paymentRequest = destinationState.destination.validDestination.paymentRequest;
                    const { data } = await lnUsdInvoiceAmount({
                        variables: {
                            input: {
                                paymentRequest,
                                walletId,
                            },
                        },
                    });
                    if ((data === null || data === void 0 ? void 0 : data.lnUsdInvoiceFeeProbe.invoiceAmount) !== null &&
                        (data === null || data === void 0 ? void 0 : data.lnUsdInvoiceFeeProbe.invoiceAmount) !== undefined) {
                        invoiceAmount = (0, amounts_1.toUsdMoneyAmount)(data.lnUsdInvoiceFeeProbe.invoiceAmount);
                    }
                    toggleActivityIndicator(false);
                }
                setGoToNextScreenWhenValid(false);
                navigation.navigate("sendBitcoinDetails", {
                    paymentDestination: destinationState.destination,
                    flashUserAddress,
                    invoiceAmount,
                });
            }
            else if (destinationState.destination.destinationDirection === index_types_1.DestinationDirection.Receive) {
                // go to redeem bitcoin screen
                setGoToNextScreenWhenValid(false);
                navigation.navigate("redeemBitcoinDetail", {
                    receiveDestination: destinationState.destination,
                });
            }
        }
    };
    const handleChangeText = (0, react_1.useCallback)((newDestination) => {
        dispatchDestinationStateAction({
            type: "set-unparsed-destination",
            payload: { unparsedDestination: newDestination },
        });
        setGoToNextScreenWhenValid(false);
    }, [dispatchDestinationStateAction, setGoToNextScreenWhenValid]);
    const validateDestination = (0, react_1.useMemo)(() => {
        if (!bitcoinNetwork || !wallets) {
            return null;
        }
        return async (rawInput) => {
            var _a, _b;
            if (destinationState.destinationState !== "entering") {
                return;
            }
            dispatchDestinationStateAction({
                type: "set-validating",
                payload: {
                    unparsedDestination: rawInput,
                },
            });
            const destination = await (0, payment_destination_1.parseDestination)({
                rawInput,
                myWalletIds: wallets.map((wallet) => wallet.id),
                bitcoinNetwork,
                lnurlDomains: config_1.LNURL_DOMAINS,
                accountDefaultWalletQuery,
            });
            if (destination.valid === false) {
                if (destination.invalidReason === index_types_1.InvalidDestinationReason.SelfPayment) {
                    dispatchDestinationStateAction({
                        type: send_bitcoin_reducer_1.SendBitcoinActions.SetUnparsedDestination,
                        payload: {
                            unparsedDestination: rawInput,
                        },
                    });
                    navigation.navigate("conversionDetails");
                    return;
                }
                dispatchDestinationStateAction({
                    type: send_bitcoin_reducer_1.SendBitcoinActions.SetInvalid,
                    payload: {
                        invalidDestination: destination,
                        unparsedDestination: rawInput,
                    },
                });
                return;
            }
            if (destination.destinationDirection === index_types_1.DestinationDirection.Send &&
                destination.validDestination.paymentType === client_1.PaymentType.Intraledger) {
                const queryResult = await npubByUsernameQuery({
                    variables: { username: rawInput },
                });
                const destinationNpub = ((_b = (_a = queryResult.data) === null || _a === void 0 ? void 0 : _a.npubByUsername) === null || _b === void 0 ? void 0 : _b.npub) || "";
                (0, analytics_1.logParseDestinationResult)(destination);
                setFlashUserAddress(destination.validDestination.handle + "@" + lnDomain);
                let contacts = getContactPubkeys() || [];
                if (destinationNpub &&
                    !contacts.includes(nostr_tools_1.nip19.decode(destinationNpub).data)) {
                    dispatchDestinationStateAction({
                        type: send_bitcoin_reducer_1.SendBitcoinActions.SetRequiresConfirmation,
                        payload: {
                            validDestination: destination,
                            unparsedDestination: rawInput,
                            confirmationType: {
                                type: "new-username",
                                username: destination.validDestination.handle,
                            },
                        },
                    });
                    return;
                }
            }
            else {
                // 🚨 any NON-intraledger destination
                dispatchDestinationStateAction({
                    type: send_bitcoin_reducer_1.SendBitcoinActions.SetRequiresConfirmation,
                    payload: {
                        validDestination: destination,
                        unparsedDestination: rawInput,
                        confirmationType: {
                            type: "external-destination",
                            address: rawInput,
                        },
                    },
                });
                return;
            }
            dispatchDestinationStateAction({
                type: send_bitcoin_reducer_1.SendBitcoinActions.SetValid,
                payload: {
                    validDestination: destination,
                    unparsedDestination: rawInput,
                },
            });
        };
    }, [
        bitcoinNetwork,
        wallets,
        destinationState.destinationState,
        accountDefaultWalletQuery,
        dispatchDestinationStateAction,
        navigation,
    ]);
    const initiateGoToNextScreen = validateDestination &&
        (async () => {
            validateDestination(destinationState.unparsedDestination);
            setGoToNextScreenWhenValid(true);
        });
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <confirm_destination_modal_1.ConfirmDestinationModal destinationState={destinationState} dispatchDestinationStateAction={dispatchDestinationStateAction}/>
      <react_native_1.View style={styles.sendBitcoinDestinationContainer}>
        <send_flow_1.DestinationField validateDestination={validateDestination ? validateDestination : () => { }} handleChangeText={handleChangeText} destinationState={destinationState} dispatchDestinationStateAction={dispatchDestinationStateAction}/>
        <destination_information_1.DestinationInformation destinationState={destinationState}/>
        <react_native_1.View style={styles.buttonContainer}>
          <buttons_1.PrimaryBtn label={destinationState.unparsedDestination
            ? LL.common.next()
            : LL.SendBitcoinScreen.destinationIsRequired()} loading={destinationState.destinationState === "validating"} disabled={destinationState.destinationState === "invalid" ||
            !destinationState.unparsedDestination ||
            !initiateGoToNextScreen} onPress={initiateGoToNextScreen || undefined}/>
        </react_native_1.View>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.default = SendBitcoinDestinationScreen;
const usestyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    sendBitcoinDestinationContainer: {
        flex: 1,
    },
    buttonContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
}));
//# sourceMappingURL=send-bitcoin-destination-screen.js.map