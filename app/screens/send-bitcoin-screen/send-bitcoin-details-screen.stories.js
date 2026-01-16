"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Intraledger = void 0;
const testing_1 = require("@apollo/client/testing");
const client_1 = require("@galoymoney/client");
const react_1 = __importDefault(require("react"));
const views_1 = require("../../../.storybook/views");
const cache_1 = require("../../graphql/cache");
const is_authed_context_1 = require("../../graphql/is-authed-context");
const send_bitcoin_details_screen_1 = __importDefault(require("./send-bitcoin-details-screen"));
const mocks_1 = __importDefault(require("../../graphql/mocks"));
const index_types_1 = require("./payment-destination/index.types");
const payment_details_1 = require("./payment-details");
const amounts_1 = require("@app/types/amounts");
exports.default = {
    title: "SendBitcoinDetailsScreen",
    component: send_bitcoin_details_screen_1.default,
    decorators: [
        (Story) => (<is_authed_context_1.IsAuthedContextProvider value={true}>
        <testing_1.MockedProvider mocks={mocks_1.default} cache={(0, cache_1.createCache)()}>
          <views_1.StoryScreen>{Story()}</views_1.StoryScreen>
        </testing_1.MockedProvider>
      </is_authed_context_1.IsAuthedContextProvider>),
    ],
};
const walletId = "f79792e3-282b-45d4-85d5-7486d020def5";
const handle = "test";
const validDestination = {
    valid: true,
    walletId,
    paymentType: client_1.PaymentType.Intraledger,
    handle,
};
/* eslint @typescript-eslint/ban-ts-comment: "off" */
// @ts-ignore-next-line no-implicit-any error
const createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor }) => {
    return (0, payment_details_1.createIntraledgerPaymentDetails)({
        handle,
        recipientWalletId: walletId,
        sendingWalletDescriptor,
        convertMoneyAmount,
        unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
    });
};
const paymentDestination = {
    valid: true,
    validDestination,
    destinationDirection: index_types_1.DestinationDirection.Send,
    // @ts-ignore-next-line no-implicit-any error
    createPaymentDetail,
};
const route = {
    key: "sendBitcoinDetailsScreen",
    name: "sendBitcoinDetails",
    params: {
        paymentDestination,
    },
};
const Intraledger = () => <send_bitcoin_details_screen_1.default route={route}/>;
exports.Intraledger = Intraledger;
//# sourceMappingURL=send-bitcoin-details-screen.stories.js.map