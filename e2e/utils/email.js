"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecondEmail = exports.getFirstEmail = exports.getInbox = exports.mailslurpApiKey = void 0;
const axios_1 = __importDefault(require("axios"));
exports.mailslurpApiKey = process.env.MAILSLURP_API_KEY;
if (exports.mailslurpApiKey === undefined) {
    console.error("-----------------------------");
    console.error("MAILSLURP_API_KEY not set");
    console.error("-----------------------------");
    process.exit(1);
}
const headers = {
    "Accept": "application/json",
    "x-api-key": exports.mailslurpApiKey,
};
const getInbox = async () => {
    const optionsCreateInbox = {
        method: "POST",
        url: `https://api.mailslurp.com/inboxes?expiresIn=3600000&useShortAddress=true`,
        headers,
    };
    try {
        const { data } = await axios_1.default.request(optionsCreateInbox);
        const { id, emailAddress } = data;
        console.log({ inboxId: id, emailAddress });
        return { id, emailAddress };
    }
    catch (error) {
        console.error(error);
    }
};
exports.getInbox = getInbox;
const getEmail = async (inboxId, index) => {
    const optionsGetEmails = {
        method: "GET",
        url: `https://api.mailslurp.com/waitForNthEmail?inboxId=${inboxId}&index=${index}&unreadOnly=false`,
        headers,
    };
    try {
        const { data } = await axios_1.default.request(optionsGetEmails);
        const { subject, body } = data;
        return { subject, body };
    }
    catch (error) {
        console.error(error);
    }
};
const getFirstEmail = async (inboxId) => {
    return getEmail(inboxId, 0);
};
exports.getFirstEmail = getFirstEmail;
const getSecondEmail = async (inboxId) => {
    return getEmail(inboxId, 1);
};
exports.getSecondEmail = getSecondEmail;
// getInbox()
// getFirstEmail("a96cfd50-4c3e-4a1e-ba48-b7aa7958363f")
//# sourceMappingURL=email.js.map