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
exports.SendBitcoinDetailsExtraInfo = void 0;
const react_1 = __importStar(require("react"));
const payment_details_1 = require("./payment-details");
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
const upgrade_account_modal_1 = require("@app/components/upgrade-account-modal");
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const native_1 = require("@react-navigation/native");
const SendBitcoinDetailsExtraInfo = ({ errorMessage, amountStatus, currentLevel, }) => {
    const [isUpgradeAccountModalVisible, setIsUpgradeAccountModalVisible] = (0, react_1.useState)(false);
    const closeModal = () => setIsUpgradeAccountModalVisible(false);
    const openModal = () => setIsUpgradeAccountModalVisible(true);
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { formatMoneyAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const navigateToTransactionLimits = () => {
        navigation.navigate("transactionLimitsScreen");
    };
    if (errorMessage) {
        return <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>;
    }
    if (amountStatus.validAmount) {
        return null;
    }
    switch (amountStatus.invalidReason) {
        case payment_details_1.AmountInvalidReason.InsufficientLimit:
            return (<>
          <galoy_error_box_1.GaloyErrorBox errorMessage={LL.SendBitcoinScreen.amountExceedsLimit({
                    limit: formatMoneyAmount({
                        moneyAmount: amountStatus.remainingLimit,
                    }),
                })}/>
          <upgrade_account_modal_1.UpgradeAccountModal closeModal={closeModal} isVisible={isUpgradeAccountModalVisible}/>
          {currentLevel === "ZERO" ? (<themed_1.Text type="p2" style={styles.upgradeAccountText} onPress={openModal}>
              {LL.SendBitcoinScreen.upgradeAccountToIncreaseLimit()}
            </themed_1.Text>) : null}
          {currentLevel === "ONE" ? (<themed_1.Text type="p2" style={styles.upgradeAccountText} onPress={navigateToTransactionLimits}>
              {LL.TransactionLimitsScreen.contactSupportToPerformKyc()}
            </themed_1.Text>) : null}
        </>);
        case payment_details_1.AmountInvalidReason.InsufficientBalance:
            return (<galoy_error_box_1.GaloyErrorBox errorMessage={LL.SendBitcoinScreen.amountExceed({
                    balance: formatMoneyAmount({ moneyAmount: amountStatus.balance }),
                })}/>);
        case payment_details_1.AmountInvalidReason.MinOnChainLimit:
            return <galoy_error_box_1.GaloyErrorBox errorMessage={LL.SendBitcoinScreen.MinOnChainLimit()}/>;
        case payment_details_1.AmountInvalidReason.MinOnChainSatLimit:
            return <galoy_error_box_1.GaloyErrorBox errorMessage={LL.SendBitcoinScreen.MinOnChainSatLimit()}/>;
        case payment_details_1.AmountInvalidReason.MinFlashcardLimit:
            return <galoy_error_box_1.GaloyErrorBox errorMessage={LL.SendBitcoinScreen.MinFlashcardLimit()}/>;
        default:
            return null;
    }
};
exports.SendBitcoinDetailsExtraInfo = SendBitcoinDetailsExtraInfo;
const useStyles = (0, themed_1.makeStyles)(() => {
    return {
        upgradeAccountText: {
            marginTop: 5,
            textDecorationLine: "underline",
        },
    };
});
//# sourceMappingURL=send-bitcoin-details-extra-info.js.map