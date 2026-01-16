"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetDisplayCurrency = exports.payTestUsername = exports.resetEmail = exports.resetLanguage = exports.payNoAmountInvoice = exports.payAmountInvoice = exports.getInvoice = exports.checkContact = exports.userToken = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("../../app/graphql/generated");
const retry_1 = require("@apollo/client/link/retry");
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const config = {
    network: "signet",
    graphqlUrl: "https://api.staging.galoy.io/graphql",
};
const createGaloyServerClient = (config) => (authToken) => {
    const httpLink = (0, client_1.createHttpLink)({
        uri: config.graphqlUrl,
        headers: {
            authorization: authToken ? `Bearer ${authToken}` : "",
        },
        fetch: cross_fetch_1.default,
    });
    const retryLink = new retry_1.RetryLink();
    const link = client_1.ApolloLink.from([retryLink, httpLink]);
    return new client_1.ApolloClient({
        ssrMode: true,
        link,
        cache: new client_1.InMemoryCache(),
    });
};
const getRandomToken = (arr) => {
    const randomIndex = Math.floor(Math.random() * arr.length);
    console.log("Choosing token at random index: ", randomIndex);
    return arr[randomIndex];
};
const authTokens = (_a = process.env.GALOY_TEST_TOKENS) === null || _a === void 0 ? void 0 : _a.split(",");
if (authTokens === undefined) {
    console.error("-----------------------------");
    console.error("GALOY_TEST_TOKENS not set");
    console.error("-----------------------------");
    process.exit(1);
}
exports.userToken = getRandomToken(authTokens);
const receiverToken = process.env.GALOY_TOKEN_2 || "";
(0, client_1.gql) `
  query wallets {
    me {
      id
      defaultAccount {
        id
        wallets {
          walletCurrency
          id
          lnurlp
        }
      }
    }
  }
`;
const checkContact = async (username) => {
    var _a, _b;
    const client = createGaloyServerClient(config)(exports.userToken);
    const contactResult = await client.query({
        query: generated_1.ContactsDocument,
        fetchPolicy: "no-cache",
    });
    const contactList = (_a = contactResult.data.me) === null || _a === void 0 ? void 0 : _a.contacts;
    const isContactAvailable = (_b = contactResult.data.me) === null || _b === void 0 ? void 0 : _b.contacts.some((contact) => contact.username.toLocaleLowerCase() === (username === null || username === void 0 ? void 0 : username.toLocaleLowerCase()));
    return { isContactAvailable, contactList };
};
exports.checkContact = checkContact;
const getWalletId = async (client, walletCurrency) => {
    var _a;
    const accountResult = await client.query({
        query: generated_1.WalletsDocument,
        fetchPolicy: "no-cache",
    });
    const walletId = (_a = accountResult.data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.wallets.filter((w) => w.walletCurrency === walletCurrency)[0].id;
    return walletId;
};
const getInvoice = async () => {
    const client = createGaloyServerClient(config)(receiverToken);
    const walletId = await getWalletId(client, "BTC");
    const result = await client.mutate({
        variables: { input: { walletId } },
        mutation: generated_1.LnNoAmountInvoiceCreateDocument,
        fetchPolicy: "no-cache",
    });
    const invoice = result.data.lnNoAmountInvoiceCreate.invoice.paymentRequest;
    return invoice;
};
exports.getInvoice = getInvoice;
const payAmountInvoice = async ({ invoice, memo, }) => {
    var _a;
    const client = createGaloyServerClient(config)(receiverToken);
    const walletId = await getWalletId(client, "BTC");
    const result = await client.mutate({
        variables: {
            input: {
                memo,
                walletId,
                paymentRequest: invoice,
            },
        },
        mutation: generated_1.LnInvoicePaymentSendDocument,
        fetchPolicy: "no-cache",
    });
    const paymentStatus = (_a = result.data) === null || _a === void 0 ? void 0 : _a.lnInvoicePaymentSend.status;
    return { paymentStatus, result };
};
exports.payAmountInvoice = payAmountInvoice;
const payNoAmountInvoice = async ({ invoice, walletCurrency, }) => {
    var _a, _b;
    const client = createGaloyServerClient(config)(receiverToken);
    const walletId = await getWalletId(client, walletCurrency);
    const mutation = walletCurrency === generated_1.WalletCurrency.Btc
        ? generated_1.LnNoAmountInvoicePaymentSendDocument
        : generated_1.LnNoAmountUsdInvoicePaymentSendDocument;
    const amount = walletCurrency === generated_1.WalletCurrency.Btc ? 150 : 2;
    const result = await client.mutate({
        variables: {
            input: {
                walletId,
                paymentRequest: invoice,
                amount,
            },
        },
        mutation,
        fetchPolicy: "no-cache",
    });
    let paymentStatus;
    if (result.data) {
        if ("lnNoAmountInvoicePaymentSend" in result.data) {
            paymentStatus = (_a = result.data) === null || _a === void 0 ? void 0 : _a.lnNoAmountInvoicePaymentSend.status;
        }
        else if ("lnNoAmountUsdInvoicePaymentSend" in result.data) {
            paymentStatus = (_b = result.data) === null || _b === void 0 ? void 0 : _b.lnNoAmountUsdInvoicePaymentSend.status;
        }
    }
    return { paymentStatus, result };
};
exports.payNoAmountInvoice = payNoAmountInvoice;
const resetLanguage = async () => {
    const client = createGaloyServerClient(config)(exports.userToken);
    return client.mutate({
        variables: {
            input: {
                language: "",
            },
        },
        mutation: generated_1.UserUpdateLanguageDocument,
        fetchPolicy: "no-cache",
    });
};
exports.resetLanguage = resetLanguage;
const resetEmail = async () => {
    const client = createGaloyServerClient(config)(exports.userToken);
    return client.mutate({
        variables: {
            input: {
                language: "",
            },
        },
        mutation: generated_1.UserEmailDeleteDocument,
        fetchPolicy: "no-cache",
    });
};
exports.resetEmail = resetEmail;
const payTestUsername = async () => {
    const userClient = createGaloyServerClient(config)(exports.userToken);
    const recipientClient = createGaloyServerClient(config)(receiverToken);
    const walletId = await getWalletId(userClient, "BTC");
    const recipientWalletId = await getWalletId(recipientClient, "BTC");
    const result = await userClient.mutate({
        variables: {
            input: {
                walletId,
                recipientWalletId,
                amount: 100,
            },
        },
        mutation: generated_1.IntraLedgerPaymentSendDocument,
        fetchPolicy: "no-cache",
    });
    return result;
};
exports.payTestUsername = payTestUsername;
const resetDisplayCurrency = async () => {
    const client = createGaloyServerClient(config)(exports.userToken);
    const result = await client.mutate({
        variables: {
            input: {
                currency: "USD",
            },
        },
        mutation: generated_1.AccountUpdateDisplayCurrencyDocument,
        fetchPolicy: "no-cache",
    });
    return result;
};
exports.resetDisplayCurrency = resetDisplayCurrency;
//# sourceMappingURL=graphql.js.map