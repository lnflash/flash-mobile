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
exports.listPaymentsBreezSDK = exports.parseInvoiceBreezSDK = exports.onRedeem = exports.payLnurlBreez = exports.payOnchainBreez = exports.payLightningBreez = exports.receiveOnchainBreezSDK = exports.receivePaymentBreezSDK = exports.fetchBreezFee = exports.fetchBreezOnChainLimits = exports.fetchBreezLightningLimits = exports.fetchRecommendedFees = exports.disconnectToSDK = exports.initializeBreezSDK = exports.breezSDKInitialized = exports.KEYCHAIN_MNEMONIC_KEY = void 0;
const bip39 = __importStar(require("bip39"));
const react_native_fs_1 = __importDefault(require("react-native-fs"));
const Keychain = __importStar(require("react-native-keychain"));
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const _env_1 = require("@env");
exports.KEYCHAIN_MNEMONIC_KEY = "mnemonic_key";
exports.breezSDKInitialized = false;
let breezSDKInitializing = null;
const initializeBreezSDK = async () => {
    if (exports.breezSDKInitialized) {
        return false;
    }
    if (breezSDKInitializing !== null) {
        return breezSDKInitializing;
    }
    breezSDKInitializing = (async () => {
        try {
            await retry(connectToSDK, 5000, 1);
            exports.breezSDKInitialized = true;
            return true;
        }
        catch (error) {
            console.error("Failed to connect to Breez SDK after 3 attempts: ", error.message);
            throw new Error(`Failed to connect to Breez SDK after 3 attempts: ${error.message}`);
        }
        finally {
            breezSDKInitializing = null;
        }
    })();
    return breezSDKInitializing;
};
exports.initializeBreezSDK = initializeBreezSDK;
// Retry function
const retry = (fn, ms = 15000, maxRetries = 3) => new Promise((resolve, reject) => {
    let attempts = 0;
    const tryFn = async () => {
        try {
            const result = await fn();
            resolve(result);
        }
        catch (err) {
            if (++attempts >= maxRetries) {
                reject(err);
            }
            else {
                setTimeout(tryFn, ms);
            }
        }
    };
    tryFn();
});
const connectToSDK = async () => {
    try {
        const mnemonic = await getMnemonic();
        const config = await (0, react_native_breez_sdk_liquid_1.defaultConfig)(react_native_breez_sdk_liquid_1.LiquidNetwork.MAINNET, _env_1.API_KEY);
        await (0, react_native_breez_sdk_liquid_1.connect)({ mnemonic, config });
    }
    catch (error) {
        console.error("Connect to Breez SDK - Liquid error: ", error);
        throw error;
    }
};
const disconnectToSDK = async () => {
    try {
        if (exports.breezSDKInitialized) {
            await (0, react_native_breez_sdk_liquid_1.disconnect)();
        }
        await Keychain.resetInternetCredentials(exports.KEYCHAIN_MNEMONIC_KEY);
        const config = await (0, react_native_breez_sdk_liquid_1.defaultConfig)(react_native_breez_sdk_liquid_1.LiquidNetwork.MAINNET, _env_1.API_KEY);
        const exists = await react_native_fs_1.default.exists(config.workingDir);
        if (exists) {
            await react_native_fs_1.default.unlink(config.workingDir);
        }
        exports.breezSDKInitialized = false;
        breezSDKInitializing = null;
    }
    catch (error) {
        console.error("Disconnect error: ", error);
        throw error;
    }
};
exports.disconnectToSDK = disconnectToSDK;
const getMnemonic = async () => {
    try {
        console.log("Looking for mnemonic in keychain");
        const credentials = await Keychain.getInternetCredentials(exports.KEYCHAIN_MNEMONIC_KEY);
        if (credentials) {
            console.log("Mnemonic found in keychain");
            return credentials.password;
        }
        console.log("Mnemonic not found in keychain. Generating new one");
        const mnemonic = bip39.generateMnemonic(128);
        await Keychain.setInternetCredentials(exports.KEYCHAIN_MNEMONIC_KEY, exports.KEYCHAIN_MNEMONIC_KEY, mnemonic);
        return mnemonic;
    }
    catch (error) {
        console.error("Error in getMnemonic: ", error);
        throw error;
    }
};
const fetchRecommendedFees = async () => {
    const fees = await (0, react_native_breez_sdk_liquid_1.recommendedFees)();
    console.log("Recommended fees:", fees);
    const updatedFees = Object.assign(Object.assign({}, fees), { fastestFee: fees.fastestFee + 3, halfHourFee: fees.halfHourFee + 1 });
    console.log("Updated recommended fees", updatedFees);
    return updatedFees;
};
exports.fetchRecommendedFees = fetchRecommendedFees;
const fetchBreezLightningLimits = async () => {
    const lightningLimits = await (0, react_native_breez_sdk_liquid_1.fetchLightningLimits)();
    console.log(`LIGHTNING LIMITS:`, lightningLimits);
    return lightningLimits;
};
exports.fetchBreezLightningLimits = fetchBreezLightningLimits;
const fetchBreezOnChainLimits = async () => {
    const onChainLimits = await (0, react_native_breez_sdk_liquid_1.fetchOnchainLimits)();
    console.log(`ONCHAIN LIMITS: ${onChainLimits}`);
    return onChainLimits;
};
exports.fetchBreezOnChainLimits = fetchBreezOnChainLimits;
const fetchBreezFee = async (paymentType, invoice, receiverAmountSat, feeRateSatPerVbyte, isSendingMax) => {
    try {
        if (paymentType === "lightning" && !!invoice) {
            const response = await (0, react_native_breez_sdk_liquid_1.prepareSendPayment)({
                destination: invoice,
            });
            return { fee: response.feesSat, err: null };
        }
        else if (paymentType === "onchain" && !!receiverAmountSat && !!feeRateSatPerVbyte) {
            console.log("Fee Rate Sat Per Vbyte:", feeRateSatPerVbyte);
            const response = await (0, react_native_breez_sdk_liquid_1.preparePayOnchain)({
                amount: {
                    type: isSendingMax ? react_native_breez_sdk_liquid_1.PayAmountVariant.DRAIN : react_native_breez_sdk_liquid_1.PayAmountVariant.BITCOIN,
                    receiverAmountSat,
                },
                feeRateSatPerVbyte,
            });
            return { fee: response.totalFeesSat, err: null };
        }
        else if ((paymentType === "intraledger" || paymentType === "lnurl") &&
            !!invoice &&
            !!receiverAmountSat) {
            const input = await (0, react_native_breez_sdk_liquid_1.parse)(invoice);
            if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_PAY) {
                const response = await (0, react_native_breez_sdk_liquid_1.prepareLnurlPay)({
                    data: input.data,
                    amount: { type: react_native_breez_sdk_liquid_1.PayAmountVariant.BITCOIN, receiverAmountSat },
                });
                return { fee: response.feesSat, err: null };
            }
            else if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_ERROR) {
                return { fee: null, err: input.data.reason };
            }
            else {
                return { fee: null, err: "Wrong payment type" };
            }
        }
        else {
            return { fee: null, err: "Wrong payment type" };
        }
    }
    catch (err) {
        return { fee: null, err };
    }
};
exports.fetchBreezFee = fetchBreezFee;
const receivePaymentBreezSDK = async (payerAmountSat, description) => {
    try {
        const currentLimits = await (0, react_native_breez_sdk_liquid_1.fetchLightningLimits)();
        console.log(`Minimum amount, in sats: ${currentLimits.receive.minSat}`);
        console.log(`Maximum amount, in sats: ${currentLimits.receive.maxSat}`);
        // Set the amount you wish the payer to send, which should be within the above limits
        const prepareResponse = await (0, react_native_breez_sdk_liquid_1.prepareReceivePayment)({
            paymentMethod: react_native_breez_sdk_liquid_1.PaymentMethod.LIGHTNING,
            amount: {
                type: react_native_breez_sdk_liquid_1.ReceiveAmountVariant.BITCOIN,
                payerAmountSat: payerAmountSat || currentLimits.receive.minSat,
            },
        });
        // If the fees are acceptable, continue to create the Receive Payment
        const receiveFeesSat = prepareResponse.feesSat;
        console.log("Receive fee in sats: ", receiveFeesSat);
        const res = await (0, react_native_breez_sdk_liquid_1.receivePayment)({
            prepareResponse,
            description,
        });
        const parsed = await (0, react_native_breez_sdk_liquid_1.parseInvoice)(res.destination);
        return Object.assign(Object.assign({}, parsed), { fee: receiveFeesSat });
    }
    catch (error) {
        console.log("Debugging the receive payment BREEZSDK", error);
        throw error;
    }
};
exports.receivePaymentBreezSDK = receivePaymentBreezSDK;
const receiveOnchainBreezSDK = async (amount) => {
    try {
        // Fetch the Onchain Receive limits
        const currentLimits = await (0, react_native_breez_sdk_liquid_1.fetchOnchainLimits)();
        console.log(`Minimum amount, in sats: ${currentLimits.receive.minSat}`);
        console.log(`Maximum amount, in sats: ${currentLimits.receive.maxSat}`);
        // Set the amount you wish the payer to send, which should be within the above limits
        const prepareResponse = await (0, react_native_breez_sdk_liquid_1.prepareReceivePayment)({
            paymentMethod: react_native_breez_sdk_liquid_1.PaymentMethod.BITCOIN_ADDRESS,
            amount: {
                type: react_native_breez_sdk_liquid_1.ReceiveAmountVariant.BITCOIN,
                payerAmountSat: amount || currentLimits.receive.minSat,
            },
        });
        // If the fees are acceptable, continue to create the Onchain Receive Payment
        const receiveFeesSat = prepareResponse.feesSat;
        console.log("Receive fee in sats", receiveFeesSat);
        const receiveOnchainResponse = await (0, react_native_breez_sdk_liquid_1.receivePayment)({ prepareResponse });
        return receiveOnchainResponse;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
};
exports.receiveOnchainBreezSDK = receiveOnchainBreezSDK;
const payLightningBreez = async (bolt11) => {
    try {
        const prepareResponse = await (0, react_native_breez_sdk_liquid_1.prepareSendPayment)({
            destination: bolt11,
        });
        // If the fees are acceptable, continue to create the Send Payment
        const receiveFeesSat = prepareResponse.feesSat;
        console.log("Receive fee in sats", receiveFeesSat);
        const sendResponse = await (0, react_native_breez_sdk_liquid_1.sendPayment)({ prepareResponse });
        if (sendResponse.payment.status === "failed") {
            console.log("Error paying Invoice: ", sendResponse);
            throw new Error(sendResponse.payment.status);
        }
        return sendResponse;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
};
exports.payLightningBreez = payLightningBreez;
const payOnchainBreez = async (destinationAddress, amountSat, feeRateSatPerVbyte, isSendingMax) => {
    try {
        const prepareResponse = await (0, react_native_breez_sdk_liquid_1.preparePayOnchain)({
            amount: {
                type: isSendingMax ? react_native_breez_sdk_liquid_1.PayAmountVariant.DRAIN : react_native_breez_sdk_liquid_1.PayAmountVariant.BITCOIN,
                receiverAmountSat: amountSat,
            },
            feeRateSatPerVbyte,
        });
        const payOnchainRes = await (0, react_native_breez_sdk_liquid_1.payOnchain)({
            address: destinationAddress,
            prepareResponse,
        });
        return payOnchainRes;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
};
exports.payOnchainBreez = payOnchainBreez;
const payLnurlBreez = async (lnurl, amountSat, memo) => {
    try {
        const input = await (0, react_native_breez_sdk_liquid_1.parse)(lnurl);
        if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_PAY) {
            const prepareResponse = await (0, react_native_breez_sdk_liquid_1.prepareLnurlPay)({
                data: input.data,
                amount: {
                    type: react_native_breez_sdk_liquid_1.PayAmountVariant.BITCOIN,
                    receiverAmountSat: amountSat,
                },
                bip353Address: input.bip353Address,
                comment: memo,
                validateSuccessActionUrl: true,
            });
            const lnUrlPayResult = await (0, react_native_breez_sdk_liquid_1.lnurlPay)({
                prepareResponse,
            });
            if (lnUrlPayResult.type === react_native_breez_sdk_liquid_1.LnUrlPayResultVariant.PAY_ERROR) {
                console.log("Error paying lnurl: ", lnUrlPayResult.data.reason);
                console.log("Reporting issue to Breez SDK");
                console.log("Payment hash: ", lnUrlPayResult.data.paymentHash);
                throw new Error(lnUrlPayResult.data.reason);
            }
            return lnUrlPayResult;
        }
        throw new Error("Unsupported input type");
    }
    catch (error) {
        throw error;
    }
};
exports.payLnurlBreez = payLnurlBreez;
const onRedeem = async (lnurl, settlementAmount, defaultDescription) => {
    var _a, _b, _c;
    try {
        const input = await (0, react_native_breez_sdk_liquid_1.parse)(lnurl);
        if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_PAY) {
            const prepareResponse = await (0, react_native_breez_sdk_liquid_1.prepareLnurlPay)({
                data: input.data,
                amount: {
                    type: react_native_breez_sdk_liquid_1.PayAmountVariant.BITCOIN,
                    receiverAmountSat: input.data.minSendable,
                },
                bip353Address: input.bip353Address,
                validateSuccessActionUrl: true,
            });
            const lnUrlPayResult = await (0, react_native_breez_sdk_liquid_1.lnurlPay)({ prepareResponse });
            console.log("LNURL PAY>>>>>>>>", lnUrlPayResult);
            if (lnUrlPayResult.type === react_native_breez_sdk_liquid_1.LnUrlPayResultVariant.ENDPOINT_SUCCESS) {
                return { success: true, error: undefined };
            }
            else {
                return { success: false, error: (_a = lnUrlPayResult === null || lnUrlPayResult === void 0 ? void 0 : lnUrlPayResult.data) === null || _a === void 0 ? void 0 : _a.reason };
            }
        }
        else if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_WITHDRAW) {
            const lnUrlWithdrawResult = await (0, react_native_breez_sdk_liquid_1.lnurlWithdraw)({
                data: input.data,
                amountMsat: settlementAmount
                    ? settlementAmount.amount * 1000
                    : input.data.minWithdrawable,
                description: defaultDescription,
            });
            console.log("LNURL WITHDRAW>>>>>>>>", lnUrlWithdrawResult);
            if (lnUrlWithdrawResult.type === react_native_breez_sdk_liquid_1.LnUrlWithdrawResultVariant.OK) {
                return { success: true, error: undefined };
            }
            else if (lnUrlWithdrawResult.type === react_native_breez_sdk_liquid_1.LnUrlWithdrawResultVariant.ERROR_STATUS) {
                return { success: false, error: (_b = lnUrlWithdrawResult === null || lnUrlWithdrawResult === void 0 ? void 0 : lnUrlWithdrawResult.data) === null || _b === void 0 ? void 0 : _b.reason };
            }
            else {
                return { success: false, error: undefined };
            }
        }
        else if (input.type === react_native_breez_sdk_liquid_1.InputTypeVariant.LN_URL_ERROR) {
            return { success: false, error: (_c = input === null || input === void 0 ? void 0 : input.data) === null || _c === void 0 ? void 0 : _c.reason };
        }
        else {
            return { success: false, error: "Invalid invoice" };
        }
    }
    catch (err) {
        return { success: false, error: err.message };
    }
};
exports.onRedeem = onRedeem;
const parseInvoiceBreezSDK = async (paymentRequest) => {
    try {
        const invoice = await (0, react_native_breez_sdk_liquid_1.parseInvoice)(paymentRequest);
        return invoice;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
};
exports.parseInvoiceBreezSDK = parseInvoiceBreezSDK;
const listPaymentsBreezSDK = async (offset, limit) => {
    try {
        const payments = await (0, react_native_breez_sdk_liquid_1.listPayments)({ offset, limit });
        return payments;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
};
exports.listPaymentsBreezSDK = listPaymentsBreezSDK;
//# sourceMappingURL=index.js.map