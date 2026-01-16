"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSwap = void 0;
const generated_1 = require("@app/graphql/generated");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const useBreez_1 = require("./useBreez");
const use_price_conversion_1 = require("./use-price-conversion");
const amounts_1 = require("@app/types/amounts");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const i18n_react_1 = require("@app/i18n/i18n-react");
const use_display_currency_1 = require("./use-display-currency");
const useSwap = () => {
    var _a, _b, _c, _d;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, useBreez_1.useBreez)();
    const { convertMoneyAmount } = (0, use_price_conversion_1.usePriceConversion)();
    const { formatDisplayAndWalletAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const [lnUsdInvoiceFeeProbe] = (0, generated_1.useLnUsdInvoiceFeeProbeMutation)();
    const [lnUsdInvoiceCreate] = (0, generated_1.useLnUsdInvoiceCreateMutation)();
    const [lnInvoicePaymentSend] = (0, generated_1.useLnInvoicePaymentSendMutation)({
        refetchQueries: [generated_1.HomeAuthedDocument],
    });
    const { data } = (0, generated_1.useConversionScreenQuery)({
        fetchPolicy: "cache-first",
        returnPartialData: true,
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    const btcBalance = (0, amounts_1.toBtcMoneyAmount)((_c = btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance) !== null && _c !== void 0 ? _c : NaN);
    const usdBalance = (0, amounts_1.toUsdMoneyAmount)((_d = usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance) !== null && _d !== void 0 ? _d : NaN);
    // @ts-ignore: Unreachable code error
    const convertedBTCBalance = convertMoneyAmount(btcBalance, amounts_1.DisplayCurrency); // @ts-ignore: Unreachable code error
    const convertedUsdBalance = convertMoneyAmount(usdBalance, amounts_1.DisplayCurrency);
    const formattedBtcBalance = formatDisplayAndWalletAmount({
        displayAmount: convertedBTCBalance,
        walletAmount: btcBalance,
    });
    const formattedUsdBalance = formatDisplayAndWalletAmount({
        displayAmount: convertedUsdBalance,
        walletAmount: usdBalance,
    });
    const prepareBtcToUsd = async (settlementSendAmount) => {
        var _a, _b, _c, _d, _e, _f, _g;
        if (usdWallet && btcWallet) {
            // fetch ibex(USD) invoice
            // @ts-ignore: Unreachable code error
            const convertedAmount = convertMoneyAmount(settlementSendAmount, "USD");
            const invoiceRes = await lnUsdInvoiceCreate({
                variables: {
                    input: {
                        walletId: usdWallet.id,
                        amount: convertedAmount.amount,
                        memo: "Swap BTC to USD",
                    },
                },
            });
            console.log("INVOICE RES>>>>>>>>", (_a = invoiceRes.data) === null || _a === void 0 ? void 0 : _a.lnUsdInvoiceCreate);
            if ((_b = invoiceRes.data) === null || _b === void 0 ? void 0 : _b.lnUsdInvoiceCreate.invoice) {
                // get the sending fee probe
                const feeRes = await (0, breez_sdk_liquid_1.fetchBreezFee)("lightning", (_d = (_c = invoiceRes.data) === null || _c === void 0 ? void 0 : _c.lnUsdInvoiceCreate.invoice) === null || _d === void 0 ? void 0 : _d.paymentRequest);
                console.log("FEE RES>>>>>>>>", feeRes);
                if (!feeRes.err) {
                    // check if (amount + fee) is larger than balance
                    if ((feeRes.fee || 0) + settlementSendAmount.amount > btcBalance.amount) {
                        return {
                            data: null,
                            err: LL.SendBitcoinScreen.amountExceed({
                                balance: formattedBtcBalance,
                            }) + " (amount + fee)",
                        };
                    }
                    else {
                        return {
                            data: {
                                moneyAmount: settlementSendAmount,
                                sendingFee: feeRes.fee || 0,
                                receivingFee: 0,
                                lnInvoice: ((_f = (_e = invoiceRes.data) === null || _e === void 0 ? void 0 : _e.lnUsdInvoiceCreate.invoice) === null || _f === void 0 ? void 0 : _f.paymentRequest) || "",
                            },
                            err: null,
                        };
                    }
                }
                else {
                    return {
                        data: null,
                        err: LL.SendBitcoinScreen.amountExceed({
                            balance: formattedBtcBalance,
                        }) + " (amount + fee)",
                    };
                }
            }
            else {
                return { data: null, err: (_g = invoiceRes.data) === null || _g === void 0 ? void 0 : _g.lnUsdInvoiceCreate.errors[0].message };
            }
        }
        else {
            return { data: null, err: "Something went wrong. Please, try again later." };
        }
    };
    const prepareUsdToBtc = async (settlementSendAmount) => {
        var _a, _b;
        if (usdWallet && btcWallet) {
            // fetch breez(BTC) invoice
            // @ts-ignore: Unreachable code error
            const convertedAmount = convertMoneyAmount(settlementSendAmount, "BTC");
            const invoiceRes = await (0, breez_sdk_liquid_1.receivePaymentBreezSDK)(convertedAmount.amount, "Swap USD to BTC");
            console.log("INVOICE RES>>>>>>>>", invoiceRes);
            if (invoiceRes.bolt11) {
                // get the sending fee probe
                const feeRes = await lnUsdInvoiceFeeProbe({
                    variables: {
                        input: {
                            paymentRequest: invoiceRes.bolt11,
                            walletId: usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.id,
                        },
                    },
                });
                console.log("FEE RES>>>>>>>>", (_a = feeRes.data) === null || _a === void 0 ? void 0 : _a.lnUsdInvoiceFeeProbe);
                // if (feeRes.data?.lnUsdInvoiceFeeProbe.errors.length === 0) {
                // check if (amount + fee) is larger than balance
                const sendingFee = ((_b = feeRes.data) === null || _b === void 0 ? void 0 : _b.lnUsdInvoiceFeeProbe.amount) || 0;
                if (sendingFee + settlementSendAmount.amount > usdBalance.amount) {
                    return {
                        data: null,
                        err: LL.SendBitcoinScreen.amountExceed({
                            balance: formattedUsdBalance,
                        }) + " (amount + fee)",
                    };
                }
                else {
                    return {
                        data: {
                            moneyAmount: settlementSendAmount,
                            sendingFee: convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(sendingFee), "BTC").amount,
                            receivingFee: invoiceRes.fee,
                            lnInvoice: invoiceRes.bolt11,
                        },
                        err: null,
                    };
                }
                // } else {
                //   return { data: null, err: feeRes.data?.lnUsdInvoiceFeeProbe.errors[0].message }
                // }
            }
            else {
                return { data: null, err: "Something went wrong. Please, try again later." };
            }
        }
        else {
            return { data: null, err: "Something went wrong. Please, try again later." };
        }
    };
    const swap = async (lnInvoice, fromWalletCurrency) => {
        var _a, _b;
        if (lnInvoice && usdWallet) {
            if (fromWalletCurrency === "USD") {
                const res = await lnInvoicePaymentSend({
                    variables: {
                        input: {
                            walletId: usdWallet.id,
                            paymentRequest: lnInvoice,
                            memo: "Swap USD to BTC",
                        },
                    },
                });
                console.log(">>>>>>>>>>>>>>RES???????????????", res);
                const status = (_a = res.data) === null || _a === void 0 ? void 0 : _a.lnInvoicePaymentSend.status;
                if (status === "PENDING" || status === "SUCCESS") {
                    return true;
                }
                else if (status === "ALREADY_PAID") {
                    throw new Error("Invoice is already paid");
                }
                else {
                    const error = (_b = res.data) === null || _b === void 0 ? void 0 : _b.lnInvoicePaymentSend.errors[0].message;
                    throw new Error(error || "Something went wrong");
                }
            }
            else {
                const res = await (0, breez_sdk_liquid_1.payLightningBreez)(lnInvoice);
                console.log(">>>>>>>>>?????????", res.payment);
                if (res.payment.status === "pending") {
                    return true;
                }
            }
        }
    };
    return { prepareBtcToUsd, prepareUsdToBtc, swap };
};
exports.useSwap = useSwap;
//# sourceMappingURL=useSwap.js.map