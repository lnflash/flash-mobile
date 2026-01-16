"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DestinationInformation = void 0;
const modal_tooltip_1 = require("@app/components/modal-tooltip/modal-tooltip");
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const send_bitcoin_reducer_1 = require("./send-bitcoin-reducer");
const index_types_1 = require("./payment-destination/index.types");
const themed_1 = require("@rneui/themed");
const createToLnAddress = (lnDomain) => {
    return (handle) => {
        return `${handle}@${lnDomain}`;
    };
};
const destinationStateToInformation = (sendBitcoinReducerState, translate, bankDetails) => {
    const { bankName, lnDomain } = bankDetails;
    const toLnAddress = createToLnAddress(lnDomain);
    if (sendBitcoinReducerState.destinationState === send_bitcoin_reducer_1.DestinationState.Entering) {
        return {};
    }
    if (sendBitcoinReducerState.destinationState === send_bitcoin_reducer_1.DestinationState.Invalid) {
        switch (sendBitcoinReducerState.invalidDestination.invalidReason) {
            case index_types_1.InvalidDestinationReason.InvoiceExpired:
                return {
                    error: translate.SendBitcoinDestinationScreen.expiredInvoice(),
                };
            case index_types_1.InvalidDestinationReason.WrongNetwork:
                return {
                    error: translate.SendBitcoinDestinationScreen.wrongNetwork(),
                };
            case index_types_1.InvalidDestinationReason.InvalidAmount:
                return {
                    error: translate.SendBitcoinDestinationScreen.invalidAmount(),
                };
            case index_types_1.InvalidDestinationReason.UsernameDoesNotExist:
                return {
                    error: translate.SendBitcoinDestinationScreen.usernameDoesNotExist({
                        lnAddress: toLnAddress(sendBitcoinReducerState.invalidDestination
                            .invalidPaymentDestination.handle),
                        bankName,
                    }),
                    adviceTooltip: {
                        text: translate.SendBitcoinDestinationScreen.usernameDoesNotExistAdvice(),
                    },
                };
            case index_types_1.InvalidDestinationReason.SelfPayment:
                return {
                    error: translate.SendBitcoinDestinationScreen.selfPaymentError({
                        lnAddress: toLnAddress(sendBitcoinReducerState.invalidDestination
                            .invalidPaymentDestination.handle),
                        bankName,
                    }),
                    adviceTooltip: {
                        text: translate.SendBitcoinDestinationScreen.selfPaymentAdvice(),
                    },
                };
            case index_types_1.InvalidDestinationReason.LnurlError ||
                index_types_1.InvalidDestinationReason.LnurlUnsupported:
                return {
                    error: translate.SendBitcoinDestinationScreen.lnAddressError(),
                    adviceTooltip: {
                        text: translate.SendBitcoinDestinationScreen.lnAddressAdvice(),
                    },
                };
            case index_types_1.InvalidDestinationReason.UnknownLightning:
                return {
                    error: translate.SendBitcoinDestinationScreen.unknownLightning(),
                };
            case index_types_1.InvalidDestinationReason.UnknownOnchain:
                return {
                    error: translate.SendBitcoinDestinationScreen.unknownOnchain(),
                };
            default:
                return {
                    error: translate.SendBitcoinDestinationScreen.enterValidDestination(),
                    adviceTooltip: {
                        text: translate.SendBitcoinDestinationScreen.destinationOptions({ bankName }),
                    },
                };
        }
    }
    if (sendBitcoinReducerState.destinationState === "valid" &&
        sendBitcoinReducerState.confirmationType) {
        return {
            warning: translate.SendBitcoinDestinationScreen.newBankAddressUsername({
                lnAddress: toLnAddress(sendBitcoinReducerState.confirmationType.username),
                bankName,
            }),
        };
    }
    return {};
};
const DestinationInformation = ({ destinationState, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const styles = useStyles();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { lnAddressHostname, name } = appConfig.galoyInstance;
    const bankDetails = { lnDomain: lnAddressHostname, bankName: name };
    const information = destinationStateToInformation(destinationState, LL, bankDetails);
    return (<react_native_1.View style={styles.informationContainer}>
      {information.infoTooltip && (<modal_tooltip_1.ModalTooltip type="info" size={20} title={information.infoTooltip.title} text={information.infoTooltip.text}/>)}
      {information.adviceTooltip && (<modal_tooltip_1.ModalTooltip type="advice" size={20} text={information.adviceTooltip.text}/>)}
      <react_native_1.View style={styles.textContainer}>
        {information.information && (<themed_1.Text style={styles.informationText}>{information.information}</themed_1.Text>)}
        {information.error && <themed_1.Text color={colors.error}>{information.error}</themed_1.Text>}
        {information.warning && <themed_1.Text color={colors.warning}>{information.warning}</themed_1.Text>}
      </react_native_1.View>
    </react_native_1.View>);
};
exports.DestinationInformation = DestinationInformation;
const useStyles = (0, themed_1.makeStyles)(() => ({
    informationContainer: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
    },
    informationText: {
        paddingLeft: 2,
    },
    textContainer: {
        flex: 1,
    },
}));
//# sourceMappingURL=destination-information.js.map