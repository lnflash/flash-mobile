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
const i18n_react_1 = require("@app/i18n/i18n-react");
const client_1 = require("@flash/client");
// components
const screen_1 = require("@app/components/screen");
const refund_flow_1 = require("@app/components/refund-flow");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
// hooks
const hooks_1 = require("@app/hooks");
// utils
const config_1 = require("@app/config");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
// gql
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const RefundDestination = ({ navigation, route }) => {
    var _a, _b;
    const styles = useStyles();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const [recommendedFees, setRecommendedFees] = (0, react_1.useState)();
    const [selectedFee, setSelectedFee] = (0, react_1.useState)();
    const [selectedFeeType, setSelectedFeeType] = (0, react_1.useState)();
    const [destination, setDestination] = (0, react_1.useState)();
    const [status, setStatus] = (0, react_1.useState)("entering");
    const [error, setError] = (0, react_1.useState)();
    const [onChainAddressCurrent] = (0, generated_1.useOnChainAddressCurrentMutation)();
    const { data } = (0, generated_1.usePaymentRequestQuery)({
        fetchPolicy: "cache-first",
        skip: !isAuthed,
    });
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.wallets);
    (0, react_1.useEffect)(() => {
        if (!recommendedFees) {
            fetchBreezRecommendedFees();
        }
    }, []);
    const fetchBreezRecommendedFees = async () => {
        toggleActivityIndicator(true);
        const recommendedFees = await (0, breez_sdk_liquid_1.fetchRecommendedFees)();
        setRecommendedFees(recommendedFees);
        toggleActivityIndicator(false);
    };
    const validateDestination = () => {
        if (!destination) {
            setError("Please, enter destination to proceed");
        }
        else if (!selectedFee || !selectedFeeType) {
            setError("Please, select fee to proceed");
        }
        else {
            setStatus("validating");
            const parsedDestination = (0, client_1.parsePaymentDestination)({
                destination,
                network: "mainnet",
                lnAddressDomains: config_1.LNURL_DOMAINS,
            });
            console.log("PARSED DESTINATION>>>>>>>>>>>>>", parsedDestination);
            if (parsedDestination.valid && parsedDestination.paymentType === "onchain") {
                setStatus("valid");
                navigation.navigate("RefundConfirmation", {
                    swapAddress: route.params.swapAddress,
                    amount: route.params.amount,
                    destination,
                    fee: selectedFee,
                    feeType: selectedFeeType,
                });
            }
            else {
                setStatus("invalid");
                setError("Please, enter valid destination");
            }
        }
    };
    const navigateToScanning = () => {
        if (!!selectedFee && !!selectedFeeType) {
            navigation.navigate("scanningQRCode", {
                swapAddress: route.params.swapAddress,
                amount: route.params.amount,
                fee: selectedFee,
                feeType: selectedFeeType,
            });
        }
        else {
            setError("Please, select fee to proceed");
        }
    };
    const generateOnChainInvoice = async () => {
        var _a, _b;
        if (!!usdWallet) {
            const result = await onChainAddressCurrent({
                variables: { input: { walletId: usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.id } },
            });
            if ((_a = result.data) === null || _a === void 0 ? void 0 : _a.onChainAddressCurrent.address) {
                setDestination((_b = result.data) === null || _b === void 0 ? void 0 : _b.onChainAddressCurrent.address);
            }
        }
    };
    const onSelectFee = (type, value) => {
        setSelectedFeeType(type);
        setSelectedFee(value);
    };
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <refund_flow_1.DestinationField destination={destination} status={status} validateDestination={validateDestination} handleChangeText={setDestination} setDestination={setDestination} navigateToScanning={navigateToScanning}/>
      {!!usdWallet && (<react_native_1.TouchableOpacity onPress={generateOnChainInvoice}>
          <themed_1.Text style={styles.text}>{LL.RefundFlow.refundTo()}</themed_1.Text>
        </react_native_1.TouchableOpacity>)}
      <refund_flow_1.Fees recommendedFees={recommendedFees} selectedFeeType={selectedFeeType} onSelectFee={onSelectFee}/>
      <themed_1.Text style={styles.errorMsg}>{error}</themed_1.Text>
      <react_native_1.View style={styles.buttonContainer}>
        <galoy_primary_button_1.GaloyPrimaryButton title={LL.common.next()} loading={status === "validating"} disabled={!destination || !selectedFee} onPress={validateDestination}/>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.default = RefundDestination;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    text: { color: "#60aa55" },
    buttonContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    errorMsg: {
        color: colors.error,
    },
}));
//# sourceMappingURL=RefundDestination.js.map