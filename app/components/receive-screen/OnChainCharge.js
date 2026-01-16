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
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
const OnChainCharge = ({ request }) => {
    var _a, _b, _c, _d;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    if (request.receivingWalletDescriptor.currency === "USD" &&
        ((_a = request.feesInformation) === null || _a === void 0 ? void 0 : _a.deposit.minBankFee) &&
        ((_b = request.feesInformation) === null || _b === void 0 ? void 0 : _b.deposit.minBankFeeThreshold) &&
        request.type === index_types_1.Invoice.OnChain) {
        return (<react_native_1.View style={styles.onchainCharges}>
        <themed_1.Text type="p4">
          {LL.ReceiveScreen.fees({
                minBankFee: (_c = request.feesInformation) === null || _c === void 0 ? void 0 : _c.deposit.minBankFee,
                minBankFeeThreshold: (_d = request.feesInformation) === null || _d === void 0 ? void 0 : _d.deposit.minBankFeeThreshold,
            })}
        </themed_1.Text>
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = OnChainCharge;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    onchainCharges: { marginTop: 10, alignItems: "center" },
}));
//# sourceMappingURL=OnChainCharge.js.map