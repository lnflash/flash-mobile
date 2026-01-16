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
exports.PushNotificationComponent = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_2 = __importStar(require("@notifee/react-native"));
const messaging_1 = require("@react-native-firebase/messaging");
// hooks
const client_1 = require("@apollo/client");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
// utils
const notifications_1 = require("@app/utils/notifications");
const PushNotificationComponent = () => {
    const client = (0, client_1.useApolloClient)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    (0, react_1.useEffect)(() => {
        const followNotificationLink = (remoteMessage) => {
            var _a, _b;
            try {
                const linkToScreen = (_b = (_a = remoteMessage.data) === null || _a === void 0 ? void 0 : _a.linkTo) !== null && _b !== void 0 ? _b : "";
                if (typeof linkToScreen === "string" &&
                    linkToScreen &&
                    linkToScreen.startsWith("/")) {
                    react_native_1.Linking.openURL("blink:" + linkToScreen);
                }
                // linkTo throws an error if the link is invalid
            }
            catch (error) {
                console.error("Error in showNotification", error);
            }
        };
        // When the application is running, but in the background.
        const unsubscribeBackground = (0, messaging_1.getMessaging)().onNotificationOpenedApp((remoteMessage) => {
            followNotificationLink(remoteMessage);
        });
        const unsubscribeInApp = (0, messaging_1.getMessaging)().onMessage(async (remoteMessage) => {
            console.log("A new FCM message arrived!", remoteMessage);
            onDisplayNotification(remoteMessage);
        });
        // When the application is opened from a quit state.
        (0, messaging_1.getMessaging)()
            .getInitialNotification()
            .then((remoteMessage) => {
            if (remoteMessage) {
                followNotificationLink(remoteMessage);
            }
        });
        return () => {
            unsubscribeInApp();
            unsubscribeBackground();
        };
    }, []);
    (0, react_1.useEffect)(() => {
        ;
        (async () => {
            if (isAuthed && client) {
                const hasPermission = await (0, notifications_1.hasNotificationPermission)();
                if (hasPermission) {
                    (0, notifications_1.addDeviceToken)(client);
                    const unsubscribeFromRefresh = (0, messaging_1.getMessaging)().onTokenRefresh(() => (0, notifications_1.addDeviceToken)(client));
                    return unsubscribeFromRefresh;
                }
            }
        })();
    }, [client, isAuthed]);
    async function onDisplayNotification(remoteMessage) {
        var _a, _b;
        // Request permissions (required for iOS)
        await react_native_2.default.requestPermission();
        // Create a channel (required for Android)
        const channelId = await react_native_2.default.createChannel({
            id: "default",
            name: "Default Channel",
            importance: react_native_2.AndroidImportance.HIGH,
        });
        try {
            // Display a notification
            await react_native_2.default.displayNotification({
                title: (_a = remoteMessage.notification) === null || _a === void 0 ? void 0 : _a.title,
                body: (_b = remoteMessage.notification) === null || _b === void 0 ? void 0 : _b.body,
                android: {
                    channelId,
                    smallIcon: "ic_notification",
                    color: "#f7de4a",
                    // pressAction is needed if you want the notification to open the app when pressed
                    pressAction: {
                        id: "default",
                    },
                    importance: react_native_2.AndroidImportance.HIGH,
                },
            });
        }
        catch (err) {
            console.log("?????????????????????????", err);
        }
    }
    return <></>;
};
exports.PushNotificationComponent = PushNotificationComponent;
//# sourceMappingURL=push-notification.js.map