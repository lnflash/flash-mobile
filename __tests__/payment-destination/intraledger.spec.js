"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockCreateIntraledgerPaymentDetail = jest.fn();
jest.mock("@app/screens/send-bitcoin-screen/payment-details", () => {
    return {
        createIntraledgerPaymentDetails: mockCreateIntraledgerPaymentDetail,
    };
});
const payment_destination_1 = require("@app/screens/send-bitcoin-screen/payment-destination");
const helpers_1 = require("./helpers");
const index_types_1 = require("@app/screens/send-bitcoin-screen/payment-destination/index.types");
const amounts_1 = require("@app/types/amounts");
describe("resolve intraledger", () => {
    const defaultIntraledgerParams = {
        parsedIntraledgerDestination: {
            paymentType: "intraledger",
            handle: "testhandle",
        },
        accountDefaultWalletQuery: jest.fn(),
        myWalletIds: ["testwalletid"],
    };
    it("returns invalid destination if wallet is not found", async () => {
        defaultIntraledgerParams.accountDefaultWalletQuery.mockResolvedValue({ data: {} });
        const destination = await (0, payment_destination_1.resolveIntraledgerDestination)(defaultIntraledgerParams);
        expect(destination).toEqual({
            valid: false,
            invalidReason: index_types_1.InvalidDestinationReason.UsernameDoesNotExist,
            invalidPaymentDestination: defaultIntraledgerParams.parsedIntraledgerDestination,
        });
    });
    it("returns invalid destination if user is owned by self", async () => {
        defaultIntraledgerParams.accountDefaultWalletQuery.mockResolvedValue({
            data: { accountDefaultWallet: { id: "testwalletid" } },
        });
        const destination = await (0, payment_destination_1.resolveIntraledgerDestination)(defaultIntraledgerParams);
        expect(destination).toEqual({
            valid: false,
            invalidReason: index_types_1.InvalidDestinationReason.SelfPayment,
            invalidPaymentDestination: defaultIntraledgerParams.parsedIntraledgerDestination,
        });
    });
    it("returns a valid destination if username exists", async () => {
        defaultIntraledgerParams.accountDefaultWalletQuery.mockResolvedValue({
            data: { accountDefaultWallet: { id: "successwalletid" } },
        });
        const destination = await (0, payment_destination_1.resolveIntraledgerDestination)(defaultIntraledgerParams);
        expect(destination).toEqual(expect.objectContaining({
            valid: true,
            validDestination: Object.assign(Object.assign({}, defaultIntraledgerParams.parsedIntraledgerDestination), { walletId: "successwalletid", valid: true }),
        }));
    });
});
describe("create intraledger destination", () => {
    const createIntraLedgerDestinationParams = {
        parsedIntraledgerDestination: {
            paymentType: "intraledger",
            handle: "testhandle",
        },
        walletId: "testwalletid",
    };
    it("correctly creates payment detail", () => {
        const intraLedgerDestination = (0, payment_destination_1.createIntraLedgerDestination)(createIntraLedgerDestinationParams);
        intraLedgerDestination.createPaymentDetail(helpers_1.defaultPaymentDetailParams);
        expect(mockCreateIntraledgerPaymentDetail).toBeCalledWith({
            handle: createIntraLedgerDestinationParams.parsedIntraledgerDestination.handle,
            recipientWalletId: createIntraLedgerDestinationParams.walletId,
            sendingWalletDescriptor: helpers_1.defaultPaymentDetailParams.sendingWalletDescriptor,
            convertMoneyAmount: helpers_1.defaultPaymentDetailParams.convertMoneyAmount,
            unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
        });
    });
});
//# sourceMappingURL=intraledger.spec.js.map