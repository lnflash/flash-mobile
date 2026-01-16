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
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const netinfo_1 = require("@react-native-community/netinfo");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
// components
const galoy_icon_1 = require("../atomic/galoy-icon");
const galoy_error_box_1 = require("../atomic/galoy-error-box");
const utils_1 = require("@app/graphql/utils");
// utils
const persistent_state_1 = require("@app/store/persistent-state");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const Info = ({ refreshTriggered, error }) => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { colors, mode } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const netInfo = (0, netinfo_1.useNetInfo)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const color = mode === "light" ? colors.warning : colors.black;
    (0, react_1.useEffect)(() => {
        if (persistentState.isAdvanceMode && breez_sdk_liquid_1.breezSDKInitialized) {
            fetchRefundables();
        }
    }, [refreshTriggered, breez_sdk_liquid_1.breezSDKInitialized, persistentState.isAdvanceMode]);
    const fetchRefundables = async () => {
        try {
            const refundables = (await (0, react_native_breez_sdk_liquid_1.listRefundables)()) || [];
            updateState((state) => {
                if (state)
                    return Object.assign(Object.assign({}, state), { numOfRefundables: refundables.length });
                return undefined;
            });
        }
        catch (err) {
            console.log("List Refundables Err: ", err);
        }
    };
    if (!netInfo.isInternetReachable) {
        return (<react_native_1.View style={styles.wrapper}>
        <galoy_error_box_1.GaloyErrorBox errorMessage={"Wallet is offline"}/>
      </react_native_1.View>);
    }
    else if (error || (persistentState === null || persistentState === void 0 ? void 0 : persistentState.numOfRefundables) > 0) {
        return (<react_native_1.View style={styles.wrapper}>
        {(persistentState === null || persistentState === void 0 ? void 0 : persistentState.numOfRefundables) > 0 && (<react_native_1.View style={styles.container}>
            <galoy_icon_1.GaloyIcon name="warning" size={14} color={color}/>
            <themed_1.Text style={styles.textContainer} type={"p3"} color={color}>
              {`${LL.HomeScreen.refundableWarning()}  `}
              <themed_1.Text bold type={"p3"} color={colors.primary} onPress={() => navigation.navigate("RefundTransactionList")}>
                {LL.HomeScreen.refundables()}
              </themed_1.Text>
            </themed_1.Text>
          </react_native_1.View>)}
        {error && (persistentState === null || persistentState === void 0 ? void 0 : persistentState.numOfRefundables) > 0 && <react_native_1.View style={{ height: 5 }}/>}
        {error && <galoy_error_box_1.GaloyErrorBox errorMessage={(0, utils_1.getErrorMessages)(error)}/>}
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = Info;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    wrapper: {
        marginTop: 5,
        marginHorizontal: 20,
    },
    container: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: colors.warning9,
    },
    textContainer: {
        overflow: "hidden",
        marginLeft: 4,
        flex: 1,
    },
}));
//# sourceMappingURL=Info.js.map