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
exports.NetworkErrorComponent = void 0;
const use_logout_1 = __importDefault(require("@app/hooks/use-logout"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const react_1 = __importStar(require("react"));
const error_code_1 = require("./error-code");
const react_native_1 = require("react-native");
const network_error_context_1 = require("./network-error-context");
const native_1 = require("@react-navigation/native");
const NetworkErrorComponent = () => {
    const navigation = (0, native_1.useNavigation)();
    const { networkError, clearNetworkError } = (0, network_error_context_1.useNetworkError)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { logout } = (0, use_logout_1.default)();
    const [showedAlert, setShowedAlert] = (0, react_1.useState)(false);
    react_1.default.useEffect(() => {
        var _a, _b, _c;
        if (!networkError || !("statusCode" in networkError)) {
            return;
        }
        if (networkError.statusCode >= 500) {
            // TODO translation
            (0, toast_1.toastShow)({
                message: (translations) => translations.errors.network.server(),
                currentTranslation: LL,
            });
            return;
        }
        if (networkError.statusCode >= 400 && networkError.statusCode < 500) {
            let errorCode = "result" in networkError ? (_c = (_b = (_a = networkError.result) === null || _a === void 0 ? void 0 : _a.errors) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.code : undefined;
            if (!errorCode) {
                switch (networkError.statusCode) {
                    case 401:
                        errorCode = error_code_1.NetworkErrorCode.InvalidAuthentication;
                        break;
                }
            }
            switch (errorCode) {
                case error_code_1.NetworkErrorCode.InvalidAuthentication:
                    logout();
                    if (!showedAlert) {
                        setShowedAlert(true);
                        react_native_1.Alert.alert(LL.common.reauth(), "", [
                            {
                                text: LL.common.ok(),
                                onPress: () => {
                                    setShowedAlert(false);
                                    navigation.dispatch(() => {
                                        const routes = [{ name: "getStarted" }];
                                        return native_1.CommonActions.reset({
                                            routes,
                                            index: routes.length - 1,
                                        });
                                    });
                                },
                            },
                        ]);
                    }
                    break;
                default:
                    // TODO translation
                    (0, toast_1.toastShow)({
                        message: (translations) => `StatusCode: ${networkError.statusCode}\nError code: ${errorCode}\n${translations.errors.network.request()}`,
                        currentTranslation: LL,
                    });
                    break;
            }
            clearNetworkError();
            return;
        }
        if (networkError.message === "Network request failed") {
            // TODO translation
            (0, toast_1.toastShow)({
                message: (translations) => translations.errors.network.connection(),
                currentTranslation: LL,
            });
        }
        clearNetworkError();
    }, [
        networkError,
        clearNetworkError,
        LL,
        logout,
        showedAlert,
        setShowedAlert,
        navigation,
    ]);
    return <></>;
};
exports.NetworkErrorComponent = NetworkErrorComponent;
//# sourceMappingURL=network-error-component.js.map