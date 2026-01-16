"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLASH_DEEP_LINK_PREFIX = exports.ratingOptions = exports.LNURL_DOMAINS = exports.PREFIX_LINKING = exports.PLAY_STORE_LINK = exports.APP_STORE_LINK = exports.CONTACT_EMAIL_ADDRESS = exports.WHATSAPP_CONTACT_NUMBER = void 0;
const react_native_rate_1 = require("react-native-rate");
exports.WHATSAPP_CONTACT_NUMBER = "+18762909250";
exports.CONTACT_EMAIL_ADDRESS = "support@getflash.io";
exports.APP_STORE_LINK = "https://apps.apple.com/jm/app/flash-send-spend-and-save/id6451129095";
exports.PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.lnflash";
exports.PREFIX_LINKING = ["https://pay.getflash.io", "flash://"];
// FIXME this should come from globals.lightningAddressDomainAliases
exports.LNURL_DOMAINS = ["getflash.io", "pay.flashapp.me", "flashapp.me"];
exports.ratingOptions = {
    AppleAppID: "6451129095",
    GooglePackageName: "com.lnflash",
    preferredAndroidMarket: react_native_rate_1.AndroidMarket.Google,
    preferInApp: true,
    openAppStoreIfInAppFails: true,
};
exports.FLASH_DEEP_LINK_PREFIX = "flash:/";
//# sourceMappingURL=appinfo.js.map