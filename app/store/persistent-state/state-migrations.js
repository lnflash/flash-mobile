"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateAndGetPersistentState = exports.defaultPersistentState = void 0;
const jwt_decode_1 = __importDefault(require("jwt-decode"));
const config_1 = require("@app/config");
const storage_1 = require("@app/utils/storage");
const decodeToken = (token) => {
    try {
        const { uid, network } = (0, jwt_decode_1.default)(token);
        return { uid, network };
    }
    catch (err) {
        if (err instanceof Error) {
            console.debug(err.toString());
        }
        return null;
    }
};
const migrate8ToCurrent = (state) => {
    return Promise.resolve(Object.assign(Object.assign({}, state), { schemaVersion: 8 }));
};
const migrate7ToCurrent = (state) => {
    return migrate8ToCurrent(Object.assign(Object.assign({}, state), { schemaVersion: 8, 
        // Initialize new Boltcard fields as undefined
        flashcardStoreId: undefined, flashcardCardId: undefined, flashcardApiBaseUrl: undefined }));
};
const migrate6ToCurrent = (state) => {
    return migrate7ToCurrent(Object.assign(Object.assign({}, state), { schemaVersion: 7, hasInitializedBreezSDK: false, helpTriggered: false, numOfRefundables: 0, closedQuickStartTypes: [] }));
};
const migrate5ToCurrent = (state) => {
    return migrate6ToCurrent(Object.assign(Object.assign({}, state), { schemaVersion: 6 }));
};
const migrate4ToCurrent = (state) => {
    const newGaloyInstance = config_1.GALOY_INSTANCES.find((instance) => instance.name === state.galoyInstance.name);
    if (!newGaloyInstance) {
        if (state.galoyInstance.name === "BBW") {
            const newGaloyInstanceTest = config_1.GALOY_INSTANCES.find((instance) => instance.name === "Flash");
            if (!newGaloyInstanceTest) {
                throw new Error("Galoy instance not found");
            }
        }
    }
    let galoyInstance;
    if (state.galoyInstance.name === "Custom") {
        // we only keep the full object if we are on Custom
        // otherwise data will be stored in GaloyInstancesInput[]
        galoyInstance = Object.assign(Object.assign({}, state.galoyInstance), { id: "Custom" });
    }
    else if (state.galoyInstance.name === "BBW" || state.galoyInstance.name === "Flash") {
        // we are using "Main" instead of "BBW", so that the bankName is not hardcoded in the saved json
        galoyInstance = { id: "Main" };
    }
    else {
        galoyInstance = { id: state.galoyInstance.name };
    }
    return migrate5ToCurrent({
        schemaVersion: 5,
        galoyAuthToken: state.galoyAuthToken,
        galoyInstance,
    });
};
const migrate3ToCurrent = (state) => {
    const newGaloyInstance = config_1.GALOY_INSTANCES.find((instance) => instance.name === state.galoyInstance.name);
    if (!newGaloyInstance) {
        throw new Error("Galoy instance not found");
    }
    return migrate4ToCurrent(Object.assign(Object.assign({}, state), { galoyInstance: newGaloyInstance, schemaVersion: 4 }));
};
const migrate2ToCurrent = async (state) => {
    const LEGACY_TOKEN_KEY = "GaloyToken";
    const token = await (0, storage_1.loadString)(LEGACY_TOKEN_KEY);
    if (token && decodeToken(token)) {
        const decodedToken = decodeToken(token);
        const network = decodedToken === null || decodedToken === void 0 ? void 0 : decodedToken.network;
        if (network === "mainnet") {
            const galoyInstance = config_1.GALOY_INSTANCES.find((instance) => instance.name === "BBW" || instance.name === "Flash");
            if (galoyInstance) {
                return migrate3ToCurrent(Object.assign(Object.assign({}, state), { schemaVersion: 3, galoyInstance, galoyAuthToken: token, isAnalyticsEnabled: true }));
            }
        }
    }
    const newGaloyInstance = config_1.GALOY_INSTANCES.find((instance) => instance.name === "BBW" || instance.name === "Flash");
    if (!newGaloyInstance) {
        throw new Error("Galoy instance not found");
    }
    return migrate3ToCurrent(Object.assign(Object.assign({}, state), { schemaVersion: 3, galoyInstance: newGaloyInstance, galoyAuthToken: "", isAnalyticsEnabled: true }));
};
const migrate1ToCurrent = (state) => {
    return migrate2ToCurrent(Object.assign(Object.assign({}, state), { hasShownStableSatsWelcome: false, schemaVersion: 2 }));
};
const migrate0ToCurrent = (state) => {
    return migrate1ToCurrent({
        schemaVersion: 1,
        isUsdDisabled: state.isUsdDisabled,
    });
};
const stateMigrations = {
    0: migrate0ToCurrent,
    1: migrate1ToCurrent,
    2: migrate2ToCurrent,
    3: migrate3ToCurrent,
    4: migrate4ToCurrent,
    5: migrate5ToCurrent,
    6: migrate6ToCurrent,
    7: migrate7ToCurrent,
    8: migrate8ToCurrent,
};
exports.defaultPersistentState = {
    schemaVersion: 8,
    galoyInstance: { id: __DEV__ ? "Test" : "Main" },
    galoyAuthToken: "",
    hasInitializedBreezSDK: false,
    helpTriggered: false,
    numOfRefundables: 0,
    closedQuickStartTypes: [],
};
const migrateAndGetPersistentState = async (
// TODO: pass the correct type.
// this is especially important given this is migration code and it's hard to test manually
// eslint-disable-next-line @typescript-eslint/no-explicit-any
data) => {
    if (Boolean(data) && data.schemaVersion in stateMigrations) {
        const schemaVersion = data.schemaVersion;
        try {
            const migration = stateMigrations[schemaVersion];
            const persistentState = await migration(data);
            if (persistentState) {
                return persistentState;
            }
        }
        catch (err) {
            console.error({ err }, "error migrating persistent state");
        }
    }
    return exports.defaultPersistentState;
};
exports.migrateAndGetPersistentState = migrateAndGetPersistentState;
//# sourceMappingURL=state-migrations.js.map