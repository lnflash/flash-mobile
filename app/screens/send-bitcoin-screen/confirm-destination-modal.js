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
exports.ConfirmDestinationModal = void 0;
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const testProps_1 = require("../../utils/testProps");
const custom_modal_1 = __importDefault(require("@app/components/custom-modal/custom-modal"));
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const ConfirmDestinationModal = ({ destinationState, dispatchDestinationStateAction, }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { lnAddressHostname: lnDomain, name: bankName } = appConfig.galoyInstance;
    const [confirmationEnabled, setConfirmationEnabled] = (0, react_1.useState)(false);
    const confirmDestination = (0, react_1.useCallback)(() => {
        dispatchDestinationStateAction({
            type: "set-confirmed",
            payload: { unparsedDestination: destinationState.unparsedDestination },
        });
    }, [destinationState, dispatchDestinationStateAction]);
    if (destinationState.destinationState !== "requires-confirmation")
        return null;
    let checkBoxLabel = "";
    let warningMessage = "";
    let identifier = "";
    if (destinationState.confirmationType.type === "new-username") {
        const lnAddress = destinationState.confirmationType.username + "@" + lnDomain;
        identifier = lnAddress;
        warningMessage = LL.SendBitcoinDestinationScreen.confirmModal.warning({ bankName });
        checkBoxLabel = LL.SendBitcoinDestinationScreen.confirmModal.checkBox({ lnAddress });
    }
    else if (destinationState.confirmationType.type === "external-destination") {
        identifier = destinationState.confirmationType.address;
        warningMessage = LL.SendBitcoinDestinationScreen.confirmModal.externalWarning({
            bankName,
        });
        checkBoxLabel = LL.SendBitcoinDestinationScreen.confirmModal.externalCheckBox({
            address: identifier,
        });
    }
    const goBack = () => {
        dispatchDestinationStateAction({
            type: "set-unparsed-destination",
            payload: { unparsedDestination: destinationState.unparsedDestination },
        });
    };
    return (<custom_modal_1.default isVisible={destinationState.destinationState === "requires-confirmation"} toggleModal={goBack} title={LL.SendBitcoinDestinationScreen.confirmModal.title()} image={<galoy_icon_1.GaloyIcon name="info" size={100} color={colors.primary3}/>} body={<react_native_1.View style={styles.body}>
          <themed_1.Text type={"p2"} color={colors.warning} style={styles.warningText}>
            {warningMessage}
          </themed_1.Text>
        </react_native_1.View>} nonScrollingContent={<react_native_1.TouchableOpacity style={styles.checkBoxTouchable} onPress={() => setConfirmationEnabled(!confirmationEnabled)}>
          <react_native_1.View style={styles.checkBoxContainer}>
            <themed_1.CheckBox {...(0, testProps_1.testProps)(checkBoxLabel)} containerStyle={styles.checkBox} checked={confirmationEnabled} iconType="ionicon" checkedIcon={"checkbox"} uncheckedIcon={"square-outline"} onPress={() => setConfirmationEnabled(!confirmationEnabled)}/>
            <themed_1.Text type={"p2"} style={styles.checkBoxText}>
              <themed_1.Text type={"p2"} style={styles.checkBoxText}>
                {checkBoxLabel}
              </themed_1.Text>
            </themed_1.Text>
          </react_native_1.View>
        </react_native_1.TouchableOpacity>} primaryButtonOnPress={confirmDestination} primaryButtonDisabled={!confirmationEnabled} primaryButtonTitle={LL.SendBitcoinDestinationScreen.confirmModal.confirmButton()} secondaryButtonTitle={LL.common.back()} secondaryButtonOnPress={goBack}/>);
};
exports.ConfirmDestinationModal = ConfirmDestinationModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    modalCard: {
        backgroundColor: colors.white,
        borderRadius: 16,
        padding: 18,
    },
    warningText: {
        textAlign: "center",
    },
    body: {
        rowGap: 12,
    },
    buttonContainer: {
        rowGap: 12,
    },
    titleContainer: {
        marginBottom: 12,
    },
    checkBox: {
        paddingLeft: 0,
        backgroundColor: "transparent",
    },
    checkBoxTouchable: {
        marginTop: 12,
    },
    checkBoxContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: colors.grey5,
        borderRadius: 8,
    },
    checkBoxText: {
        flex: 1,
    },
}));
//# sourceMappingURL=confirm-destination-modal.js.map