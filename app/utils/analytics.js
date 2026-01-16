"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAppFeedback = exports.logToastShown = exports.logLogout = exports.logEnterBackground = exports.logEnterForeground = exports.logGeneratePaymentRequest = exports.logConversionResult = exports.logConversionAttempt = exports.logPaymentResult = exports.logPaymentAttempt = exports.logParseDestinationResult = exports.logUpgradeLoginSuccess = exports.logAddPhoneAttempt = exports.logUpgradeLoginAttempt = exports.logStartCaptcha = exports.logValidateAuthCodeFailure = exports.logGetStartedAction = exports.logCreateDeviceAccountFailure = exports.logAttemptCreateDeviceAccount = exports.logCreatedDeviceAccount = exports.logRequestAuthCode = void 0;
const analytics_1 = require("@react-native-firebase/analytics");
const logRequestAuthCode = ({ instance, channel, }) => {
    (0, analytics_1.getAnalytics)().logEvent("request_auth_code", { instance, channel });
};
exports.logRequestAuthCode = logRequestAuthCode;
const logCreatedDeviceAccount = () => {
    (0, analytics_1.getAnalytics)().logEvent("created_device_account");
};
exports.logCreatedDeviceAccount = logCreatedDeviceAccount;
const logAttemptCreateDeviceAccount = () => {
    (0, analytics_1.getAnalytics)().logEvent("attempt_create_device_account");
};
exports.logAttemptCreateDeviceAccount = logAttemptCreateDeviceAccount;
const logCreateDeviceAccountFailure = () => {
    (0, analytics_1.getAnalytics)().logEvent("create_device_account_failure");
};
exports.logCreateDeviceAccountFailure = logCreateDeviceAccountFailure;
const logGetStartedAction = ({ action, createDeviceAccountEnabled, }) => {
    (0, analytics_1.getAnalytics)().logEvent("get_started_action", {
        action,
        create_device_account_enabled: createDeviceAccountEnabled,
    });
};
exports.logGetStartedAction = logGetStartedAction;
const logValidateAuthCodeFailure = ({ error, }) => {
    (0, analytics_1.getAnalytics)().logEvent("validate_auth_code_failure", {
        error,
    });
};
exports.logValidateAuthCodeFailure = logValidateAuthCodeFailure;
const logStartCaptcha = () => {
    (0, analytics_1.getAnalytics)().logEvent("start_captcha");
};
exports.logStartCaptcha = logStartCaptcha;
const logUpgradeLoginAttempt = () => {
    (0, analytics_1.getAnalytics)().logEvent("upgrade_login_attempt");
};
exports.logUpgradeLoginAttempt = logUpgradeLoginAttempt;
const logAddPhoneAttempt = () => {
    (0, analytics_1.getAnalytics)().logEvent("add_phone_attempt");
};
exports.logAddPhoneAttempt = logAddPhoneAttempt;
const logUpgradeLoginSuccess = () => {
    (0, analytics_1.getAnalytics)().logEvent("upgrade_login_success");
};
exports.logUpgradeLoginSuccess = logUpgradeLoginSuccess;
const logParseDestinationResult = (parsedDestination) => {
    if (parsedDestination.valid) {
        (0, analytics_1.getAnalytics)().logEvent("payment_destination_accepted", {
            paymentType: parsedDestination.validDestination.paymentType,
            direction: parsedDestination.destinationDirection,
        });
    }
    else {
        (0, analytics_1.getAnalytics)().logEvent("payment_destination_rejected", {
            reason: parsedDestination.invalidReason,
            paymentType: parsedDestination.invalidPaymentDestination.paymentType,
        });
    }
};
exports.logParseDestinationResult = logParseDestinationResult;
const logPaymentAttempt = (params) => {
    (0, analytics_1.getAnalytics)().logEvent("payment_attempt", {
        payment_type: params.paymentType,
        sending_wallet: params.sendingWallet,
    });
};
exports.logPaymentAttempt = logPaymentAttempt;
const logPaymentResult = (params) => {
    (0, analytics_1.getAnalytics)().logEvent("payment_result", {
        payment_type: params.paymentType,
        sending_wallet: params.sendingWallet,
        payment_status: params.paymentStatus,
    });
};
exports.logPaymentResult = logPaymentResult;
const logConversionAttempt = (params) => {
    (0, analytics_1.getAnalytics)().logEvent("conversion_attempt", {
        sending_wallet: params.sendingWallet,
        receiving_wallet: params.receivingWallet,
    });
};
exports.logConversionAttempt = logConversionAttempt;
const logConversionResult = (params) => {
    (0, analytics_1.getAnalytics)().logEvent("conversion_result", {
        sending_wallet: params.sendingWallet,
        receiving_wallet: params.receivingWallet,
        payment_status: params.paymentStatus,
    });
};
exports.logConversionResult = logConversionResult;
const logGeneratePaymentRequest = (params) => {
    (0, analytics_1.getAnalytics)().logEvent("generate_payment_request", {
        payment_type: params.paymentType.toLowerCase(),
        has_amount: params.hasAmount,
        receiving_wallet: params.receivingWallet,
    });
};
exports.logGeneratePaymentRequest = logGeneratePaymentRequest;
const logEnterForeground = () => {
    (0, analytics_1.getAnalytics)().logEvent("enter_foreground");
};
exports.logEnterForeground = logEnterForeground;
const logEnterBackground = () => {
    (0, analytics_1.getAnalytics)().logEvent("enter_background");
};
exports.logEnterBackground = logEnterBackground;
const logLogout = () => {
    (0, analytics_1.getAnalytics)().logEvent("logout");
};
exports.logLogout = logLogout;
const logToastShown = (params) => {
    (0, analytics_1.getAnalytics)().logEvent("toast_shown", {
        message: params.message,
        type: params.type,
        is_translated: params.isTranslated,
    });
};
exports.logToastShown = logToastShown;
const logAppFeedback = (params) => {
    (0, analytics_1.getAnalytics)().logEvent("app_feedback", {
        is_enjoying_app: params.isEnjoingApp,
    });
};
exports.logAppFeedback = logAppFeedback;
//# sourceMappingURL=analytics.js.map