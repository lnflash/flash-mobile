"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
const DetailDestination = ({ flashUserAddress, paymentDetail }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    if (paymentDetail.paymentType === "intraledger" ||
        (paymentDetail.paymentType === "lnurl" && !!paymentDetail.lnurlParams.identifier)) {
        return (<react_native_1.View style={styles.fieldContainer}>
        <themed_1.Text style={styles.fieldTitleText}>{LL.common.to()}</themed_1.Text>

        <react_native_1.View style={styles.fieldBackground}>
          <react_native_1.View style={styles.walletSelectorInfoContainer}>
            <themed_1.Text>
              {(flashUserAddress === null || flashUserAddress === void 0 ? void 0 : flashUserAddress.split("@")[0]) === paymentDetail.destination
                ? flashUserAddress
                : paymentDetail.destination}
            </themed_1.Text>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = DetailDestination;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    fieldBackground: {
        flexDirection: "row",
        borderStyle: "solid",
        overflow: "hidden",
        backgroundColor: colors.grey5,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignItems: "center",
        height: 60,
    },
    walletSelectorInfoContainer: {
        flex: 1,
        flexDirection: "column",
    },
    fieldTitleText: {
        fontWeight: "bold",
        marginBottom: 4,
    },
    fieldContainer: {
        marginBottom: 12,
    },
}));
//# sourceMappingURL=DetailDestination.js.map