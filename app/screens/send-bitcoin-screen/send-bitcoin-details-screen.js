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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
// components
const buttons_1 = require("@app/components/buttons");
const send_bitcoin_details_extra_info_1 = require("./send-bitcoin-details-extra-info");
const screen_1 = require("@app/components/screen");
const refund_flow_1 = require("@app/components/refund-flow");
const send_flow_1 = require("@app/components/send-flow");
// gql
const generated_1 = require("@app/graphql/generated");
const client_1 = require("@galoymoney/client");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
// hooks
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const level_context_1 = require("@app/graphql/level-context");
const hooks_1 = require("@app/hooks");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const i18n_react_1 = require("@app/i18n/i18n-react");
const persistent_state_1 = require("@app/store/persistent-state");
// utils
const amounts_1 = require("@app/types/amounts");
const payment_details_1 = require("./payment-details");
const lnurl_pay_1 = require("lnurl-pay");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const network = "mainnet"; // data?.globals?.network
const SendBitcoinDetailsScreen = ({ navigation, route }) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { currentLevel } = (0, level_context_1.useLevel)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const { convertMoneyAmount: _convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { zeroDisplayAmount, formatDisplayAndWalletAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const getIbexFee = (0, hooks_1.useIbexFee)();
    const { paymentDestination, flashUserAddress, isFromFlashcard, invoiceAmount } = route.params;
    const [recommendedFees, setRecommendedFees] = (0, react_1.useState)();
    const [isLoadingLnurl, setIsLoadingLnurl] = (0, react_1.useState)(false);
    const [paymentDetail, setPaymentDetail] = (0, react_1.useState)();
    const [asyncErrorMessage, setAsyncErrorMessage] = (0, react_1.useState)("");
    const [selectedFee, setSelectedFee] = (0, react_1.useState)();
    const [selectedFeeType, setSelectedFeeType] = (0, react_1.useState)();
    const [isProcessing, setIsProcessing] = (0, react_1.useState)(false);
    const { data } = (0, generated_1.useSendBitcoinDetailsScreenQuery)({
        fetchPolicy: "cache-first",
        returnPartialData: true,
        skip: !(0, is_authed_context_1.useIsAuthed)(),
    });
    const { data: withdrawalLimitsData } = (0, generated_1.useSendBitcoinWithdrawalLimitsQuery)({
        fetchPolicy: "no-cache",
        skip: !(0, is_authed_context_1.useIsAuthed)() ||
            !(paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.paymentType) ||
            paymentDetail.paymentType === "intraledger",
    });
    const { data: intraledgerLimitsData } = (0, generated_1.useSendBitcoinInternalLimitsQuery)({
        fetchPolicy: "no-cache",
        skip: !(0, is_authed_context_1.useIsAuthed)() ||
            !(paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.paymentType) ||
            paymentDetail.paymentType !== "intraledger",
    });
    const defaultWallet = persistentState.defaultWallet;
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const usdBalanceMoneyAmount = (0, amounts_1.toUsdMoneyAmount)(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance);
    const btcBalanceMoneyAmount = (0, amounts_1.toBtcMoneyAmount)(btcWallet.balance || (btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance));
    (0, react_1.useEffect)(() => {
        // we are caching the _convertMoneyAmount when the screen loads.
        // this is because the _convertMoneyAmount can change while the user is on this screen
        // and we don't want to update the payment detail with a new convertMoneyAmount
        if (_convertMoneyAmount) {
            setPaymentDetail((paymentDetail) => paymentDetail && paymentDetail.setConvertMoneyAmount(_convertMoneyAmount));
        }
    }, [_convertMoneyAmount]);
    // we set the default values when the screen loads
    // this only run once (doesn't re-run after paymentDetail is set)
    (0, react_1.useEffect)(() => {
        if (!(paymentDetail || !defaultWallet || !_convertMoneyAmount)) {
            let initialPaymentDetail = paymentDestination.createPaymentDetail({
                convertMoneyAmount: _convertMoneyAmount,
                sendingWalletDescriptor: {
                    id: defaultWallet.id,
                    currency: defaultWallet.walletCurrency,
                },
            });
            // Start with usd as the unit of account
            if (initialPaymentDetail.canSetAmount) {
                initialPaymentDetail = initialPaymentDetail.setAmount(zeroDisplayAmount);
            }
            setPaymentDetail(initialPaymentDetail);
        }
    }, [
        paymentDestination,
        _convertMoneyAmount,
        paymentDetail,
        defaultWallet,
        zeroDisplayAmount,
    ]);
    (0, react_1.useEffect)(() => {
        if (paymentDetail &&
            paymentDetail.sendingWalletDescriptor.currency === "BTC" &&
            paymentDetail.paymentType === "onchain" &&
            !recommendedFees) {
            fetchBreezRecommendedFees();
        }
    }, [paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.sendingWalletDescriptor, paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.paymentType]);
    const fetchBreezRecommendedFees = async () => {
        toggleActivityIndicator(true);
        const recommendedFees = await (0, breez_sdk_liquid_1.fetchRecommendedFees)();
        setRecommendedFees(recommendedFees);
        toggleActivityIndicator(false);
    };
    const fetchSendingFee = async (pd) => {
        if (pd) {
            if ((pd === null || pd === void 0 ? void 0 : pd.sendingWalletDescriptor.currency) === "BTC") {
                const { fee, err } = await (0, breez_sdk_liquid_1.fetchBreezFee)(pd === null || pd === void 0 ? void 0 : pd.paymentType, !!flashUserAddress ? flashUserAddress : pd === null || pd === void 0 ? void 0 : pd.destination, pd === null || pd === void 0 ? void 0 : pd.settlementAmount.amount, selectedFee, // feeRateSatPerVbyte
                pd.isSendingMax);
                if (fee === null && err) {
                    const error = (err === null || err === void 0 ? void 0 : err.message) || err;
                    const errMsg = error.includes("not enough funds")
                        ? `${error} (amount + fee)`
                        : error;
                    setAsyncErrorMessage(errMsg);
                    return false;
                }
            }
            else {
                const estimatedFee = await getIbexFee(pd.getFee);
                if (_convertMoneyAmount &&
                    estimatedFee &&
                    pd.settlementAmount.amount + (estimatedFee === null || estimatedFee === void 0 ? void 0 : estimatedFee.amount) > usdBalanceMoneyAmount.amount) {
                    const amount = formatDisplayAndWalletAmount({
                        displayAmount: _convertMoneyAmount(usdBalanceMoneyAmount, amounts_1.DisplayCurrency),
                        walletAmount: usdBalanceMoneyAmount,
                    });
                    setAsyncErrorMessage(LL.SendBitcoinScreen.amountExceed({
                        balance: amount,
                    }) + "(amount + fee)");
                    return false;
                }
            }
            return true;
        }
    };
    // Add timeout wrapper for operations
    const withTimeout = (0, react_1.useCallback)((promise, timeoutMs) => {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    }, []);
    // Safe error handler that prevents app freezing
    const handleCriticalError = (0, react_1.useCallback)((error, context) => {
        console.error(`Critical error in ${context}:`, error);
        (0, crashlytics_1.getCrashlytics)().recordError(error instanceof Error ? error : new Error(String(error)));
        // Show user-friendly error and offer to reload
        react_native_1.Alert.alert("Something went wrong", `There was an issue processing your request. Would you like to try again or go back?`, [
            {
                text: "Go Back",
                onPress: () => navigation.goBack(),
                style: "cancel",
            },
            {
                text: "Try Again",
                onPress: () => {
                    setAsyncErrorMessage("");
                    setIsProcessing(false);
                    setIsLoadingLnurl(false);
                    toggleActivityIndicator(false);
                },
            },
        ]);
    }, [navigation, toggleActivityIndicator]);
    const goToNextScreen = ((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.sendPaymentMutation) ||
        ((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.paymentType) === "lnurl" && (paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.unitOfAccountAmount))) &&
        (async () => {
            if (isProcessing)
                return;
            try {
                setIsProcessing(true);
                toggleActivityIndicator(true);
                let paymentDetailForConfirmation = paymentDetail;
                if (paymentDetail.paymentType === "lnurl") {
                    const lnurlParams = paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams;
                    try {
                        setIsLoadingLnurl(true);
                        const btcAmount = paymentDetail.convertMoneyAmount(paymentDetail.unitOfAccountAmount, "BTC");
                        const requestInvoiceParams = {
                            lnUrlOrAddress: paymentDetail.destination,
                            tokens: lnurl_pay_1.utils.toSats(btcAmount.amount),
                        };
                        if (lnurlParams === null || lnurlParams === void 0 ? void 0 : lnurlParams.commentAllowed) {
                            requestInvoiceParams.comment = paymentDetail.memo;
                        }
                        // Add timeout to LNURL request (30 seconds)
                        const result = await withTimeout((0, lnurl_pay_1.requestInvoice)(requestInvoiceParams), 30000);
                        setIsLoadingLnurl(false);
                        const invoice = result.invoice;
                        const decodedInvoice = (0, client_1.decodeInvoiceString)(invoice, network);
                        const invoiceAmountSats = Math.round(Number(decodedInvoice.millisatoshis) / 1000);
                        const requestedAmountSats = btcAmount.amount;
                        const amountDifference = Math.abs(invoiceAmountSats - requestedAmountSats);
                        // For flashcard reloads, allow small rounding differences (up to 15 sats)
                        // This accommodates flashcard servers that may round amounts
                        if (isFromFlashcard) {
                            if (amountDifference > 15) {
                                setAsyncErrorMessage(`Flashcard server returned ${invoiceAmountSats} sats but you requested ${requestedAmountSats} sats. Please try a different amount.`);
                                return;
                            }
                            // Use the amount from the invoice for flashcard reloads to handle rounding
                            const adjustedBtcAmount = (0, amounts_1.toBtcMoneyAmount)(invoiceAmountSats);
                            paymentDetailForConfirmation = paymentDetail.setInvoice({
                                paymentRequest: invoice,
                                paymentRequestAmount: adjustedBtcAmount,
                            });
                        }
                        else {
                            // For regular LNURL payments, maintain strict validation
                            if (invoiceAmountSats !== requestedAmountSats) {
                                setAsyncErrorMessage(LL.SendBitcoinScreen.lnurlInvoiceIncorrectAmount());
                                return;
                            }
                            paymentDetailForConfirmation = paymentDetail.setInvoice({
                                paymentRequest: invoice,
                                paymentRequestAmount: btcAmount,
                            });
                        }
                    }
                    catch (error) {
                        setIsLoadingLnurl(false);
                        if (error instanceof Error) {
                            (0, crashlytics_1.getCrashlytics)().recordError(error);
                            if (error.message.includes("timed out")) {
                                setAsyncErrorMessage("Request timed out. Please check your connection and try again.");
                            }
                            else {
                                setAsyncErrorMessage(LL.SendBitcoinScreen.failedToFetchLnurlInvoice());
                            }
                        }
                        else {
                            setAsyncErrorMessage("An unexpected error occurred. Please try again.");
                        }
                        return;
                    }
                }
                const res = await withTimeout(fetchSendingFee(paymentDetailForConfirmation), 15000);
                if (res && paymentDetailForConfirmation.sendPaymentMutation) {
                    navigation.navigate("sendBitcoinConfirmation", {
                        paymentDetail: paymentDetailForConfirmation,
                        flashUserAddress,
                        feeRateSatPerVbyte: selectedFee,
                        invoiceAmount,
                    });
                }
            }
            catch (error) {
                handleCriticalError(error, "goToNextScreen");
            }
            finally {
                setIsProcessing(false);
                toggleActivityIndicator(false);
                setIsLoadingLnurl(false);
            }
        });
    const onSelectFee = (type, value) => {
        setSelectedFeeType(type);
        setSelectedFee(value);
    };
    const amountStatus = (0, payment_details_1.isValidAmount)({
        paymentDetail,
        usdWalletAmount: usdBalanceMoneyAmount,
        btcWalletAmount: btcBalanceMoneyAmount,
        intraledgerLimits: (_e = (_d = (_c = intraledgerLimitsData === null || intraledgerLimitsData === void 0 ? void 0 : intraledgerLimitsData.me) === null || _c === void 0 ? void 0 : _c.defaultAccount) === null || _d === void 0 ? void 0 : _d.limits) === null || _e === void 0 ? void 0 : _e.internalSend,
        withdrawalLimits: (_h = (_g = (_f = withdrawalLimitsData === null || withdrawalLimitsData === void 0 ? void 0 : withdrawalLimitsData.me) === null || _f === void 0 ? void 0 : _f.defaultAccount) === null || _g === void 0 ? void 0 : _g.limits) === null || _h === void 0 ? void 0 : _h.withdrawal,
        isFromFlashcard,
    });
    const isDisabled = !amountStatus.validAmount ||
        Boolean(asyncErrorMessage) ||
        isProcessing ||
        isLoadingLnurl ||
        ((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.sendingWalletDescriptor.currency) === "BTC" &&
            paymentDetail.paymentType === "onchain" &&
            !selectedFee);
    if (paymentDetail) {
        return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
        <send_flow_1.ChooseWallet usdWallet={usdWallet} wallets={(_k = (_j = data === null || data === void 0 ? void 0 : data.me) === null || _j === void 0 ? void 0 : _j.defaultAccount) === null || _k === void 0 ? void 0 : _k.wallets} paymentDetail={paymentDetail} setPaymentDetail={setPaymentDetail}/>
        <send_flow_1.DetailDestination flashUserAddress={flashUserAddress} paymentDetail={paymentDetail}/>
        <send_flow_1.DetailAmountNote selectedFee={selectedFee} usdWallet={usdWallet} paymentDetail={paymentDetail} setPaymentDetail={setPaymentDetail} setAsyncErrorMessage={setAsyncErrorMessage} isFromFlashcard={isFromFlashcard} invoiceAmount={invoiceAmount}/>
        {paymentDetail.sendingWalletDescriptor.currency === "BTC" &&
                paymentDetail.paymentType === "onchain" && (<refund_flow_1.Fees wrapperStyle={{ marginTop: 0 }} recommendedFees={recommendedFees} selectedFeeType={selectedFeeType} onSelectFee={onSelectFee}/>)}
        <send_bitcoin_details_extra_info_1.SendBitcoinDetailsExtraInfo errorMessage={asyncErrorMessage} amountStatus={amountStatus} currentLevel={currentLevel}/>
        <react_native_1.View style={styles.buttonContainer}>
          <buttons_1.PrimaryBtn onPress={goToNextScreen || undefined} loading={isLoadingLnurl} disabled={isDisabled} label={LL.common.next()}/>
        </react_native_1.View>
      </screen_1.Screen>);
    }
    else {
        return null;
    }
};
exports.default = SendBitcoinDetailsScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
        flex: 1,
    },
    buttonContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
}));
//# sourceMappingURL=send-bitcoin-details-screen.js.map