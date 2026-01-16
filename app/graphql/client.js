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
exports.GaloyClient = void 0;
const subscriptions_1 = require("@apollo/client/link/subscriptions");
const graphql_ws_1 = require("graphql-ws");
const client_1 = require("@apollo/client");
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const react_native_device_info_1 = __importDefault(require("react-native-device-info"));
const context_1 = require("@apollo/client/link/context");
const retry_1 = require("@apollo/client/link/retry");
const utilities_1 = require("@apollo/client/utilities");
const persisted_queries_1 = require("@apollo/client/link/persisted-queries");
const hooks_1 = require("@app/hooks");
const apollo3_cache_persist_1 = require("apollo3-cache-persist");
const js_sha256_1 = __importDefault(require("js-sha256"));
const react_1 = __importStar(require("react"));
const cache_1 = require("./cache");
const i18n_react_1 = require("@app/i18n/i18n-react");
const helper_1 = require("../utils/helper");
const storage_1 = require("../utils/storage");
const analytics_1 = require("./analytics");
const generated_1 = require("./generated");
const is_authed_context_1 = require("./is-authed-context");
const network_error_context_1 = require("./network-error-context");
const error_1 = require("@apollo/client/link/error");
const locale_detector_1 = require("@app/utils/locale-detector");
const messaging_1 = require("./messaging");
const config_1 = require("@app/config");
const level_component_1 = require("./level-component");
const use_device_token_1 = require("@app/screens/get-started-screen/use-device-token");
const noRetryOperations = [
    "intraLedgerPaymentSend",
    "intraLedgerUsdPaymentSend",
    "lnInvoiceFeeProbe",
    "lnInvoicePaymentSend",
    "lnNoAmountInvoiceFeeProbe",
    "lnNoAmountInvoicePaymentSend",
    "lnNoAmountUsdInvoiceFeeProbe",
    "lnUsdInvoiceFeeProbe",
    "lnNoAmountUsdInvoicePaymentSend",
    "onChainPaymentSend",
    "onChainUsdPaymentSend",
    "onChainUsdPaymentSendAsBtcDenominated",
    "onChainTxFee",
    "onChainUsdTxFee",
    "onChainUsdTxFeeAsBtcDenominated",
    // no need to retry to upload the token
    // specially as it's running on app start
    // and can create some unwanted loop when token is not valid
    "deviceNotificationTokenCreate",
];
const getAuthorizationHeader = (token) => {
    return `Bearer ${token}`;
};
const GaloyClient = ({ children }) => {
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const [networkError, setNetworkError] = (0, react_1.useState)(undefined);
    const hasNetworkErrorRef = (0, react_1.useRef)(false);
    const clearNetworkError = (0, react_1.useCallback)(() => {
        setNetworkError(undefined);
        hasNetworkErrorRef.current = false;
    }, []);
    const [apolloClient, setApolloClient] = (0, react_1.useState)();
    (0, react_1.useEffect)(() => {
        ;
        (async () => {
            const token = appConfig.token;
            console.log(`creating new apollo client, token: ${Boolean(token)}, uri: ${appConfig.galoyInstance.graphqlUri}`);
            const appCheckLink = (0, context_1.setContext)(async (_, { headers }) => {
                const appCheckToken = await (0, use_device_token_1.getAppCheckToken)();
                return appCheckToken
                    ? {
                        headers: Object.assign(Object.assign({}, headers), { Appcheck: appCheckToken }),
                    }
                    : {
                        headers,
                    };
            });
            const wsLinkConnectionParams = async () => {
                const authHeaders = token ? { Authorization: getAuthorizationHeader(token) } : {};
                const appCheckToken = await (0, use_device_token_1.getAppCheckToken)();
                const appCheckHeaders = appCheckToken ? { Appcheck: appCheckToken } : {};
                return Object.assign(Object.assign({}, authHeaders), appCheckHeaders);
            };
            const wsLink = new subscriptions_1.GraphQLWsLink((0, graphql_ws_1.createClient)({
                url: appConfig.galoyInstance.graphqlWsUri,
                retryAttempts: 12,
                connectionParams: wsLinkConnectionParams,
                shouldRetry: (errOrCloseEvent) => {
                    console.warn({ errOrCloseEvent }, "entering shouldRetry function for websocket");
                    // TODO: understand how the backend is closing the connection
                    // for instance during a new version rollout or k8s upgrade
                    //
                    // in the meantime:
                    // returning true instead of the default 'Any non-`CloseEvent`'
                    // to force createClient to attempt a reconnection
                    return true;
                },
                // Voluntary not using: webSocketImpl: WebSocket
                // seems react native already have an implement of the websocket?
                //
                // TODO: implement keepAlive and reconnection?
                // https://github.com/enisdenjo/graphql-ws/blob/master/docs/interfaces/client.ClientOptions.md#keepalive
            }));
            const errorLink = (0, error_1.onError)(({ graphQLErrors, networkError }) => {
                // graphqlErrors should be managed locally
                if (graphQLErrors)
                    graphQLErrors.forEach(({ message, locations, path }) => {
                        if (message === "PersistedQueryNotFound") {
                            console.log(`[GraphQL info]: Message: ${message}, Path: ${path}}`, {
                                locations,
                            });
                        }
                        else {
                            console.warn(`[GraphQL error]: Message: ${message}, Path: ${path}}`, {
                                locations,
                            });
                        }
                    });
                // only network error are managed globally
                if (networkError) {
                    console.log(`[Network error]: ${networkError}`);
                    if (!hasNetworkErrorRef.current) {
                        setNetworkError(networkError);
                        hasNetworkErrorRef.current = true;
                    }
                }
            });
            const retryLink = new retry_1.RetryLink({
                attempts: {
                    max: 5,
                    retryIf: (error, operation) => {
                        console.debug(JSON.stringify(error), "retry on error");
                        return (Boolean(error) &&
                            !noRetryOperations.includes(operation.operationName) &&
                            error.statusCode !== 401);
                    },
                },
            });
            const retry401ErrorLink = new retry_1.RetryLink({
                attempts: {
                    max: 2,
                    retryIf: (error) => {
                        return error && error.statusCode === 401;
                    },
                },
                delay: {
                    initial: 5000,
                    max: Infinity,
                    jitter: false,
                },
            });
            let authLink;
            if (token) {
                authLink = (0, context_1.setContext)((request, { headers }) => ({
                    headers: Object.assign(Object.assign({}, headers), { authorization: getAuthorizationHeader(token) }),
                }));
            }
            else {
                authLink = (0, context_1.setContext)((request, { headers }) => ({
                    headers: Object.assign(Object.assign({}, headers), { authorization: "" }),
                }));
            }
            const sha256 = js_sha256_1.default;
            const persistedQueryLink = (0, persisted_queries_1.createPersistedQueryLink)({ sha256 });
            const httpLink = new client_1.HttpLink({
                uri: appConfig.galoyInstance.graphqlUri,
            });
            const link = (0, client_1.split)(({ query }) => {
                const definition = (0, utilities_1.getMainDefinition)(query);
                return (definition.kind === "OperationDefinition" &&
                    definition.operation === "subscription");
            }, wsLink, client_1.ApolloLink.from([
                errorLink,
                retryLink,
                appCheckLink,
                authLink,
                retry401ErrorLink,
                persistedQueryLink,
                httpLink,
            ]));
            const cache = (0, cache_1.createCache)();
            const persistor = new apollo3_cache_persist_1.CachePersistor({
                cache,
                storage: new apollo3_cache_persist_1.AsyncStorageWrapper(async_storage_1.default),
                debug: __DEV__,
                persistenceMapper: async (_data) => {
                    // TODO:
                    // we should only store the last 20 transactions to keep the cache small
                    // there could be other data to filter as well
                    // filter your cached data and queries
                    // return filteredData
                    return _data;
                },
            });
            const readableVersion = react_native_device_info_1.default.getReadableVersion();
            const client = new client_1.ApolloClient({
                cache,
                link,
                name: helper_1.isIos ? "iOS" : "Android",
                version: readableVersion,
                connectToDevTools: true,
            });
            const SCHEMA_VERSION = "1";
            // Read the current version from AsyncStorage.
            const currentVersion = await (0, storage_1.loadString)(config_1.SCHEMA_VERSION_KEY);
            if (currentVersion === SCHEMA_VERSION) {
                // If the current version matches the latest version,
                // we're good to go and can restore the cache.
                await persistor.restore();
            }
            else {
                // Otherwise, we'll want to purge the outdated persisted cache
                // and mark ourselves as having updated to the latest version.
                // init the DB. will be override if a cache exists
                await persistor.purge();
                await (0, storage_1.saveString)(config_1.SCHEMA_VERSION_KEY, SCHEMA_VERSION);
            }
            client.onClearStore(persistor.purge);
            setApolloClient({
                client,
                isAuthed: Boolean(token),
            });
            clearNetworkError();
            return () => client.cache.reset();
        })();
    }, [appConfig.token, appConfig.galoyInstance, clearNetworkError]);
    // Before we show the app, we have to wait for our state to be ready.
    // In the meantime, don't render anything. This will be the background
    // color set in native by rootView's background color.
    //
    // This step should be completely covered over by the splash screen though.
    //
    // You're welcome to swap in your own component to render if your boot up
    // sequence is too slow though.
    if (!apolloClient) {
        return <></>;
    }
    return (<client_1.ApolloProvider client={apolloClient.client}>
      <is_authed_context_1.IsAuthedContextProvider value={apolloClient.isAuthed}>
        <level_component_1.LevelContainer>
          <network_error_context_1.NetworkErrorContextProvider value={{
            networkError,
            clearNetworkError,
        }}>
            <messaging_1.MessagingContainer />
            <LanguageSync />
            <analytics_1.AnalyticsContainer />
            <MyPriceUpdates />
            {children}
          </network_error_context_1.NetworkErrorContextProvider>
        </level_component_1.LevelContainer>
      </is_authed_context_1.IsAuthedContextProvider>
    </client_1.ApolloProvider>);
};
exports.GaloyClient = GaloyClient;
const MyPriceUpdates = () => {
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const pollInterval = 5 * 60 * 1000; // 5 min
    (0, generated_1.useRealtimePriceQuery)({
        // only fetch after pollInterval
        // the first query is done by the home page automatically
        fetchPolicy: "cache-only",
        nextFetchPolicy: "network-only",
        pollInterval,
        skip: !isAuthed,
    });
    return null;
};
const LanguageSync = () => {
    var _a;
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data } = (0, generated_1.useLanguageQuery)({ fetchPolicy: "cache-first", skip: !isAuthed });
    const userPreferredLocale = (0, locale_detector_1.getLocaleFromLanguage)((0, locale_detector_1.getLanguageFromString)((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.language));
    const { locale, setLocale } = (0, i18n_react_1.useI18nContext)();
    (0, react_1.useEffect)(() => {
        if (userPreferredLocale !== locale) {
            setLocale(userPreferredLocale);
        }
        // setLocale is not set as a dependency because it changes every render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userPreferredLocale, locale]);
    return <></>;
};
//# sourceMappingURL=client.js.map