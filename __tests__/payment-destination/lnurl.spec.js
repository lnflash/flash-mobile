"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const payment_details_1 = require("@app/screens/send-bitcoin-screen/payment-details");
const ts_auto_mock_1 = require("ts-auto-mock");
const payment_destination_1 = require("@app/screens/send-bitcoin-screen/payment-destination");
const index_types_1 = require("@app/screens/send-bitcoin-screen/payment-destination/index.types");
const amounts_1 = require("@app/types/amounts");
const client_1 = require("@galoymoney/client");
const js_lnurl_1 = require("js-lnurl");
const helpers_1 = require("./helpers");
jest.mock("@galoymoney/client", () => {
    const actualModule = jest.requireActual("@galoymoney/client");
    return Object.assign(Object.assign({}, actualModule), { fetchLnurlPaymentParams: jest.fn() });
});
jest.mock("js-lnurl", () => {
    return {
        getParams: jest.fn(),
    };
});
jest.mock("@app/screens/send-bitcoin-screen/payment-details", () => {
    return {
        createLnurlPaymentDetails: jest.fn(),
    };
});
const mockFetchLnurlPaymentParams = client_1.fetchLnurlPaymentParams;
const mockGetParams = js_lnurl_1.getParams;
const mockCreateLnurlPaymentDetail = payment_details_1.createLnurlPaymentDetails;
const throwError = () => {
    throw new Error("test error");
};
describe("resolve lnurl destination", () => {
    describe("with ln address", () => {
        const lnurlPaymentDestinationParams = {
            parsedLnurlDestination: {
                paymentType: client_1.PaymentType.Lnurl,
                valid: true,
                lnurl: "test@domain.com",
            },
            lnurlDomains: ["ourdomain.com"],
            accountDefaultWalletQuery: jest.fn(),
            myWalletIds: ["testwalletid"],
        };
        it("creates lnurl pay destination", async () => {
            const lnurlPayParams = (0, ts_auto_mock_1.createMock)({
                identifier: lnurlPaymentDestinationParams.parsedLnurlDestination.lnurl,
            });
            mockFetchLnurlPaymentParams.mockResolvedValue(lnurlPayParams);
            mockGetParams.mockResolvedValue((0, ts_auto_mock_1.createMock)());
            const destination = await (0, payment_destination_1.resolveLnurlDestination)(lnurlPaymentDestinationParams);
            expect(destination).toEqual(expect.objectContaining({
                valid: true,
                destinationDirection: index_types_1.DestinationDirection.Send,
                validDestination: Object.assign(Object.assign({}, lnurlPaymentDestinationParams.parsedLnurlDestination), { lnurlParams: lnurlPayParams, valid: true }),
            }));
        });
    });
    describe("with lnurl pay string", () => {
        const lnurlPaymentDestinationParams = {
            parsedLnurlDestination: {
                paymentType: client_1.PaymentType.Lnurl,
                valid: true,
                lnurl: "lnurlrandomstring",
            },
            lnurlDomains: ["ourdomain.com"],
            accountDefaultWalletQuery: jest.fn(),
            myWalletIds: ["testwalletid"],
        };
        it("creates lnurl pay destination", async () => {
            const lnurlPayParams = (0, ts_auto_mock_1.createMock)({
                identifier: lnurlPaymentDestinationParams.parsedLnurlDestination.lnurl,
            });
            mockFetchLnurlPaymentParams.mockResolvedValue(lnurlPayParams);
            mockGetParams.mockResolvedValue((0, ts_auto_mock_1.createMock)());
            const destination = await (0, payment_destination_1.resolveLnurlDestination)(lnurlPaymentDestinationParams);
            expect(destination).toEqual(expect.objectContaining({
                valid: true,
                destinationDirection: index_types_1.DestinationDirection.Send,
                validDestination: Object.assign(Object.assign({}, lnurlPaymentDestinationParams.parsedLnurlDestination), { lnurlParams: lnurlPayParams, valid: true }),
            }));
        });
    });
    describe("with lnurl withdraw string", () => {
        const lnurlPaymentDestinationParams = {
            parsedLnurlDestination: {
                paymentType: client_1.PaymentType.Lnurl,
                valid: true,
                lnurl: "lnurlrandomstring",
            },
            lnurlDomains: ["ourdomain.com"],
            accountDefaultWalletQuery: jest.fn(),
            myWalletIds: ["testwalletid"],
        };
        it("creates lnurl withdraw destination", async () => {
            mockFetchLnurlPaymentParams.mockImplementation(throwError);
            const mockLnurlWithdrawParams = (0, ts_auto_mock_1.createMock)();
            mockGetParams.mockResolvedValue(mockLnurlWithdrawParams);
            const destination = await (0, payment_destination_1.resolveLnurlDestination)(lnurlPaymentDestinationParams);
            const { callback, domain, k1, maxWithdrawable, minWithdrawable, defaultDescription, } = mockLnurlWithdrawParams;
            expect(destination).toEqual(expect.objectContaining({
                valid: true,
                destinationDirection: index_types_1.DestinationDirection.Receive,
                validDestination: {
                    paymentType: client_1.PaymentType.Lnurl,
                    callback,
                    domain,
                    k1,
                    maxWithdrawable,
                    minWithdrawable,
                    defaultDescription,
                    valid: true,
                    lnurl: lnurlPaymentDestinationParams.parsedLnurlDestination.lnurl,
                },
            }));
        });
    });
});
describe("create lnurl destination", () => {
    it("correctly creates payment detail", () => {
        const lnurlPaymentDestinationParams = {
            paymentType: "lnurl",
            valid: true,
            lnurl: "testlnurl",
            lnurlParams: (0, ts_auto_mock_1.createMock)(),
        };
        const lnurlPayDestination = (0, payment_destination_1.createLnurlPaymentDestination)(lnurlPaymentDestinationParams);
        lnurlPayDestination.createPaymentDetail(helpers_1.defaultPaymentDetailParams);
        expect(mockCreateLnurlPaymentDetail).toBeCalledWith({
            lnurl: lnurlPaymentDestinationParams.lnurl,
            lnurlParams: lnurlPaymentDestinationParams.lnurlParams,
            unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
            convertMoneyAmount: helpers_1.defaultPaymentDetailParams.convertMoneyAmount,
            sendingWalletDescriptor: helpers_1.defaultPaymentDetailParams.sendingWalletDescriptor,
            destinationSpecifiedMemo: lnurlPaymentDestinationParams.lnurlParams.description,
        });
    });
});
//# sourceMappingURL=lnurl.spec.js.map