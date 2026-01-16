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
exports.NavigationContainerWrapper = exports.useAuthenticationContext = exports.AuthenticationContextProvider = void 0;
const config_1 = require("@app/config");
const analytics_1 = require("@react-native-firebase/analytics");
const native_1 = require("@react-navigation/native");
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
const is_authed_context_1 = require("../graphql/is-authed-context");
const themed_1 = require("@rneui/themed");
const react_native_bootsplash_1 = __importDefault(require("react-native-bootsplash"));
// The initial value will never be null because the provider will always pass a non null value
// eslint-disable-next-line
// @ts-ignore
const AuthenticationContext = React.createContext(null);
exports.AuthenticationContextProvider = AuthenticationContext.Provider;
const useAuthenticationContext = () => React.useContext(AuthenticationContext);
exports.useAuthenticationContext = useAuthenticationContext;
const NavigationContainerWrapper = ({ children, }) => {
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const processLink = (0, react_1.useRef)(null);
    processLink.current = () => {
        return undefined;
    };
    const setAppUnlocked = React.useMemo(() => async () => {
        setIsAppLocked(false);
        const url = await react_native_1.Linking.getInitialURL();
        if (url && isAuthed && processLink.current) {
            processLink.current(url);
        }
    }, [isAuthed]);
    const setAppLocked = React.useMemo(() => () => setIsAppLocked(true), []);
    const [isAppLocked, setIsAppLocked] = React.useState(true);
    const routeName = (0, react_1.useRef)("Initial");
    const { theme: { mode }, } = (0, themed_1.useTheme)();
    const getActiveRouteName = (state) => {
        if (!state || typeof state.index !== "number") {
            return "Unknown";
        }
        const route = state.routes[state.index];
        if (route.state) {
            return getActiveRouteName(route.state);
        }
        return route.name;
    };
    const linking = {
        prefixes: [...config_1.PREFIX_LINKING, "bitcoin://", "lightning://", "lapp://"],
        config: {
            screens: {
                sendBitcoinDestination: ":payment",
                Primary: {
                    screens: {
                        Home: "/",
                    },
                },
            },
        },
        getInitialURL: async () => {
            const url = await react_native_1.Linking.getInitialURL();
            if (Boolean(url) && isAuthed && !isAppLocked) {
                return url;
            }
            return null;
        },
        subscribe: (listener) => {
            console.log("listener", listener);
            const onReceiveURL = ({ url }) => {
                console.log("onReceiveURL", url);
                listener(url);
            };
            // Listen to incoming links from deep linking
            const subscription = react_native_1.Linking.addEventListener("url", onReceiveURL);
            processLink.current = listener;
            return () => {
                // Clean up the event listeners
                subscription.remove();
                processLink.current = null;
            };
        },
    };
    return (<exports.AuthenticationContextProvider value={{ isAppLocked, setAppUnlocked, setAppLocked }}>
      <native_1.NavigationContainer {...(mode === "dark" ? { theme: native_1.DarkTheme } : {})} linking={linking} onReady={() => {
            react_native_bootsplash_1.default.hide({ fade: true, duration: 220 });
            console.log("NavigationContainer onReady");
        }} onStateChange={(state) => {
            const currentRouteName = getActiveRouteName(state);
            if (routeName.current !== currentRouteName && currentRouteName) {
                /* eslint-disable camelcase */
                (0, analytics_1.getAnalytics)().logScreenView({
                    screen_name: currentRouteName,
                    screen_class: currentRouteName,
                    is_manual_log: true,
                });
                routeName.current = currentRouteName;
            }
        }}>
        {children}
      </native_1.NavigationContainer>
    </exports.AuthenticationContextProvider>);
};
exports.NavigationContainerWrapper = NavigationContainerWrapper;
//# sourceMappingURL=navigation-container-wrapper.js.map