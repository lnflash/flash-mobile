"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentRequest = void 0;
const generated_1 = require("@app/graphql/generated");
const index_types_1 = require("./index.types");
const helpers_1 = require("./helpers");
const bech32_1 = require("bech32");
// Breez SDK
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const createPaymentRequest = (params) => {
    let { state, info } = params;
    if (!state)
        state = index_types_1.PaymentRequestState.Idle;
    const setState = (state) => {
        if (state === index_types_1.PaymentRequestState.Loading)
            return (0, exports.createPaymentRequest)(Object.assign(Object.assign({}, params), { state, info: undefined }));
        return (0, exports.createPaymentRequest)(Object.assign(Object.assign({}, params), { state }));
    };
    // Breez SDK OnChain
    const fetchBreezOnchain = async (amount) => {
        try {
            const fetchedBreezOnChain = await (0, breez_sdk_liquid_1.receiveOnchainBreezSDK)(amount);
            return fetchedBreezOnChain.destination;
        }
        catch (error) {
            console.error("Error fetching breezOnChain:", error);
        }
    };
    // Breez SDK Lightning
    const fetchBreezInvoice = async (amount, memo) => {
        try {
            const fetchedBreezInvoice = await (0, breez_sdk_liquid_1.receivePaymentBreezSDK)(amount, memo);
            const formattedBreezInvoice = {
                lnInvoiceCreate: {
                    errors: [],
                    invoice: {
                        paymentHash: fetchedBreezInvoice.paymentHash,
                        paymentRequest: fetchedBreezInvoice.bolt11,
                        paymentSecret: fetchedBreezInvoice.paymentSecret
                            ? Array.from(fetchedBreezInvoice.paymentSecret)
                                .map((byte) => byte.toString(16))
                                .join("")
                            : "",
                    },
                },
            };
            return formattedBreezInvoice;
        }
        catch (error) {
            console.error("Error fetching breezInvoice:", error);
        }
    };
    const generateQuote = async () => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const { creationData, mutations } = params;
        const pr = Object.assign({}, creationData); // clone creation data object
        let info;
        const generateLightningInfo = (invoice, applicationErrors, gqlErrors) => {
            var _a;
            const dateString = (0, helpers_1.prToDateString)((_a = invoice.paymentRequest) !== null && _a !== void 0 ? _a : "", "mainnet");
            const getFullUriFn = ({ uppercase, prefix }) => {
                var _a;
                return (0, helpers_1.getPaymentRequestFullUri)({
                    type: index_types_1.Invoice.Lightning,
                    input: (invoice === null || invoice === void 0 ? void 0 : invoice.paymentRequest) || "",
                    amount: (_a = pr.settlementAmount) === null || _a === void 0 ? void 0 : _a.amount,
                    memo: pr.memo,
                    uppercase,
                    prefix,
                    wallet: pr.receivingWalletDescriptor.currency,
                    convertMoneyAmount: pr.convertMoneyAmount,
                });
            };
            return {
                data: invoice
                    ? Object.assign(Object.assign({ invoiceType: index_types_1.Invoice.Lightning }, invoice), { expiresAt: dateString ? new Date(dateString) : undefined, getFullUriFn }) : undefined,
                applicationErrors,
                gqlErrors,
            };
        };
        const generateOnChainInfo = (address, applicationErrors, gqlErrors) => {
            const getFullUriFn = ({ uppercase, prefix }) => {
                var _a;
                return (0, helpers_1.getPaymentRequestFullUri)({
                    type: index_types_1.Invoice.OnChain,
                    input: address || "",
                    amount: (_a = pr.settlementAmount) === null || _a === void 0 ? void 0 : _a.amount,
                    memo: pr.memo,
                    uppercase,
                    prefix,
                    wallet: pr.receivingWalletDescriptor.currency,
                    convertMoneyAmount: pr.convertMoneyAmount,
                });
            };
            return {
                data: address
                    ? {
                        invoiceType: index_types_1.Invoice.OnChain,
                        getFullUriFn,
                        address,
                        amount: pr.settlementAmount,
                        memo: pr.memo,
                    }
                    : undefined,
                applicationErrors,
                gqlErrors,
            };
        };
        // Default memo
        if (!pr.memo) {
            pr.memo = `Pay to Flash Wallet User${pr.username ? ": " + pr.username : ""}`;
        }
        if (creationData.receivingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
            // Handle BTC payment requests
            if (pr.type === index_types_1.Invoice.Lightning) {
                const fetchedBreezInvoice = await fetchBreezInvoice((_a = pr.settlementAmount) === null || _a === void 0 ? void 0 : _a.amount, pr.memo);
                info = generateLightningInfo(fetchedBreezInvoice.lnInvoiceCreate.invoice, [], []);
            }
            else if (pr.type === index_types_1.Invoice.OnChain) {
                const fetchedBreezOnchain = await fetchBreezOnchain((_b = pr.settlementAmount) === null || _b === void 0 ? void 0 : _b.amount);
                info = generateOnChainInfo(fetchedBreezOnchain || "", [], []);
            }
        }
        else {
            // Handle USD payment requests
            if (pr.type === index_types_1.Invoice.Lightning) {
                if (pr.settlementAmount && ((_c = pr.settlementAmount) === null || _c === void 0 ? void 0 : _c.currency) === generated_1.WalletCurrency.Usd) {
                    console.log("Invoice create amount: ", pr.settlementAmount.amount);
                    const { data, errors } = await mutations.lnUsdInvoiceCreate({
                        variables: {
                            input: {
                                walletId: pr.receivingWalletDescriptor.id,
                                amount: pr.settlementAmount.amount,
                                memo: pr.memo,
                            },
                        },
                    });
                    info = generateLightningInfo(data === null || data === void 0 ? void 0 : data.lnUsdInvoiceCreate.invoice, (_d = data === null || data === void 0 ? void 0 : data.lnUsdInvoiceCreate) === null || _d === void 0 ? void 0 : _d.errors, errors);
                }
                else if (pr.settlementAmount === undefined ||
                    pr.settlementAmount.amount === 0) {
                    const { data, errors } = await mutations.lnUsdInvoiceCreate({
                        variables: {
                            input: {
                                walletId: pr.receivingWalletDescriptor.id,
                                amount: 0,
                                memo: pr.memo,
                            },
                        },
                    });
                    info = generateLightningInfo(data === null || data === void 0 ? void 0 : data.lnUsdInvoiceCreate.invoice, (_e = data === null || data === void 0 ? void 0 : data.lnUsdInvoiceCreate) === null || _e === void 0 ? void 0 : _e.errors, errors);
                }
            }
            else if (pr.type === index_types_1.Invoice.OnChain) {
                const result = await mutations.onChainAddressCurrent({
                    variables: { input: { walletId: pr.receivingWalletDescriptor.id } },
                });
                info = generateOnChainInfo(((_f = result.data) === null || _f === void 0 ? void 0 : _f.onChainAddressCurrent.address) || "", (_g = result.data) === null || _g === void 0 ? void 0 : _g.onChainAddressCurrent.errors, result.errors);
            }
            else if (pr.type === index_types_1.Invoice.PayCode && pr.username) {
                const lnurl = await new Promise((resolve) => {
                    resolve(bech32_1.bech32.encode("lnurl", bech32_1.bech32.toWords(Buffer.from(`${pr.posUrl}/.well-known/lnurlp/${pr.username}`, "utf8")), 1500));
                });
                await new Promise((r) => {
                    setTimeout(r, 50);
                });
                const webURL = `${pr.posUrl}/${pr.username}`;
                const qrCodeURL = webURL.toUpperCase() + "?lightning=" + lnurl.toUpperCase();
                const getFullUriFn = ({ uppercase, prefix }) => (0, helpers_1.getPaymentRequestFullUri)({
                    type: index_types_1.Invoice.PayCode,
                    input: qrCodeURL,
                    uppercase,
                    prefix,
                    wallet: pr.receivingWalletDescriptor.currency,
                    convertMoneyAmount: pr.convertMoneyAmount,
                });
                info = {
                    data: {
                        invoiceType: index_types_1.Invoice.PayCode,
                        username: pr.username,
                        getFullUriFn,
                    },
                    applicationErrors: undefined,
                    gqlErrors: undefined,
                };
            }
            else if (pr.type === index_types_1.Invoice.PayCode && !pr.username) {
                // Can't create paycode payment request for a user with no username set so info will be empty
                return (0, exports.createPaymentRequest)(Object.assign(Object.assign({}, params), { state: index_types_1.PaymentRequestState.Created, info: undefined }));
            }
            else {
                info = undefined;
                console.log(JSON.stringify({ pr }, null, 2));
                throw new Error("Unknown Payment Request Type Encountered - Please Report");
            }
        }
        let state = index_types_1.PaymentRequestState.Created;
        if (!info || ((_h = info.applicationErrors) === null || _h === void 0 ? void 0 : _h.length) || ((_j = info.gqlErrors) === null || _j === void 0 ? void 0 : _j.length) || !info.data) {
            state = index_types_1.PaymentRequestState.Error;
        }
        return (0, exports.createPaymentRequest)(Object.assign(Object.assign({}, params), { info, state }));
    };
    return Object.assign(Object.assign({}, params), { state, info, generateRequest: generateQuote, setState });
};
exports.createPaymentRequest = createPaymentRequest;
//# sourceMappingURL=payment-request.js.map