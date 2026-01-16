"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentDestinationDisplay = void 0;
const hooks_1 = require("@app/hooks");
const themed_1 = require("@rneui/themed");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const useStyles = (0, themed_1.makeStyles)(() => ({
    highlight: {
        fontWeight: "800",
        fontSize: 15,
    },
    primaryTextStyle: {
        flex: 1,
    },
}));
const PaymentDestinationDisplay = ({ destination, paymentType, }) => {
    const styles = useStyles();
    const { appConfig: { galoyInstance: { lnAddressHostname: lnDomain }, }, } = (0, hooks_1.useAppConfig)();
    if (!destination) {
        return <react_native_1.ActivityIndicator />;
    }
    if (destination.length < 40) {
        return (<themed_1.Text type="p1" numberOfLines={1} ellipsizeMode={"middle"}>
        {destination}
        {paymentType === "intraledger" ? `@${lnDomain}` : ""}
      </themed_1.Text>);
    }
    // we assume this is a bitcoin address or lightning invoice
    // not a username
    const firstSix = destination.slice(0, 6);
    const middle = destination.slice(6, -6);
    const lastSix = destination.slice(-6);
    return (<themed_1.Text style={styles.primaryTextStyle} numberOfLines={1} ellipsizeMode={"middle"}>
      <themed_1.Text style={styles.highlight}>{firstSix}</themed_1.Text>
      {middle}
      <themed_1.Text style={styles.highlight}>{lastSix}</themed_1.Text>
    </themed_1.Text>);
};
exports.PaymentDestinationDisplay = PaymentDestinationDisplay;
//# sourceMappingURL=payment-destination-display.js.map