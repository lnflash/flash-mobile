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
// components
const amount_input_1 = require("../amount-input");
const note_input_1 = require("../note-input");
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
// utils
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const AmountNote = ({ request }) => {
    const styles = useStyles();
    const [minAmount, setMinAmount] = (0, react_1.useState)();
    const [maxAmount, setMaxAmount] = (0, react_1.useState)();
    (0, react_1.useEffect)(() => {
        fetchMinMaxAmount();
    }, [request.receivingWalletDescriptor.currency, request.type]);
    const fetchMinMaxAmount = async () => {
        if (request.receivingWalletDescriptor.currency === "BTC") {
            let limits;
            if (request.type === index_types_1.Invoice.Lightning) {
                limits = await (0, breez_sdk_liquid_1.fetchBreezLightningLimits)();
            }
            else if (request.type === index_types_1.Invoice.OnChain) {
                limits = await (0, breez_sdk_liquid_1.fetchBreezOnChainLimits)();
            }
            setMinAmount({
                amount: (limits === null || limits === void 0 ? void 0 : limits.receive.minSat) || 0,
                currency: "BTC",
                currencyCode: "SAT",
            });
            setMaxAmount({
                amount: (limits === null || limits === void 0 ? void 0 : limits.receive.maxSat) || 0,
                currency: "BTC",
                currencyCode: "SAT",
            });
        }
        else {
            setMinAmount({
                amount: 1,
                currency: "USD",
                currencyCode: "USD",
            });
            setMaxAmount(undefined);
        }
    };
    if (request.type !== "PayCode") {
        return (<react_native_1.View style={styles.container}>
        <amount_input_1.AmountInput request={request} unitOfAccountAmount={request.unitOfAccountAmount} setAmount={request.setAmount} canSetAmount={request.canSetAmount} convertMoneyAmount={request.convertMoneyAmount} walletCurrency={request.receivingWalletDescriptor.currency} showValuesIfDisabled={false} minAmount={minAmount} maxAmount={maxAmount} big={false} newDesign={true}/>
        <note_input_1.NoteInput onBlur={request.setMemo} onChangeText={request.setMemoChangeText} value={request.memoChangeText || ""} editable={request.canSetMemo} style={{ marginTop: 10 }} big={false} newDesign={true}/>
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = AmountNote;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border01,
    },
}));
//# sourceMappingURL=AmountNote.js.map