"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GALOY_INSTANCES = exports.resolveGaloyInstanceOrDefault = exports.possibleGaloyInstanceNames = void 0;
const react_native_1 = require("react-native");
// this is used for local development
// will typically return localhost
const scriptHostname = () => {
    var _a;
    const { scriptURL } = react_native_1.NativeModules.SourceCode;
    const scriptHostname = (_a = scriptURL === null || scriptURL === void 0 ? void 0 : scriptURL.split("://")[1].split(":")[0]) !== null && _a !== void 0 ? _a : "";
    return scriptHostname;
};
exports.possibleGaloyInstanceNames = [
    "Main",
    "Staging",
    "Test",
    "Sandbox",
    "Development",
    "Local",
    "Custom",
];
const resolveGaloyInstanceOrDefault = (input) => {
    if (input.id === "Custom") {
        return input;
    }
    const instance = exports.GALOY_INSTANCES.find((instance) => instance.id === input.id);
    // branch only to please typescript. Array,find have T | undefined as return type
    if (instance === undefined) {
        console.error("instance not found"); // should not happen
        return exports.GALOY_INSTANCES[0];
    }
    return instance;
};
exports.resolveGaloyInstanceOrDefault = resolveGaloyInstanceOrDefault;
exports.GALOY_INSTANCES = [
    {
        id: "Main",
        name: "Flash",
        graphqlUri: "https://api.flashapp.me/graphql",
        graphqlWsUri: "wss://ws.flashapp.me/graphql",
        authUrl: "https://api.flashapp.me",
        posUrl: "https://pay.flashapp.me",
        lnAddressHostname: "flashapp.me",
        relayUrl: "wss://relay.flashapp.me",
        blockExplorer: "https://mempool.space/tx/",
    },
    {
        id: "Staging",
        name: "Staging",
        graphqlUri: "https://api.staging.flashapp.me/graphql",
        graphqlWsUri: "wss://ws.staging.flashapp.me/graphql",
        authUrl: "https://api.staging.flashapp.me",
        posUrl: "http://pay.staging.flashapp.me",
        lnAddressHostname: "staging.flashapp.me",
        blockExplorer: "https://mempool.space/signet/tx/",
        relayUrl: "wss://relay.test.flashapp.me",
    },
    {
        id: "Test",
        name: "Test",
        graphqlUri: "https://api.test.flashapp.me/graphql",
        graphqlWsUri: "wss://ws.test.flashapp.me/graphql",
        authUrl: "https://api.test.flashapp.me",
        posUrl: "http://pay.test.flashapp.me",
        lnAddressHostname: "test.flashapp.me",
        blockExplorer: "https://mempool.space/signet/tx/",
        relayUrl: "wss://relay.test.flashapp.me",
    },
    {
        id: "Sandbox",
        name: "Sandbox",
        graphqlUri: "https://sandbox.flashapp.me/graphql",
        graphqlWsUri: "wss://ws.sandbox.flashapp.me/graphql",
        authUrl: "https://sandbox.flashapp.me",
        posUrl: "http://pay.sandbox.flashapp.me",
        lnAddressHostname: "sandbox.flashapp.me",
        blockExplorer: "https://mempool.space/signet/tx/",
        relayUrl: "wss://relay.staging.flashapp.me",
    },
    {
        id: "Development",
        name: "Development",
        graphqlUri: "https://api.development.flashapp.me:8080/graphql",
        graphqlWsUri: "ws://ws.development.flashapp.me:4000/graphql",
        authUrl: "https://api.development.flashapp.me:8080",
        posUrl: "http://development.flashapp.me:3000",
        lnAddressHostname: "development.flashapp.me:3000",
        blockExplorer: "https://mempool.space/signet/tx/",
        relayUrl: "wss://relay.test.flashapp.me",
    },
    {
        id: "Local",
        name: "Local",
        graphqlUri: `http://${scriptHostname()}:4002/graphql`,
        graphqlWsUri: `ws://${scriptHostname()}:4002/graphqlws`,
        authUrl: `http://${scriptHostname()}:4002`,
        posUrl: `http://${scriptHostname()}:3000`,
        lnAddressHostname: `${scriptHostname()}:3000`,
        blockExplorer: "https://mempool.space/signet/tx/",
        relayUrl: "wss://relay.test.flashapp.me",
    },
];
//# sourceMappingURL=galoy-instances.js.map