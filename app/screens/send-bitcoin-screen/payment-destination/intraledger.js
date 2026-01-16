"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIntraLedgerDestination = exports.resolveIntraledgerDestination = void 0;
const payment_details_1 = require("../payment-details");
const index_types_1 = require("./index.types");
const amounts_1 = require("@app/types/amounts");
const resolveIntraledgerDestination = async ({ parsedIntraledgerDestination, accountDefaultWalletQuery, myWalletIds, }) => {
    const { handle } = parsedIntraledgerDestination;
    console.log("Intraledger destination is", handle, parsedIntraledgerDestination);
    const handleWalletId = await getUserWalletId(handle, accountDefaultWalletQuery);
    console.log("HANDLE WALLET ID IS", handleWalletId);
    if (!handleWalletId) {
        return {
            valid: false,
            invalidReason: index_types_1.InvalidDestinationReason.UsernameDoesNotExist,
            invalidPaymentDestination: parsedIntraledgerDestination,
        };
    }
    if (myWalletIds.includes(handleWalletId)) {
        return {
            valid: false,
            invalidReason: index_types_1.InvalidDestinationReason.SelfPayment,
            invalidPaymentDestination: parsedIntraledgerDestination,
        };
    }
    return (0, exports.createIntraLedgerDestination)({
        parsedIntraledgerDestination,
        walletId: handleWalletId,
    });
};
exports.resolveIntraledgerDestination = resolveIntraledgerDestination;
const createIntraLedgerDestination = (params) => {
    const { parsedIntraledgerDestination: { handle }, walletId, } = params;
    const createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor, }) => {
        return (0, payment_details_1.createIntraledgerPaymentDetails)({
            handle,
            recipientWalletId: walletId,
            sendingWalletDescriptor,
            convertMoneyAmount,
            unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
        });
    };
    return {
        valid: true,
        createPaymentDetail,
        destinationDirection: index_types_1.DestinationDirection.Send,
        validDestination: Object.assign(Object.assign({}, params.parsedIntraledgerDestination), { walletId, valid: true }),
    };
};
exports.createIntraLedgerDestination = createIntraLedgerDestination;
const getUserWalletId = async (username, accountDefaultWalletQuery) => {
    var _a;
    const { data } = await accountDefaultWalletQuery({ variables: { username } });
    console.log("USER FETCHED is", data);
    return (_a = data === null || data === void 0 ? void 0 : data.accountDefaultWallet) === null || _a === void 0 ? void 0 : _a.id;
};
//# sourceMappingURL=intraledger.js.map