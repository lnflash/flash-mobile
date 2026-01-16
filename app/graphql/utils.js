"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorMessages = void 0;
const client_1 = require("@apollo/client");
const getErrorMessages = (error) => {
    if (Array.isArray(error)) {
        return error.map((err) => err.message).join(", ");
    }
    if (error instanceof client_1.ApolloError) {
        if (error.graphQLErrors && error.graphQLErrors.length > 0) {
            return error.graphQLErrors.map(({ message }) => message).join("\n ");
        }
        else if (error.message === "Network request failed") {
            return "Wallet is offline";
        }
        return error.message;
    }
    return "Something went wrong";
};
exports.getErrorMessages = getErrorMessages;
//# sourceMappingURL=utils.js.map