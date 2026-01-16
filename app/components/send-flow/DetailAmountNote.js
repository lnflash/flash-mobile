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
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
// components
const galoy_tertiary_button_1 = require("@app/components/atomic/galoy-tertiary-button");
const amount_input_1 = require("@app/components/amount-input/amount-input");
const note_input_1 = require("@app/components/note-input");
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
// utils
const testProps_1 = require("../../utils/testProps");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const DetailAmountNote = ({ selectedFee, usdWallet, paymentDetail, setPaymentDetail, setAsyncErrorMessage, isFromFlashcard, invoiceAmount, }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { formatDisplayAndWalletAmount } = (0, hooks_1.useDisplayCurrency)();
    const { sendingWalletDescriptor } = paymentDetail;
    const [minAmount, setMinAmount] = (0, react_1.useState)();
    const [maxAmount, setMaxAmount] = (0, react_1.useState)();
    (0, react_1.useEffect)(() => {
        if (paymentDetail.isSendingMax && selectedFee) {
            sendAll();
        }
    }, [selectedFee, paymentDetail.isSendingMax]);
    (0, react_1.useEffect)(() => {
        fetchBtcMinMaxAmount();
    }, [paymentDetail.sendingWalletDescriptor.currency]);
    const fetchBtcMinMaxAmount = async () => {
        if (paymentDetail.sendingWalletDescriptor.currency === "BTC") {
            let limits;
            if (paymentDetail.paymentType === "lightning") {
                limits = await (0, breez_sdk_liquid_1.fetchBreezLightningLimits)();
            }
            else if (paymentDetail.paymentType === "onchain") {
                limits = await (0, breez_sdk_liquid_1.fetchBreezOnChainLimits)();
            }
            else {
                limits = await (0, breez_sdk_liquid_1.fetchBreezLightningLimits)();
                if ((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.paymentType) === "lnurl") {
                    limits = {
                        send: {
                            minSat: limits.send.minSat < (paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.min)
                                ? paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.min
                                : limits.send.minSat,
                            maxSat: limits.send.maxSat > (paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.max)
                                ? paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.max
                                : limits.send.maxSat,
                        },
                    };
                }
            }
            const defaultMinSat = (limits === null || limits === void 0 ? void 0 : limits.send.minSat) || 0;
            const flashcardMinSat = isFromFlashcard ? 100 : 0;
            const minSat = Math.max(defaultMinSat, flashcardMinSat);
            setMinAmount({
                amount: minSat,
                currency: "BTC",
                currencyCode: "SAT",
            });
            setMaxAmount({
                amount: (limits === null || limits === void 0 ? void 0 : limits.send.maxSat) || 0,
                currency: "BTC",
                currencyCode: "SAT",
            });
        }
        else {
            setMinAmount({
                amount: 1,
                currency: "USD",
                currencyCode: "USD",
            });
            setMaxAmount(undefined);
        }
    };
    (0, react_1.useEffect)(() => {
        checkErrorMessage();
    }, [paymentDetail, minAmount, maxAmount]);
    const checkErrorMessage = () => {
        if (!convertMoneyAmount)
            return null;
        if ((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.sendingWalletDescriptor.currency) === "BTC") {
            if (paymentDetail.paymentType === "lightning" && paymentDetail.canSetAmount) {
                setAsyncErrorMessage(LL.SendBitcoinScreen.noAmountInvoiceError());
            }
            else if (minAmount &&
                paymentDetail.settlementAmount.amount &&
                paymentDetail.settlementAmount.amount < (minAmount === null || minAmount === void 0 ? void 0 : minAmount.amount)) {
                const convertedBTCAmount = convertMoneyAmount(minAmount, "DisplayCurrency");
                const formattedBTCAmount = formatDisplayAndWalletAmount({
                    displayAmount: convertedBTCAmount,
                    walletAmount: minAmount,
                });
                if (paymentDetail.paymentType === "onchain") {
                    setAsyncErrorMessage(LL.SendBitcoinScreen.onchainMinAmountInvoiceError({
                        amount: formattedBTCAmount,
                    }));
                }
                else {
                    setAsyncErrorMessage(LL.SendBitcoinScreen.minAmountInvoiceError({
                        amount: formattedBTCAmount,
                    }));
                }
            }
            else if (maxAmount &&
                paymentDetail.settlementAmount.amount &&
                paymentDetail.settlementAmount.amount > (maxAmount === null || maxAmount === void 0 ? void 0 : maxAmount.amount)) {
                const convertedBTCAmount = convertMoneyAmount(maxAmount, "DisplayCurrency");
                setAsyncErrorMessage(LL.SendBitcoinScreen.maxAmountInvoiceError({
                    amount: formatDisplayAndWalletAmount({
                        displayAmount: convertedBTCAmount,
                        walletAmount: maxAmount,
                    }),
                }));
            }
            else {
                setAsyncErrorMessage("");
            }
        }
        else {
            if ((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.paymentType) === "lnurl") {
                if (paymentDetail.canSetAmount &&
                    (0, amounts_1.isNonZeroMoneyAmount)(paymentDetail.settlementAmount) &&
                    paymentDetail.settlementAmount.amount < (paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.min)) {
                    const minAmount = {
                        amount: paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.min,
                        currency: "BTC",
                        currencyCode: "SAT",
                    };
                    const convertedUSDAmount = convertMoneyAmount(minAmount, "DisplayCurrency");
                    setAsyncErrorMessage(LL.SendBitcoinScreen.minAmountInvoiceError({
                        amount: formatDisplayAndWalletAmount({
                            displayAmount: convertedUSDAmount,
                            walletAmount: minAmount,
                        }),
                    }));
                }
                else if (paymentDetail.canSetAmount &&
                    (0, amounts_1.isNonZeroMoneyAmount)(paymentDetail.settlementAmount) &&
                    paymentDetail.settlementAmount.amount > (paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.max)) {
                    const maxAmount = {
                        amount: paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.lnurlParams.max,
                        currency: "BTC",
                        currencyCode: "SAT",
                    };
                    const convertedUSDAmount = convertMoneyAmount(maxAmount, "DisplayCurrency");
                    setAsyncErrorMessage(LL.SendBitcoinScreen.maxAmountInvoiceError({
                        amount: formatDisplayAndWalletAmount({
                            displayAmount: convertedUSDAmount,
                            walletAmount: maxAmount,
                        }),
                    }));
                }
                else {
                    setAsyncErrorMessage("");
                }
            }
            else {
                setAsyncErrorMessage("");
            }
        }
    };
    const sendAll = async () => {
        var _a;
        let moneyAmount;
        if (paymentDetail.sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
            moneyAmount = {
                amount: btcWallet.balance,
                currency: generated_1.WalletCurrency.Btc,
                currencyCode: "BTC",
            };
        }
        else {
            moneyAmount = {
                amount: (_a = usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance) !== null && _a !== void 0 ? _a : 0,
                currency: generated_1.WalletCurrency.Usd,
                currencyCode: "USD",
            };
        }
        setPaymentDetail((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.setAmount)
            ? paymentDetail.setAmount(moneyAmount, true)
            : paymentDetail);
    };
    const setAmount = (moneyAmount) => {
        setPaymentDetail((paymentDetail === null || paymentDetail === void 0 ? void 0 : paymentDetail.setAmount) ? paymentDetail.setAmount(moneyAmount) : paymentDetail);
    };
    return (<>
      <react_native_1.View style={styles.fieldContainer}>
        <react_native_1.View style={styles.amountRightMaxField}>
          <themed_1.Text {...(0, testProps_1.testProps)(LL.SendBitcoinScreen.amount())} style={styles.amountText}>
            {LL.SendBitcoinScreen.amount()}
          </themed_1.Text>
          {paymentDetail.canSendMax && !paymentDetail.isSendingMax && (<galoy_tertiary_button_1.GaloyTertiaryButton clear title={LL.SendBitcoinScreen.maxAmount()} onPress={sendAll}/>)}
        </react_native_1.View>
        <react_native_1.View style={styles.currencyInputContainer}>
          <amount_input_1.AmountInput unitOfAccountAmount={sendingWalletDescriptor.currency === "USD" && invoiceAmount
            ? invoiceAmount
            : paymentDetail.unitOfAccountAmount} setAmount={setAmount} convertMoneyAmount={paymentDetail.convertMoneyAmount} walletCurrency={sendingWalletDescriptor.currency} canSetAmount={paymentDetail.canSetAmount} isSendingMax={paymentDetail.isSendingMax} maxAmount={maxAmount} minAmount={minAmount} title="Send"/>
        </react_native_1.View>
      </react_native_1.View>
      {paymentDetail.canSetMemo && (<react_native_1.View style={styles.fieldContainer}>
          <themed_1.Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.note()}</themed_1.Text>
          <note_input_1.NoteInput onChangeText={(text) => paymentDetail.setMemo && setPaymentDetail(paymentDetail.setMemo(text))} value={paymentDetail.memo || ""} editable={paymentDetail.canSetMemo}/>
        </react_native_1.View>)}
    </>);
};
exports.default = DetailAmountNote;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    sendBitcoinAmountContainer: {
        flex: 1,
    },
    fieldTitleText: {
        fontWeight: "bold",
        marginBottom: 4,
    },
    fieldContainer: {
        marginBottom: 12,
    },
    currencyInputContainer: {
        flexDirection: "column",
    },
    buttonContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    modal: {
        marginBottom: "90%",
    },
    pickWalletIcon: {
        marginRight: 12,
    },
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    amountText: {
        fontWeight: "bold",
    },
    amountRightMaxField: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
        height: 18,
    },
}));
//# sourceMappingURL=DetailAmountNote.js.map