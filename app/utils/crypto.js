"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = exports.getConversationKey = void 0;
/* eslint-disable prefer-const */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/no-unused-vars */
const secp256k1_1 = require("@noble/curves/secp256k1");
const react_native_randombytes_1 = require("react-native-randombytes");
const sha256_1 = require("@noble/hashes/sha256");
const base_1 = require("@scure/base");
const xchacha20_1 = require("@stablelib/xchacha20");
function getConversationKey(privkeyA, pubkeyB) {
    const key = secp256k1_1.secp256k1.getSharedSecret(privkeyA, "02" + pubkeyB);
    return (0, sha256_1.sha256)(key.slice(1, 33));
}
exports.getConversationKey = getConversationKey;
function encrypt(privkey, pubkey, text, ver = 1) {
    if (ver !== 1)
        throw new Error("NIP44: unknown encryption version");
    let key = getConversationKey(privkey, pubkey);
    let nonce = (0, react_native_randombytes_1.randomBytes)(24);
    let plaintext = new TextEncoder().encode(text);
    let ciphertext = (0, xchacha20_1.streamXOR)(key, nonce, plaintext, plaintext);
    let ctb64 = base_1.base64.encode(ciphertext);
    let nonceb64 = base_1.base64.encode(nonce);
    return JSON.stringify({ ciphertext: ctb64, nonce: nonceb64, v: 1 });
}
exports.encrypt = encrypt;
function decrypt(privkey, pubkey, data) {
    let dt = JSON.parse(data);
    if (dt.v !== 1)
        throw new Error("NIP44: unknown encryption version");
    let { ciphertext, nonce } = dt;
    ciphertext = base_1.base64.decode(ciphertext);
    nonce = base_1.base64.decode(nonce);
    let key = getConversationKey(privkey, pubkey);
    let plaintext = (0, xchacha20_1.streamXOR)(key, nonce, ciphertext, ciphertext);
    let text = new TextDecoder().decode(plaintext);
    return text;
}
exports.decrypt = decrypt;
//# sourceMappingURL=crypto.js.map