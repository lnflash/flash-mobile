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
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("@app/hooks");
const persistent_state_1 = require("@app/store/persistent-state");
// components
const screen_1 = require("@app/components/screen");
const refund_flow_1 = require("@app/components/refund-flow");
const amount_input_1 = require("@app/components/amount-input");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const payment_destination_display_1 = require("@app/components/payment-destination-display");
// assets
const destination_svg_1 = __importDefault(require("@app/assets/icons/destination.svg"));
// utils
const testProps_1 = require("@app/utils/testProps");
const amounts_1 = require("@app/types/amounts");
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const storage_1 = require("@app/utils/storage");
const RefundConfirmation = ({ navigation, route }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const { updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const [modalVisible, setModalVisible] = (0, react_1.useState)(false);
    const [errorMsg, setErrorMsg] = (0, react_1.useState)();
    const [txId, setTxId] = (0, react_1.useState)();
    if (!convertMoneyAmount)
        return false;
    const onConfirm = async () => {
        try {
            toggleActivityIndicator(true);
            const refundResponse = await (0, react_native_breez_sdk_liquid_1.refund)({
                swapAddress: route.params.swapAddress,
                refundAddress: route.params.destination,
                feeRateSatPerVbyte: route.params.fee,
            });
            console.log("Refund Response>>>>>>>>>>>>>>>", refundResponse);
            if (refundResponse.refundTxId) {
                updateState((state) => {
                    if (state)
                        return Object.assign(Object.assign({}, state), { numOfRefundables: state.numOfRefundables - 1 });
                    return undefined;
                });
                setTxId(refundResponse.refundTxId);
                setModalVisible(true);
                const refundedTxs = await (0, storage_1.loadJson)("refundedTxs");
                (0, storage_1.save)("refundedTxs", [
                    ...refundedTxs,
                    {
                        swapAddress: route.params.swapAddress,
                        amountSat: route.params.amount,
                        timestamp: new Date().getTime(),
                        txId: refundResponse.refundTxId,
                    },
                ]);
            }
            else {
                setErrorMsg("Something went wrong. Please, try again.");
            }
        }
        catch (err) {
            console.log("Refund Error:", err);
        }
        finally {
            toggleActivityIndicator(false);
        }
    };
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <react_native_1.View style={styles.fieldContainer}>
        <themed_1.Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.destination()}</themed_1.Text>
        <react_native_1.View style={styles.fieldBackground}>
          <react_native_1.View style={styles.destinationIconContainer}>
            <destination_svg_1.default fill={colors.black}/>
          </react_native_1.View>
          <payment_destination_display_1.PaymentDestinationDisplay destination={route.params.destination} paymentType={"onchain"}/>
        </react_native_1.View>
      </react_native_1.View>
      <react_native_1.View style={styles.fieldContainer}>
        <themed_1.Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.amount()}</themed_1.Text>
        <amount_input_1.AmountInput unitOfAccountAmount={(0, amounts_1.toBtcMoneyAmount)(route.params.amount)} canSetAmount={false} convertMoneyAmount={convertMoneyAmount} walletCurrency={"BTC"}/>
      </react_native_1.View>
      <react_native_1.View style={styles.fieldContainer}>
        <themed_1.Text style={styles.fieldTitleText}>
          {LL.SendBitcoinConfirmationScreen.feeLabel()}
        </themed_1.Text>
        <react_native_1.View style={styles.fieldBackground}>
          <themed_1.Text {...(0, testProps_1.testProps)("Successful Fee")}>
            {`${route.params.feeType} (${route.params.fee} sats/vbyte)`}
          </themed_1.Text>
        </react_native_1.View>
      </react_native_1.View>
      {!!errorMsg && <themed_1.Text style={styles.errorMsg}>{errorMsg}</themed_1.Text>}
      <react_native_1.View style={styles.buttonContainer}>
        <galoy_primary_button_1.GaloyPrimaryButton title={LL.common.confirm()} onPress={onConfirm}/>
      </react_native_1.View>
      <refund_flow_1.SuccessModal txId={txId} isVisible={modalVisible} setIsVisible={setModalVisible}/>
    </screen_1.Screen>);
};
exports.default = RefundConfirmation;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    fieldTitleText: {
        fontWeight: "bold",
        marginBottom: 4,
    },
    fieldContainer: {
        marginBottom: 12,
    },
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
    destinationIconContainer: {
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    buttonContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    errorMsg: {
        color: colors.error,
        marginTop: 15,
    },
}));
//# sourceMappingURL=RefundConfirmation.js.map