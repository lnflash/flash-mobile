"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLightningAddress = exports.getPrintableQrCodeUrl = exports.getPosUrl = void 0;
const getPosUrl = (posUrl, address) => {
    return `${posUrl}/${address}`;
};
exports.getPosUrl = getPosUrl;
const getPrintableQrCodeUrl = (posUrl, address) => {
    return `${posUrl}/${address}/print`;
};
exports.getPrintableQrCodeUrl = getPrintableQrCodeUrl;
const getLightningAddress = (lnAddressHostname, address) => {
    return `${address}@${lnAddressHostname}`;
};
exports.getLightningAddress = getLightningAddress;
//# sourceMappingURL=pay-links.js.map