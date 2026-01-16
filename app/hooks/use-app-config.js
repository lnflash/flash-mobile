"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAppConfig = void 0;
const config_1 = require("@app/config");
const persistent_state_1 = require("@app/store/persistent-state");
const react_1 = require("react");
const useAppConfig = () => {
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const appConfig = (0, react_1.useMemo)(() => ({
        token: persistentState.galoyAuthToken,
        galoyInstance: (0, config_1.resolveGaloyInstanceOrDefault)(persistentState.galoyInstance),
    }), [persistentState.galoyAuthToken, persistentState.galoyInstance]);
    const setGaloyInstance = (0, react_1.useCallback)((newInstance) => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { galoyInstance: newInstance });
            return undefined;
        });
    }, [updateState]);
    const saveToken = (0, react_1.useCallback)((token) => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { galoyAuthToken: token });
            return undefined;
        });
    }, [updateState]);
    const saveTokenAndInstance = (0, react_1.useCallback)(({ token, instance }) => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { galoyInstance: instance, galoyAuthToken: token });
            return undefined;
        });
    }, [updateState]);
    return {
        appConfig,
        setGaloyInstance,
        saveToken,
        saveTokenAndInstance,
    };
};
exports.useAppConfig = useAppConfig;
//# sourceMappingURL=use-app-config.js.map