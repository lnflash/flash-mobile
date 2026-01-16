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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDestination = void 0;
const client_1 = require("@flash/client");
const index_types_1 = require("./index.types");
const intraledger_1 = require("./intraledger");
const lightning_1 = require("./lightning");
const lnurl_1 = require("./lnurl");
const onchain_1 = require("./onchain");
__exportStar(require("./intraledger"), exports);
__exportStar(require("./lightning"), exports);
__exportStar(require("./lnurl"), exports);
__exportStar(require("./onchain"), exports);
const parseDestination = async ({ rawInput, myWalletIds, 
// bitcoinNetwork, // hard coded to mainnet
lnurlDomains, accountDefaultWalletQuery, }) => {
    const parsedDestination = (0, client_1.parsePaymentDestination)({
        destination: rawInput,
        network: "mainnet",
        lnAddressDomains: lnurlDomains,
    });
    switch (parsedDestination.paymentType) {
        case client_1.PaymentType.Intraledger: {
            return (0, intraledger_1.resolveIntraledgerDestination)({
                parsedIntraledgerDestination: parsedDestination,
                accountDefaultWalletQuery,
                myWalletIds,
            });
        }
        case client_1.PaymentType.Lnurl: {
            return (0, lnurl_1.resolveLnurlDestination)({
                parsedLnurlDestination: parsedDestination,
                lnurlDomains,
                accountDefaultWalletQuery,
                myWalletIds,
            });
        }
        case client_1.PaymentType.Lightning: {
            return (0, lightning_1.resolveLightningDestination)(parsedDestination);
        }
        case client_1.PaymentType.Onchain: {
            return (0, onchain_1.resolveOnchainDestination)(parsedDestination);
        }
        default: {
            return {
                valid: false,
                invalidReason: index_types_1.InvalidDestinationReason.UnknownDestination,
                invalidPaymentDestination: parsedDestination,
            };
        }
    }
};
exports.parseDestination = parseDestination;
//# sourceMappingURL=index.js.map