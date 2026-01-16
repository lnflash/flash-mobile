"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
// types
const generated_1 = require("@app/graphql/generated");
// assets
const transfer_svg_1 = __importDefault(require("@app/assets/icons-redesign/transfer.svg"));
const SwapWallets = ({ fromWalletCurrency, formattedBtcBalance, formattedUsdBalance, canToggleWallet, setFromWalletCurrency, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const toggleWallet = () => {
        setFromWalletCurrency(fromWalletCurrency === "BTC" ? "USD" : "BTC");
    };
    return (<react_native_1.View style={styles.walletSelectorContainer}>
      <react_native_1.View style={styles.walletsContainer}>
        <react_native_1.View style={styles.fromFieldContainer}>
          <react_native_1.View style={styles.walletSelectorInfoContainer}>
            {fromWalletCurrency === generated_1.WalletCurrency.Btc ? (<themed_1.Text style={styles.walletCurrencyText}>{`${LL.common.from()} ${LL.common.btcAccount()}`}</themed_1.Text>) : (<themed_1.Text style={styles.walletCurrencyText}>{`${LL.common.from()} ${LL.common.usdAccount()}`}</themed_1.Text>)}
            <react_native_1.View style={styles.walletSelectorBalanceContainer}>
              <themed_1.Text>
                {fromWalletCurrency === generated_1.WalletCurrency.Btc
            ? formattedBtcBalance
            : formattedUsdBalance}
              </themed_1.Text>
            </react_native_1.View>
          </react_native_1.View>
        </react_native_1.View>
        <react_native_1.View style={styles.walletSeparator}>
          <react_native_1.View style={styles.line}></react_native_1.View>
          <react_native_1.TouchableOpacity style={styles.switchButton} disabled={!canToggleWallet} onPress={toggleWallet}>
            <transfer_svg_1.default color={colors.primary}/>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>
        <react_native_1.View style={styles.toFieldContainer}>
          <react_native_1.View style={styles.walletSelectorInfoContainer}>
            {fromWalletCurrency === generated_1.WalletCurrency.Btc ? (<themed_1.Text style={styles.walletCurrencyText}>{`${LL.common.to()} ${LL.common.usdAccount()}`}</themed_1.Text>) : (<themed_1.Text style={styles.walletCurrencyText}>{`${LL.common.to()} ${LL.common.btcAccount()}`}</themed_1.Text>)}
            <react_native_1.View style={styles.walletSelectorBalanceContainer}>
              <themed_1.Text>
                {fromWalletCurrency === generated_1.WalletCurrency.Btc
            ? formattedUsdBalance
            : formattedBtcBalance}
              </themed_1.Text>
            </react_native_1.View>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.View>);
};
exports.default = SwapWallets;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    toFieldContainer: {
        flexDirection: "row",
        marginTop: 15,
        marginRight: 75,
    },
    walletSelectorContainer: {
        flexDirection: "row",
        backgroundColor: colors.grey5,
        borderRadius: 10,
        padding: 15,
        marginBottom: 15,
    },
    walletsContainer: {
        flex: 1,
    },
    walletSeparator: {
        flexDirection: "row",
        height: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    line: {
        backgroundColor: colors.grey4,
        height: 1,
        flex: 1,
    },
    switchButton: {
        height: 50,
        width: 50,
        borderRadius: 50,
        elevation: react_native_1.Platform.OS === "android" ? 50 : 0,
        backgroundColor: colors.grey4,
        justifyContent: "center",
        alignItems: "center",
    },
    fromFieldContainer: {
        flexDirection: "row",
        marginBottom: 15,
        marginRight: 75,
    },
    walletSelectorInfoContainer: {
        flex: 1,
        flexDirection: "column",
    },
    walletCurrencyText: {
        fontWeight: "bold",
        fontSize: 18,
    },
    walletSelectorBalanceContainer: {
        flex: 1,
        flexDirection: "row",
        flexWrap: "wrap",
    },
}));
//# sourceMappingURL=SwapWallets.js.map