"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortenKey = void 0;
const nostr_tools_1 = require("nostr-tools");
function shortenKey(pubkey) {
    const npub = nostr_tools_1.nip19.npubEncode(pubkey);
    return npub.substring(0, 12).concat("...");
}
exports.shortenKey = shortenKey;
//# sourceMappingURL=shortenKey.js.map