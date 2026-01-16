"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyTag = void 0;
const themed_1 = require("@rneui/themed");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const useStyles = (0, themed_1.makeStyles)(() => ({
    currencyTag: {
        borderRadius: 10,
        height: 30,
        width: 50,
        justifyContent: "center",
        alignItems: "center",
    },
    currencyText: {
        fontSize: 12,
    },
}));
const CurrencyTag = ({ walletCurrency }) => {
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const currencyStyling = {
        BTC: {
            textColor: colors.white,
            backgroundColor: colors.primary,
        },
        USD: {
            textColor: colors.black,
            backgroundColor: colors.green,
        },
    };
    return (<react_native_1.View style={Object.assign(Object.assign({}, styles.currencyTag), { backgroundColor: currencyStyling[walletCurrency].backgroundColor })}>
      <react_native_1.Text style={Object.assign(Object.assign({}, styles.currencyText), { color: currencyStyling[walletCurrency].textColor })}>
        {walletCurrency}
      </react_native_1.Text>
    </react_native_1.View>);
};
exports.CurrencyTag = CurrencyTag;
//# sourceMappingURL=currency-tag.js.map