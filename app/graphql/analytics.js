"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsContainer = void 0;
const analytics_1 = require("@react-native-firebase/analytics");
const generated_1 = require("@app/graphql/generated");
const client_1 = require("@apollo/client");
const react_1 = require("react");
const is_authed_context_1 = require("./is-authed-context");
const level_context_1 = require("./level-context");
const hooks_1 = require("@app/hooks");
(0, client_1.gql) `
  query analytics {
    me {
      username
      id
    }
    globals {
      network
    }
  }
`;
const AnalyticsContainer = () => {
    var _a, _b, _c;
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const level = (0, level_context_1.useLevel)();
    const { appConfig: { galoyInstance: { name: galoyInstanceName }, }, } = (0, hooks_1.useAppConfig)();
    const { data } = (0, generated_1.useAnalyticsQuery)({
        skip: !isAuthed,
        fetchPolicy: "cache-first",
    });
    (0, react_1.useEffect)(() => {
        var _a;
        (0, analytics_1.getAnalytics)().setUserProperty("hasUsername", ((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username) ? "true" : "false");
    }, [(_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username]);
    (0, react_1.useEffect)(() => {
        var _a, _b;
        if ((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.id) {
            (0, analytics_1.getAnalytics)().setUserId((_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.id);
        }
    }, [(_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.id]);
    (0, react_1.useEffect)(() => {
        var _a;
        if ((_a = data === null || data === void 0 ? void 0 : data.globals) === null || _a === void 0 ? void 0 : _a.network) {
            (0, analytics_1.getAnalytics)().setUserProperties({ network: data.globals.network });
        }
    }, [(_c = data === null || data === void 0 ? void 0 : data.globals) === null || _c === void 0 ? void 0 : _c.network]);
    (0, react_1.useEffect)(() => {
        (0, analytics_1.getAnalytics)().setUserProperty("accountLevel", level.currentLevel);
    }, [level]);
    (0, react_1.useEffect)(() => {
        (0, analytics_1.getAnalytics)().setUserProperty("galoyInstance", galoyInstanceName);
    }, [galoyInstanceName]);
    return null;
};
exports.AnalyticsContainer = AnalyticsContainer;
//# sourceMappingURL=analytics.js.map