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
exports.AmountInputScreenUI = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const i18n_react_1 = require("@app/i18n/i18n-react");
// components
const galoy_error_box_1 = require("../atomic/galoy-error-box");
const currency_keyboard_1 = require("../currency-keyboard");
const buttons_1 = require("../buttons");
// assets
const sync_svg_1 = __importDefault(require("@app/assets/icons/sync.svg"));
const AmountInputScreenUI = ({ walletCurrency, primaryCurrencySymbol, primaryCurrencyFormattedAmount, primaryCurrencyCode, secondaryCurrencySymbol, secondaryCurrencyFormattedAmount, secondaryCurrencyCode, errorMessage, onKeyPress, onToggleCurrency, onSetAmountPress, setAmountDisabled, goBack, title, }) => {
    const { bottom } = (0, react_native_safe_area_context_1.useSafeAreaInsets)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    return (<react_native_1.View style={[styles.amountInputScreenContainer, { marginBottom: !bottom ? 20 : 10 }]}>
      <react_native_1.View style={styles.topContainer}>
        <react_native_1.View style={styles.header}>
          <themed_1.Text type={"h01"} style={styles.headerTxt}>
            {title}
          </themed_1.Text>
          <react_native_1.TouchableOpacity style={styles.close} onPress={goBack}>
            <themed_1.Icon type="ionicon" name={"close"} size={40}/>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>
        <themed_1.Text type={primaryCurrencyCode === "SAT" ? "h03" : "h04"} style={styles.primaryAmount}>
          {`${primaryCurrencySymbol}${primaryCurrencyFormattedAmount || 0}`}
          {!primaryCurrencySymbol && <themed_1.Text>{` ${primaryCurrencyCode}`}</themed_1.Text>}
        </themed_1.Text>
        {!!secondaryCurrencyCode && (<react_native_1.TouchableOpacity style={styles.secondaryAmount} onPress={onToggleCurrency}>
            <themed_1.Text>{`${secondaryCurrencySymbol}${secondaryCurrencyFormattedAmount} ${secondaryCurrencySymbol ? "" : secondaryCurrencyCode}`}</themed_1.Text>
            <sync_svg_1.default color={colors.icon01}/>
          </react_native_1.TouchableOpacity>)}
      </react_native_1.View>
      <react_native_1.View style={styles.bottomContainer}>
        <react_native_1.View style={styles.infoContainer}>
          {errorMessage && <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>}
        </react_native_1.View>
        <currency_keyboard_1.CurrencyKeyboard onPress={onKeyPress}/>
        <buttons_1.PrimaryBtn disabled={!onSetAmountPress || setAmountDisabled} onPress={onSetAmountPress ? onSetAmountPress : () => { }} label={LL.AmountInputScreen.setAmount()} btnStyle={styles.btnStyle}/>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.AmountInputScreenUI = AmountInputScreenUI;
const useStyles = (0, themed_1.makeStyles)(() => ({
    amountInputScreenContainer: {
        flex: 1,
    },
    topContainer: {
        alignItems: "center",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 10,
    },
    headerTxt: {
        flex: 1,
        textAlign: "center",
        marginLeft: 80,
    },
    close: {
        paddingHorizontal: 20,
    },
    primaryAmount: {
        marginTop: 50,
    },
    secondaryAmount: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#DDE3E1",
        marginTop: 30,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    infoContainer: {
        paddingHorizontal: 20,
        marginBottom: 10,
    },
    bottomContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    btnStyle: {
        marginHorizontal: 20,
        marginTop: 10,
    },
}));
//# sourceMappingURL=amount-input-screen-ui.js.map