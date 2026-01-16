"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasNotificationPermission = exports.addDeviceToken = exports.requestNotificationPermission = void 0;
// eslint-disable-next-line react-native/split-platform-components
const react_native_1 = require("react-native");
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const messaging_1 = require("@react-native-firebase/messaging");
// No op if the permission has already been requested
const requestNotificationPermission = () => (0, messaging_1.getMessaging)().requestPermission();
exports.requestNotificationPermission = requestNotificationPermission;
(0, client_1.gql) `
  mutation deviceNotificationTokenCreate($input: DeviceNotificationTokenCreateInput!) {
    deviceNotificationTokenCreate(input: $input) {
      errors {
        message
      }
      success
    }
  }
`;
// This is a global variable to avoid adding the device token multiple times at the same time
let addingDeviceToken = false;
const addDeviceToken = async (client) => {
    if (addingDeviceToken) {
        return;
    }
    addingDeviceToken = true;
    try {
        const deviceToken = await (0, messaging_1.getMessaging)().getToken();
        await client.mutate({
            mutation: generated_1.DeviceNotificationTokenCreateDocument,
            variables: { input: { deviceToken } },
        });
    }
    catch (err) {
        if (err instanceof Error) {
            (0, crashlytics_1.getCrashlytics)().recordError(err);
        }
        console.error(err, "impossible to upload device token");
    }
    if (addingDeviceToken) {
        addingDeviceToken = false;
    }
};
exports.addDeviceToken = addDeviceToken;
const hasNotificationPermission = async () => {
    if (react_native_1.Platform.OS === "ios") {
        const authorizationStatus = await (0, messaging_1.getMessaging)().hasPermission();
        return (authorizationStatus === messaging_1.AuthorizationStatus.AUTHORIZED ||
            authorizationStatus === messaging_1.AuthorizationStatus.PROVISIONAL);
    }
    if (react_native_1.Platform.OS === "android") {
        const authorizationStatusAndroid = await react_native_1.PermissionsAndroid.request(react_native_1.PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        return authorizationStatusAndroid === react_native_1.PermissionsAndroid.RESULTS.GRANTED || false;
    }
    return false;
};
exports.hasNotificationPermission = hasNotificationPermission;
//# sourceMappingURL=notifications.js.map