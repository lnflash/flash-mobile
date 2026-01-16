"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUpdateAvailableOrRequired = void 0;
const isUpdateAvailableOrRequired = ({ buildNumber, mobileVersions, OS, }) => {
    var _a, _b, _c, _d;
    if (!mobileVersions) {
        return {
            required: false,
            available: false,
        };
    }
    // we need to use the modulo because the build number is not the same across ABI
    // and we are multiple by a factor of 10000000 to differentiate between platforms
    // https://github.com/lnflash/flash-mobile/blob/c971ace92e420e8f90cab209cb9e2c341b71ab42/android/app/build.gradle#L145
    const buildNumberNoAbi = buildNumber % 10000000;
    const minSupportedVersion = (_b = (_a = mobileVersions.find((mobileVersion) => (mobileVersion === null || mobileVersion === void 0 ? void 0 : mobileVersion.platform) === OS)) === null || _a === void 0 ? void 0 : _a.minSupported) !== null && _b !== void 0 ? _b : NaN;
    const currentSupportedVersion = (_d = (_c = mobileVersions.find((mobileVersion) => (mobileVersion === null || mobileVersion === void 0 ? void 0 : mobileVersion.platform) === OS)) === null || _c === void 0 ? void 0 : _c.currentSupported) !== null && _d !== void 0 ? _d : NaN;
    return {
        required: buildNumberNoAbi < minSupportedVersion,
        available: buildNumberNoAbi < currentSupportedVersion,
    };
};
exports.isUpdateAvailableOrRequired = isUpdateAvailableOrRequired;
//# sourceMappingURL=app-update.logic.js.map