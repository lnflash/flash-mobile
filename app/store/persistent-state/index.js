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
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePersistentStateContext = exports.PersistentStateProvider = exports.PersistentStateContext = void 0;
const storage_1 = require("@app/utils/storage");
const react_1 = require("react");
const state_migrations_1 = require("./state-migrations");
const React = __importStar(require("react"));
const redux_1 = require("../redux");
const PERSISTENT_STATE_KEY = "persistentState";
const loadPersistentState = async () => {
    const data = await (0, storage_1.loadJson)(PERSISTENT_STATE_KEY);
    return (0, state_migrations_1.migrateAndGetPersistentState)(data);
};
const savePersistentState = async (state) => {
    return (0, storage_1.saveJson)(PERSISTENT_STATE_KEY, state);
};
// TODO: should not be exported
exports.PersistentStateContext = (0, react_1.createContext)(null);
const PersistentStateProvider = ({ children }) => {
    const dispatch = (0, redux_1.useAppDispatch)();
    const [persistentState, setPersistentState] = React.useState(undefined);
    React.useEffect(() => {
        if (persistentState) {
            savePersistentState(persistentState);
        }
    }, [persistentState]);
    React.useEffect(() => {
        ;
        (async () => {
            const loadedState = await loadPersistentState();
            setPersistentState(loadedState);
        })();
    }, []);
    const resetState = React.useCallback(() => {
        setPersistentState(state_migrations_1.defaultPersistentState);
    }, []);
    return persistentState ? (<exports.PersistentStateContext.Provider value={{ persistentState, updateState: setPersistentState, resetState }}>
      {children}
    </exports.PersistentStateContext.Provider>) : null;
};
exports.PersistentStateProvider = PersistentStateProvider;
exports.usePersistentStateContext = (() => (0, react_1.useContext)(exports.PersistentStateContext));
//# sourceMappingURL=index.js.map