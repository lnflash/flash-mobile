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
const client_1 = require("@flash/client");
const config_1 = require("@app/config");
// components
const redeem_flow_1 = require("@app/components/redeem-flow");
const amount_input_1 = require("@app/components/amount-input");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const screen_1 = require("@app/components/screen");
// hooks
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const persistent_state_1 = require("@app/store/persistent-state");
// types
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const RedeemBitcoinDetailScreen = ({ route, navigation }) => {
    var _a;
    const { callback, domain, defaultDescription, k1, minWithdrawable, maxWithdrawable, lnurl, } = route.params.receiveDestination.validDestination;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const [lnUsdInvoiceCreate] = (0, generated_1.useLnUsdInvoiceCreateMutation)();
    const [hasError, setHasError] = (0, react_1.useState)(false);
    const [minSats, setMinSats] = (0, react_1.useState)((0, amounts_1.toBtcMoneyAmount)(Math.round(minWithdrawable / 1000)));
    const [maxSats, setMaxSats] = (0, react_1.useState)((0, amounts_1.toBtcMoneyAmount)(Math.round(maxWithdrawable / 1000)));
    const [unitOfAccountAmount, setUnitOfAccountAmount] = (0, react_1.useState)(minSats);
    if (!convertMoneyAmount) {
        console.log("convertMoneyAmount is undefined");
        return null;
    }
    const amountIsFlexible = minSats.amount !== maxSats.amount;
    const btcMoneyAmount = convertMoneyAmount(unitOfAccountAmount, generated_1.WalletCurrency.Btc);
    const validAmount = btcMoneyAmount.amount !== null &&
        btcMoneyAmount.amount <= maxSats.amount &&
        btcMoneyAmount.amount >= minSats.amount;
    (0, react_1.useEffect)(() => {
        var _a, _b;
        if (((_a = persistentState.defaultWallet) === null || _a === void 0 ? void 0 : _a.walletCurrency) === generated_1.WalletCurrency.Usd) {
            calculateEstimatedFee();
            navigation.setOptions({ title: LL.RedeemBitcoinScreen.usdTitle() });
        }
        else if (((_b = persistentState.defaultWallet) === null || _b === void 0 ? void 0 : _b.walletCurrency) === generated_1.WalletCurrency.Btc) {
            navigation.setOptions({ title: LL.RedeemBitcoinScreen.title() });
        }
    }, [persistentState.defaultWallet]);
    const calculateEstimatedFee = async () => {
        var _a, _b;
        if (persistentState.defaultWallet) {
            const usdAmount = convertMoneyAmount(maxSats, generated_1.WalletCurrency.Usd);
            const { data } = await lnUsdInvoiceCreate({
                variables: {
                    input: {
                        walletId: (_a = persistentState.defaultWallet) === null || _a === void 0 ? void 0 : _a.id,
                        amount: usdAmount.amount,
                        memo: defaultDescription,
                    },
                },
            });
            if (data === null || data === void 0 ? void 0 : data.lnUsdInvoiceCreate.invoice) {
                const parsedDestination = (0, client_1.parsePaymentDestination)({
                    destination: (_b = data === null || data === void 0 ? void 0 : data.lnUsdInvoiceCreate.invoice) === null || _b === void 0 ? void 0 : _b.paymentRequest,
                    network: "mainnet",
                    lnAddressDomains: config_1.LNURL_DOMAINS,
                });
                const estimatedFee = parsedDestination.amount - maxSats.amount;
                const maxAmount = maxSats.amount - estimatedFee;
                setMaxSats((0, amounts_1.toBtcMoneyAmount)(maxAmount));
            }
        }
    };
    const navigate = () => {
        var _a, _b;
        if (persistentState.defaultWallet) {
            navigation.replace("redeemBitcoinResult", {
                callback,
                domain,
                k1,
                defaultDescription,
                minWithdrawableSatoshis: minSats,
                maxWithdrawableSatoshis: maxSats,
                receivingWalletDescriptor: {
                    id: (_a = persistentState.defaultWallet) === null || _a === void 0 ? void 0 : _a.id,
                    currency: (_b = persistentState.defaultWallet) === null || _b === void 0 ? void 0 : _b.walletCurrency,
                },
                unitOfAccountAmount,
                settlementAmount: btcMoneyAmount,
                displayAmount: convertMoneyAmount(btcMoneyAmount, amounts_1.DisplayCurrency),
                usdAmount: convertMoneyAmount(btcMoneyAmount, generated_1.WalletCurrency.Usd),
                lnurl,
            });
        }
    };
    return (<screen_1.Screen preset="scroll" style={styles.contentContainer}>
      <redeem_flow_1.DetailDescription defaultDescription={defaultDescription} domain={domain}/>
      <react_native_1.View style={styles.currencyInputContainer}>
        <amount_input_1.AmountInput walletCurrency={((_a = persistentState.defaultWallet) === null || _a === void 0 ? void 0 : _a.walletCurrency) || "BTC"} unitOfAccountAmount={unitOfAccountAmount} setAmount={setUnitOfAccountAmount} maxAmount={maxSats} minAmount={minSats} convertMoneyAmount={convertMoneyAmount} canSetAmount={amountIsFlexible}/>
        <redeem_flow_1.InforError unitOfAccountAmount={unitOfAccountAmount} minWithdrawableSatoshis={minSats} maxWithdrawableSatoshis={maxSats} amountIsFlexible={amountIsFlexible} setHasError={setHasError}/>
      </react_native_1.View>

      <galoy_primary_button_1.GaloyPrimaryButton title={LL.RedeemBitcoinScreen.redeemBitcoin()} disabled={!validAmount || hasError} onPress={navigate}/>
    </screen_1.Screen>);
};
exports.default = RedeemBitcoinDetailScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    currencyInputContainer: {
        paddingVertical: 20,
        borderRadius: 10,
    },
    contentContainer: {
        padding: 20,
        flexGrow: 1,
    },
}));
//# sourceMappingURL=redeem-bitcoin-detail-screen.js.map