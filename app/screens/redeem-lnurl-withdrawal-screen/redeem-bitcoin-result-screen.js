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
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const cross_fetch_1 = __importDefault(require("cross-fetch"));
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const client_1 = require("@apollo/client");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const hooks_1 = require("@app/hooks");
// components
const screen_1 = require("@app/components/screen");
const redeem_flow_1 = require("@app/components/redeem-flow");
const my_ln_updates_sub_1 = require("../receive-bitcoin-screen/my-ln-updates-sub");
// gql
const generated_1 = require("@app/graphql/generated");
// breez-sdk
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const RedeemBitcoinResultScreen = ({ route, navigation }) => {
    const { callback, domain, defaultDescription, k1, receivingWalletDescriptor, unitOfAccountAmount, settlementAmount, displayAmount, usdAmount, lnurl, } = route.params;
    const styles = useStyles();
    const client = (0, client_1.useApolloClient)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { formatDisplayAndWalletAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const [lnUsdInvoiceCreate] = (0, generated_1.useLnUsdInvoiceCreateMutation)();
    const [err, setErr] = (0, react_1.useState)("");
    const [withdrawalInvoice, setInvoice] = (0, react_1.useState)();
    const [success, setSuccess] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (receivingWalletDescriptor.currency === generated_1.WalletCurrency.Usd) {
            navigation.setOptions({ title: LL.RedeemBitcoinScreen.usdTitle() });
        }
        else if (receivingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
            navigation.setOptions({ title: LL.RedeemBitcoinScreen.title() });
        }
    }, [receivingWalletDescriptor.currency]);
    (0, react_1.useEffect)(() => {
        if (!success && !err) {
            toggleActivityIndicator(true);
        }
        else {
            toggleActivityIndicator(false);
        }
    }, [success, err]);
    (0, react_1.useEffect)(() => {
        if (success) {
            client.refetchQueries({ include: [generated_1.HomeAuthedDocument] });
            const id = setTimeout(() => {
                navigation.popToTop();
            }, 5000);
            return () => clearTimeout(id);
        }
    }, [success]);
    (0, react_1.useEffect)(() => {
        if (receivingWalletDescriptor.currency === "BTC") {
            redeemToBTCWallet();
        }
        else {
            if (withdrawalInvoice) {
                submitLNURLWithdrawRequest(withdrawalInvoice);
            }
            else {
                createWithdrawRequestInvoice(usdAmount.amount, defaultDescription);
            }
        }
    }, [withdrawalInvoice, usdAmount, lnurl]);
    const createWithdrawRequestInvoice = (0, react_1.useCallback)(async (amount, memo) => {
        try {
            const { data } = await lnUsdInvoiceCreate({
                variables: {
                    input: {
                        walletId: receivingWalletDescriptor.id,
                        amount,
                        memo,
                    },
                },
            });
            if (data) {
                const { lnUsdInvoiceCreate } = data;
                if (lnUsdInvoiceCreate.invoice) {
                    setInvoice(lnUsdInvoiceCreate.invoice);
                }
                else {
                    console.error(lnUsdInvoiceCreate.errors, "error with lnInvoiceCreate");
                    setErr(LL.RedeemBitcoinScreen.error());
                }
            }
        }
        catch (err) {
            console.error(err, "error with AddInvoice");
            setErr(`${err}`);
        }
    }, [lnUsdInvoiceCreate, receivingWalletDescriptor, LL]);
    const submitLNURLWithdrawRequest = (0, react_1.useCallback)(async (generatedInvoice) => {
        var _a;
        const url = `${callback}${callback.includes("?") ? "&" : "?"}k1=${k1}&pr=${generatedInvoice.paymentRequest}`;
        const result = await (0, cross_fetch_1.default)(url);
        if (result.ok) {
            const lnurlResponse = await result.json();
            if (((_a = lnurlResponse === null || lnurlResponse === void 0 ? void 0 : lnurlResponse.status) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== "ok") {
                console.error(lnurlResponse, "error with redeeming");
                setErr(lnurlResponse.reason || LL.RedeemBitcoinScreen.redeemingError());
            }
            else {
                setSuccess(true);
            }
        }
        else {
            const lnurlResponse = await result.json();
            console.error(lnurlResponse.reason, "error with submitting withdrawalRequest");
            setErr(LL.RedeemBitcoinScreen.submissionError() + `\n ${lnurlResponse.reason}`);
        }
    }, [callback, LL, k1]);
    const redeemToBTCWallet = async () => {
        const res = await (0, breez_sdk_liquid_1.onRedeem)(lnurl, settlementAmount, defaultDescription);
        if (res.success) {
            setSuccess(true);
        }
        else {
            setErr(res.error || LL.RedeemBitcoinScreen.redeemingError());
        }
    };
    return (<screen_1.Screen preset="scroll" style={styles.contentContainer}>
      <react_native_1.View style={[styles.inputForm, styles.container]}>
        {defaultDescription && (<themed_1.Text type={"p1"} style={styles.withdrawableDescriptionText}>
            {defaultDescription}
          </themed_1.Text>)}
        <react_native_1.View style={styles.currencyInputContainer}>
          <themed_1.Text style={{ textAlign: "center" }}>
            {LL.RedeemBitcoinScreen.redeemAmountFrom({
            amountToRedeem: formatDisplayAndWalletAmount({
                primaryAmount: unitOfAccountAmount,
                walletAmount: settlementAmount,
                displayAmount,
            }),
            domain,
        })}
          </themed_1.Text>
        </react_native_1.View>
        <redeem_flow_1.ResultError err={err}/>
        <redeem_flow_1.ResultSuccess success={success}/>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.default = (0, my_ln_updates_sub_1.withMyLnUpdateSub)(RedeemBitcoinResultScreen);
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        justifyContent: "center",
        alignItems: "center",
        marginTop: 14,
        marginLeft: 20,
        marginRight: 20,
    },
    inputForm: {
        marginVertical: 20,
    },
    currencyInputContainer: {
        padding: 10,
        marginTop: 10,
        backgroundColor: colors.grey5,
        borderRadius: 10,
    },
    withdrawableDescriptionText: {
        textAlign: "center",
    },
    contentContainer: {
        padding: 20,
        flexGrow: 1,
    },
}));
//# sourceMappingURL=redeem-bitcoin-result-screen.js.map