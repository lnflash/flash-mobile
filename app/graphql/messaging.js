"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagingContainer = void 0;
const react_1 = require("react");
const client_1 = require("@apollo/client");
const messaging_1 = require("@react-native-firebase/messaging");
const generated_1 = require("./generated");
// refetch when we receive an OS notification
const MessagingContainer = () => {
    const client = (0, client_1.useApolloClient)();
    (0, react_1.useEffect)(() => {
        const unsubscribe = (0, messaging_1.getMessaging)().onMessage(async (_remoteMessage) => {
            client.refetchQueries({ include: [generated_1.HomeAuthedDocument] });
        });
        return unsubscribe;
    }, [client]);
    return null;
};
exports.MessagingContainer = MessagingContainer;
//# sourceMappingURL=messaging.js.map