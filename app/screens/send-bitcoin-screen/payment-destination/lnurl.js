"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLnurlWithdrawDestination = exports.createLnurlPaymentDestination = exports.resolveLnurlDestination = void 0;
const client_1 = require("@galoymoney/client");
const amounts_1 = require("@app/types/amounts");
const js_lnurl_1 = require("js-lnurl");
const payment_details_1 = require("../payment-details");
const index_types_1 = require("./index.types");
const intraledger_1 = require("./intraledger");
const lnurl_pay_1 = require("lnurl-pay");
const resolveLnurlDestination = async ({ parsedLnurlDestination, lnurlDomains, accountDefaultWalletQuery, myWalletIds, }) => {
    // TODO: Move all logic to galoy client or out of galoy client, currently lnurl pay is handled by galoy client
    // but lnurl withdraw is handled here
    if (parsedLnurlDestination.valid) {
        const lnurlParams = await (0, js_lnurl_1.getParams)(parsedLnurlDestination.lnurl);
        // Check for lnurl withdraw request
        if ("tag" in lnurlParams && lnurlParams.tag === "withdrawRequest") {
            return (0, exports.createLnurlWithdrawDestination)({
                lnurl: parsedLnurlDestination.lnurl,
                callback: lnurlParams.callback,
                domain: lnurlParams.domain,
                k1: lnurlParams.k1,
                defaultDescription: lnurlParams.defaultDescription,
                minWithdrawable: lnurlParams.minWithdrawable,
                maxWithdrawable: lnurlParams.maxWithdrawable,
            });
        }
        // Check for lnurl pay request
        try {
            const lnurlPayParams = await (0, lnurl_pay_1.requestPayServiceParams)({
                lnUrlOrAddress: parsedLnurlDestination.lnurl,
            });
            if (lnurlPayParams) {
                const maybeIntraledgerDestination = await tryGetIntraLedgerDestinationFromLnurl({
                    lnurlDomains,
                    lnurlPayParams,
                    myWalletIds,
                    accountDefaultWalletQuery,
                });
                if (maybeIntraledgerDestination && maybeIntraledgerDestination.valid) {
                    return maybeIntraledgerDestination;
                }
                return (0, exports.createLnurlPaymentDestination)(Object.assign({ lnurlParams: lnurlPayParams }, parsedLnurlDestination));
            }
        }
        catch (_a) {
            // Do nothing because it may be a lnurl withdraw request
        }
        return {
            valid: false,
            invalidReason: index_types_1.InvalidDestinationReason.LnurlUnsupported,
            invalidPaymentDestination: parsedLnurlDestination,
        };
    }
    return {
        valid: false,
        invalidReason: index_types_1.InvalidDestinationReason.LnurlError,
        invalidPaymentDestination: parsedLnurlDestination,
    };
};
exports.resolveLnurlDestination = resolveLnurlDestination;
// TODO: move to galoy-client
const tryGetIntraLedgerDestinationFromLnurl = ({ lnurlPayParams, lnurlDomains, accountDefaultWalletQuery, myWalletIds, }) => {
    const intraLedgerHandleFromLnurl = getIntraLedgerHandleIfLnurlIsOurOwn({
        lnurlPayParams,
        lnurlDomains,
    });
    if (intraLedgerHandleFromLnurl) {
        return (0, intraledger_1.resolveIntraledgerDestination)({
            parsedIntraledgerDestination: {
                paymentType: client_1.PaymentType.Intraledger,
                handle: intraLedgerHandleFromLnurl,
                valid: true,
            },
            accountDefaultWalletQuery,
            myWalletIds,
        });
    }
    return undefined;
};
const getIntraLedgerHandleIfLnurlIsOurOwn = ({ lnurlPayParams, lnurlDomains, }) => {
    const [username, domain] = lnurlPayParams.identifier.split("@");
    if (domain && lnurlDomains.includes(domain)) {
        return username;
    }
    return undefined;
};
const createLnurlPaymentDestination = (resolvedLnurlPaymentDestination) => {
    const createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor, }) => {
        const minAmount = resolvedLnurlPaymentDestination.lnurlParams.min || 0;
        return (0, payment_details_1.createLnurlPaymentDetails)({
            lnurl: resolvedLnurlPaymentDestination.lnurl,
            lnurlParams: resolvedLnurlPaymentDestination.lnurlParams,
            sendingWalletDescriptor,
            destinationSpecifiedMemo: resolvedLnurlPaymentDestination.lnurlParams.description,
            convertMoneyAmount,
            unitOfAccountAmount: (0, amounts_1.toBtcMoneyAmount)(minAmount),
        });
    };
    return {
        valid: true,
        destinationDirection: index_types_1.DestinationDirection.Send,
        validDestination: resolvedLnurlPaymentDestination,
        createPaymentDetail,
    };
};
exports.createLnurlPaymentDestination = createLnurlPaymentDestination;
const createLnurlWithdrawDestination = (params) => {
    return {
        valid: true,
        destinationDirection: index_types_1.DestinationDirection.Receive,
        validDestination: Object.assign(Object.assign({}, params), { paymentType: client_1.PaymentType.Lnurl, valid: true }),
    };
};
exports.createLnurlWithdrawDestination = createLnurlWithdrawDestination;
//# sourceMappingURL=lnurl.js.map