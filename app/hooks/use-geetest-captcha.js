"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGeetestCaptcha = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const analytics_1 = require("@app/utils/analytics");
const react_native_geetest_module_1 = __importDefault(require("@galoymoney/react-native-geetest-module"));
const react_1 = require("react");
const react_native_1 = require("react-native");
(0, client_1.gql) `
  mutation captchaCreateChallenge {
    captchaCreateChallenge {
      errors {
        message
      }
      result {
        id
        challengeCode
        newCaptcha
        failbackMode
      }
    }
  }
`;
const useGeetestCaptcha = () => {
    const [geetestValidationData, setGeetesValidationData] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const onGeeTestDialogResultListener = (0, react_1.useRef)();
    const onGeeTestFailedListener = (0, react_1.useRef)();
    const [captchaCreateChallenge, { loading: loadingRegisterCaptcha }] = (0, generated_1.useCaptchaCreateChallengeMutation)({
        fetchPolicy: "no-cache",
    });
    const resetValidationData = (0, react_1.useCallback)(() => setGeetesValidationData(null), [setGeetesValidationData]);
    const resetError = (0, react_1.useCallback)(() => setError(null), [setError]);
    const registerCaptcha = (0, react_1.useCallback)(async () => {
        var _a, _b, _c;
        (0, analytics_1.logStartCaptcha)();
        const { data } = await captchaCreateChallenge();
        const result = (_a = data === null || data === void 0 ? void 0 : data.captchaCreateChallenge) === null || _a === void 0 ? void 0 : _a.result;
        const errors = (_c = (_b = data === null || data === void 0 ? void 0 : data.captchaCreateChallenge) === null || _b === void 0 ? void 0 : _b.errors) !== null && _c !== void 0 ? _c : [];
        if (errors.length > 0) {
            setError(errors[0].message);
        }
        else if (result) {
            const params = {
                success: result.failbackMode ? 0 : 1,
                challenge: result.challengeCode,
                gt: result.id,
                // eslint-disable-next-line camelcase
                new_captcha: result.newCaptcha,
            };
            // Test only
            // TODO: mock whole hook instead?
            if (
            // those values are part of the Mocked queriies from apollo MockedProvider
            // used in storybook
            result.id === "d5cdc22925d10bc4720d012ba48dd214" &&
                result.challengeCode === "af073125d936ff9e5aa4c1ed44a38d5d") {
                setGeetesValidationData({
                    geetestChallenge: "af073125d936ff9e5aa4c1ed44a38d5d4s",
                    geetestSecCode: "290cc148dfb39afb5af63320469facd6",
                    geetestValidate: "290cc148dfb39afb5af63320469facd6|jordan",
                });
                return;
            }
            react_native_geetest_module_1.default.handleRegisteredGeeTestCaptcha(JSON.stringify(params));
        }
        else {
            setError(LL.errors.generic());
        }
    }, [captchaCreateChallenge, LL]);
    (0, react_1.useEffect)(() => {
        react_native_geetest_module_1.default.setUp();
        const eventEmitter = new react_native_1.NativeEventEmitter(react_native_1.NativeModules.GeetestModule);
        onGeeTestDialogResultListener.current = eventEmitter.addListener("GT3-->onDialogResult-->", (event) => {
            // on failed test the result is {"result": "{\"geetest_challenge\":\"\"}"}
            const { geetest_challenge: geetestChallenge, geetest_seccode: geetestSecCode, geetest_validate: geetestValidate, } = JSON.parse(event.result);
            if (geetestChallenge && geetestSecCode && geetestValidate) {
                setGeetesValidationData({
                    geetestChallenge,
                    geetestSecCode,
                    geetestValidate,
                });
            }
        });
        onGeeTestFailedListener.current = eventEmitter.addListener("GT3-->onFailed-->", (event) => {
            setError(event.error);
        });
        return () => {
            react_native_geetest_module_1.default.tearDown();
            if (onGeeTestDialogResultListener.current) {
                onGeeTestDialogResultListener.current.remove();
            }
            if (onGeeTestFailedListener.current) {
                onGeeTestFailedListener.current.remove();
            }
        };
    }, []);
    return {
        geetestError: error,
        geetestValidationData,
        loadingRegisterCaptcha,
        registerCaptcha,
        resetError,
        resetValidationData,
    };
};
exports.useGeetestCaptcha = useGeetestCaptcha;
//# sourceMappingURL=use-geetest-captcha.js.map