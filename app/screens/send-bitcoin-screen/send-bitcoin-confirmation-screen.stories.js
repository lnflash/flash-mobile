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
exports.Intraledger = void 0;
const testing_1 = require("@apollo/client/testing");
const react_1 = __importDefault(require("react"));
const views_1 = require("../../../.storybook/views");
const cache_1 = require("../../graphql/cache");
const is_authed_context_1 = require("../../graphql/is-authed-context");
const send_bitcoin_confirmation_screen_1 = __importDefault(require("./send-bitcoin-confirmation-screen"));
const PaymentDetails = __importStar(require("./payment-details/intraledger"));
const mocks_1 = __importDefault(require("../../graphql/mocks"));
const generated_1 = require("../../graphql/generated");
const amounts_1 = require("@app/types/amounts");
exports.default = {
    title: "SendBitcoinConfirmationScreen",
    component: send_bitcoin_confirmation_screen_1.default,
    decorators: [
        (Story) => (<is_authed_context_1.IsAuthedContextProvider value={true}>
        <testing_1.MockedProvider mocks={mocks_1.default} cache={(0, cache_1.createCache)()}>
          <views_1.StoryScreen>{Story()}</views_1.StoryScreen>
        </testing_1.MockedProvider>
      </is_authed_context_1.IsAuthedContextProvider>),
    ],
};
const btcSendingWalletDescriptor = {
    currency: generated_1.WalletCurrency.Usd,
    id: "testwallet",
};
const convertMoneyAmountMock = (amount, currency) => {
    return {
        amount: amount.amount,
        currency,
        currencyCode: currency === amounts_1.DisplayCurrency ? "NGN" : currency,
    };
};
const testAmount = (0, amounts_1.toUsdMoneyAmount)(100);
const defaultParams = {
    handle: "test",
    recipientWalletId: "testid",
    convertMoneyAmount: convertMoneyAmountMock,
    sendingWalletDescriptor: btcSendingWalletDescriptor,
    unitOfAccountAmount: testAmount,
};
const { createIntraledgerPaymentDetails } = PaymentDetails;
const paymentDetail = createIntraledgerPaymentDetails(defaultParams);
const route = {
    key: "sendBitcoinConfirmationScreen",
    name: "sendBitcoinConfirmation",
    params: {
        paymentDetail,
    },
};
const Intraledger = () => <send_bitcoin_confirmation_screen_1.default route={route}/>;
exports.Intraledger = Intraledger;
//# sourceMappingURL=send-bitcoin-confirmation-screen.stories.js.map