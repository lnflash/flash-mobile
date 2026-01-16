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
exports.AppStateWrapper = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const analytics_1 = require("@app/utils/analytics");
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const AppStateWrapper = () => {
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const appState = react_1.default.useRef(react_native_1.AppState.currentState);
    const client = (0, client_1.useApolloClient)();
    const handleAppStateChange = (0, react_1.useCallback)(async (nextAppState) => {
        if (appState.current.match(/background/) && nextAppState === "active") {
            isAuthed && client.refetchQueries({ include: [generated_1.HomeAuthedDocument] });
            console.info("App has come to the foreground!");
            (0, analytics_1.logEnterForeground)();
        }
        if (appState.current.match(/active/) && nextAppState === "background") {
            (0, analytics_1.logEnterBackground)();
        }
        appState.current = nextAppState;
    }, [client, isAuthed]);
    (0, react_1.useEffect)(() => {
        const subscription = react_native_1.AppState.addEventListener("change", handleAppStateChange);
        return () => subscription.remove();
    }, [handleAppStateChange]);
    return <></>;
};
exports.AppStateWrapper = AppStateWrapper;
//# sourceMappingURL=app-state.js.map