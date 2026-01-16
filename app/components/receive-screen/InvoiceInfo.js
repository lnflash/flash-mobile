"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const moment_1 = __importDefault(require("moment"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
// types
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
// utils
const testProps_1 = require("../../utils/testProps");
// assets
const share_new_svg_1 = __importDefault(require("@app/assets/icons/share-new.svg"));
const InvoiceInfo = ({ request, lnurlp, handleCopy }) => {
    var _a, _b;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const handleShare = async () => {
        if (!!lnurlp) {
            const result = await react_native_1.Share.share({ message: lnurlp });
        }
        else {
            if (request.share) {
                request.share();
            }
        }
    };
    if (request.state !== index_types_1.PaymentRequestState.Loading) {
        return (<react_native_1.View style={styles.wrapper}>
        {((_b = (_a = request.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType) === index_types_1.Invoice.Lightning && (<themed_1.Text type="caption" color={colors.placeholder} style={styles.invoiceDetails}>
            {request.state === index_types_1.PaymentRequestState.Expired
                    ? LL.ReceiveScreen.invoiceHasExpired()
                    : `Valid for ${(0, moment_1.default)(request.info.data.expiresAt).fromNow(true)}`}
          </themed_1.Text>)}
        {request.readablePaymentRequest && (<react_native_1.View style={styles.extraDetails}>
            <react_native_1.TouchableOpacity onPress={handleCopy}>
              <themed_1.Text type="bl" {...(0, testProps_1.testProps)("readable-payment-request")}>
                {request.readablePaymentRequest}
              </themed_1.Text>
            </react_native_1.TouchableOpacity>
            <react_native_1.TouchableOpacity onPress={handleShare} style={styles.shareInvoice}>
              <share_new_svg_1.default color={colors.accent02}/>
            </react_native_1.TouchableOpacity>
          </react_native_1.View>)}
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = InvoiceInfo;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    wrapper: {
        marginBottom: 20,
    },
    invoiceDetails: {
        textAlign: "center",
        marginBottom: 2,
    },
    extraDetails: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
    },
    shareInvoice: {
        marginLeft: 5,
    },
}));
//# sourceMappingURL=InvoiceInfo.js.map