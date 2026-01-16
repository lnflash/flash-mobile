"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const native_1 = __importDefault(require("styled-components/native"));
const messaging_1 = require("@react-native-firebase/messaging");
// hooks
const native_2 = require("@react-navigation/native");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
// utils
const notifications_1 = require("@app/utils/notifications");
const client_only_query_1 = require("@app/graphql/client-only-query");
// assets
const chart_svg_1 = __importDefault(require("@app/assets/icons/chart.svg"));
const setting_svg_1 = __importDefault(require("@app/assets/icons/setting.svg"));
const Header = () => {
    const navigation = (0, native_2.useNavigation)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const isFocused = (0, native_2.useIsFocused)();
    const client = (0, client_1.useApolloClient)();
    const { colors, mode } = (0, themed_1.useTheme)().theme;
    const { data: { hideBalance = false } = {} } = (0, generated_1.useHideBalanceQuery)();
    // notification permission
    (0, react_1.useEffect)(() => {
        let timeout;
        if (isAuthed && isFocused && client) {
            timeout = setTimeout(async () => {
                const result = await (0, notifications_1.requestNotificationPermission)();
                if (result === messaging_1.AuthorizationStatus.PROVISIONAL ||
                    result === messaging_1.AuthorizationStatus.AUTHORIZED) {
                    await (0, notifications_1.addDeviceToken)(client);
                }
            }, // no op if already requested
            5000);
        }
        return () => timeout && clearTimeout(timeout);
    }, [isAuthed, isFocused, client]);
    (0, react_1.useEffect)(() => {
        navigation.setOptions({
            headerLeft: renderHeaderLeft,
            headerRight: renderHeaderRight,
        });
    }, [mode, client, hideBalance]);
    const renderHeaderLeft = () => (<IconWrapper style={{ paddingHorizontal: 20 }} onPress={() => navigation.navigate("priceHistory")} activeOpacity={0.5}>
      <chart_svg_1.default color={colors.icon01} width={30} height={30}/>
    </IconWrapper>);
    const renderHeaderRight = () => (<HeaderRight>
      <IconWrapper style={{ paddingLeft: 20 }} onPress={() => (0, client_only_query_1.saveHideBalance)(client, !hideBalance)} activeOpacity={0.5}>
        <themed_1.Icon name={hideBalance ? "eye-off" : "eye"} type="ionicon" color={colors.black} size={25}/>
      </IconWrapper>
      <IconWrapper style={{ paddingRight: 20 }} onPress={() => navigation.navigate("settings")} activeOpacity={0.5}>
        <setting_svg_1.default color={colors.icon01} width={30} height={30}/>
      </IconWrapper>
    </HeaderRight>);
    return null;
};
exports.default = Header;
const HeaderRight = native_1.default.View `
  height: 100%;
  flex-direction: row;
  align-items: center;
`;
const IconWrapper = native_1.default.TouchableOpacity `
  height: 100%;
  align-items: center;
  justify-content: center;
  padding-horizontal: 10px;
`;
//# sourceMappingURL=Header.js.map