"use strict";
// Welcome to the main entry point of the app.
//
// In this file, we'll be kicking off our app
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
exports.App = void 0;
// language related import
require("intl-pluralrules");
require("./i18n/mapping");
// for URL; need a polyfill on react native
require("react-native-url-polyfill/auto");
require("react-native-reanimated");
require("@react-native-firebase/crashlytics");
const themed_1 = require("@rneui/themed");
require("node-libs-react-native/globals"); // needed for Buffer?
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_error_boundary_1 = __importDefault(require("react-native-error-boundary"));
const react_native_root_siblings_1 = require("react-native-root-siblings");
const galoy_toast_1 = require("./components/galoy-toast");
const push_notification_1 = require("./components/push-notification");
const client_1 = require("./graphql/client");
const i18n_react_1 = __importDefault(require("./i18n/i18n-react"));
const i18n_util_sync_1 = require("./i18n/i18n-util.sync");
const app_state_1 = require("./navigation/app-state");
const navigation_container_wrapper_1 = require("./navigation/navigation-container-wrapper");
const root_navigator_1 = require("./navigation/root-navigator");
const theme_1 = __importDefault(require("./rne-theme/theme"));
const error_screen_1 = require("./screens/error-screen");
const persistent_state_1 = require("./store/persistent-state");
const locale_detector_1 = require("./utils/locale-detector");
const theme_sync_1 = require("./utils/theme-sync");
const network_error_component_1 = require("./graphql/network-error-component");
const feature_flags_context_1 = require("./config/feature-flags-context");
require("./utils/logs");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const react_redux_1 = require("react-redux");
const redux_1 = require("./store/redux");
const react_native_webview_crypto_1 = __importDefault(require("react-native-webview-crypto"));
const ActivityIndicatorContext_1 = require("./contexts/ActivityIndicatorContext");
const BreezContext_1 = require("./contexts/BreezContext");
const chatContext_1 = require("./screens/chat/chatContext");
const notification_1 = require("./components/notification");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const Flashcard_1 = require("./contexts/Flashcard");
const GroupChatProvider_1 = require("./screens/chat/GroupChat/GroupChatProvider");
// FIXME should we only load the currently used local?
// this would help to make the app load faster
// this will become more important when we add more languages
// and when the earn section will be added
//
// alternatively, could try loadAllLocalesAsync()
(0, i18n_util_sync_1.loadAllLocales)();
/**
 * This is the root component of our app.
 */
const App = () => (
/* eslint-disable-next-line react-native/no-inline-styles */
<react_native_safe_area_context_1.SafeAreaProvider>
    <react_native_1.StatusBar backgroundColor={"#000"} barStyle={react_native_1.Platform.OS === "android" ? "light-content" : "dark-content"}/>
    <react_native_gesture_handler_1.GestureHandlerRootView style={{ flex: 1 }}>
      <react_native_webview_crypto_1.default />
      <react_redux_1.Provider store={redux_1.store}>
        <persistent_state_1.PersistentStateProvider>
          <chatContext_1.ChatContextProvider>
            <GroupChatProvider_1.NostrGroupChatProvider groupId={"A9lScksyYAOWNxqR"} relayUrls={["wss://groups.0xchat.com"]} adminPubkeys={[]}>
              <ActivityIndicatorContext_1.ActivityIndicatorProvider>
                <i18n_react_1.default locale={(0, locale_detector_1.detectDefaultLocale)()}>
                  <themed_1.ThemeProvider theme={theme_1.default}>
                    <client_1.GaloyClient>
                      <feature_flags_context_1.FeatureFlagContextProvider>
                        <react_native_error_boundary_1.default FallbackComponent={error_screen_1.ErrorScreen}>
                          <navigation_container_wrapper_1.NavigationContainerWrapper>
                            <react_native_root_siblings_1.RootSiblingParent>
                              <notification_1.NotificationsProvider>
                                <app_state_1.AppStateWrapper />
                                <push_notification_1.PushNotificationComponent />
                                <BreezContext_1.BreezProvider>
                                  <Flashcard_1.FlashcardProvider>
                                    <root_navigator_1.RootStack />
                                  </Flashcard_1.FlashcardProvider>
                                </BreezContext_1.BreezProvider>
                                <galoy_toast_1.GaloyToast />
                                <network_error_component_1.NetworkErrorComponent />
                              </notification_1.NotificationsProvider>
                            </react_native_root_siblings_1.RootSiblingParent>
                          </navigation_container_wrapper_1.NavigationContainerWrapper>
                        </react_native_error_boundary_1.default>
                        <theme_sync_1.ThemeSyncGraphql />
                      </feature_flags_context_1.FeatureFlagContextProvider>
                    </client_1.GaloyClient>
                  </themed_1.ThemeProvider>
                </i18n_react_1.default>
              </ActivityIndicatorContext_1.ActivityIndicatorProvider>
            </GroupChatProvider_1.NostrGroupChatProvider>
          </chatContext_1.ChatContextProvider>
        </persistent_state_1.PersistentStateProvider>
      </react_redux_1.Provider>
    </react_native_gesture_handler_1.GestureHandlerRootView>
  </react_native_safe_area_context_1.SafeAreaProvider>);
exports.App = App;
//# sourceMappingURL=app.js.map