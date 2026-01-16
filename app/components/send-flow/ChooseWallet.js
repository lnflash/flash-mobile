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
const i18n_react_1 = require("@app/i18n/i18n-react");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const react_native_modal_1 = __importDefault(require("react-native-modal"));
// hooks
const hooks_1 = require("@app/hooks");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const persistent_state_1 = require("@app/store/persistent-state");
// assets
const cash_svg_1 = __importDefault(require("@app/assets/icons/cash.svg"));
const bitcoin_svg_1 = __importDefault(require("@app/assets/icons/bitcoin.svg"));
// types
const amounts_1 = require("@app/types/amounts");
const generated_1 = require("@app/graphql/generated");
const testProps_1 = require("../../utils/testProps");
const ChooseWallet = ({ usdWallet, wallets, paymentDetail, setPaymentDetail, }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { persistentState } = (0, persistent_state_1.usePersistentStateContext)();
    const [isModalVisible, setIsModalVisible] = (0, react_1.useState)(false);
    const { formatDisplayAndWalletAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    const { sendingWalletDescriptor, convertMoneyAmount } = paymentDetail;
    const btcBalanceMoneyAmount = (0, amounts_1.toBtcMoneyAmount)(btcWallet.balance || (btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance));
    const usdBalanceMoneyAmount = (0, amounts_1.toUsdMoneyAmount)(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance);
    const btcWalletText = formatDisplayAndWalletAmount({
        displayAmount: convertMoneyAmount(btcBalanceMoneyAmount, amounts_1.DisplayCurrency),
        walletAmount: btcBalanceMoneyAmount,
    });
    const usdWalletText = formatDisplayAndWalletAmount({
        displayAmount: convertMoneyAmount(usdBalanceMoneyAmount, amounts_1.DisplayCurrency),
        walletAmount: usdBalanceMoneyAmount,
    });
    const toggleModal = () => {
        if (persistentState.isAdvanceMode)
            setIsModalVisible(!isModalVisible);
    };
    const chooseWallet = (wallet) => {
        let updatedPaymentDetail = paymentDetail.setSendingWalletDescriptor({
            id: wallet.id,
            currency: wallet.walletCurrency,
        });
        // switch back to the display currency
        if (updatedPaymentDetail.canSetAmount) {
            const displayAmount = updatedPaymentDetail.convertMoneyAmount(paymentDetail.unitOfAccountAmount, amounts_1.DisplayCurrency);
            updatedPaymentDetail = updatedPaymentDetail.setAmount(displayAmount);
        }
        setPaymentDetail(updatedPaymentDetail);
        toggleModal();
    };
    if (persistentState.isAdvanceMode && btcWallet) {
        wallets = [...wallets, btcWallet];
    }
    const CurrencyIcon = sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc ? bitcoin_svg_1.default : cash_svg_1.default;
    return (<react_native_1.View style={styles.fieldContainer}>
      <themed_1.Text style={styles.fieldTitleText}>{LL.common.from()}</themed_1.Text>
      <react_native_1.TouchableWithoutFeedback onPress={toggleModal} accessible={false}>
        <react_native_1.View style={styles.fieldBackground}>
          <react_native_1.View style={styles.walletSelectorTypeContainer}>
            <CurrencyIcon />
          </react_native_1.View>
          <react_native_1.View style={styles.walletSelectorInfoContainer}>
            <react_native_1.View style={styles.walletSelectorTypeTextContainer}>
              {sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc ? (<>
                  <themed_1.Text style={styles.walletCurrencyText}>{LL.common.btcAccount()}</themed_1.Text>
                </>) : (<>
                  <themed_1.Text style={styles.walletCurrencyText}>{LL.common.usdAccount()}</themed_1.Text>
                </>)}
            </react_native_1.View>
            <react_native_1.View style={styles.walletSelectorBalanceContainer}>
              <themed_1.Text {...(0, testProps_1.testProps)(`${sendingWalletDescriptor.currency} Wallet Balance`)}>
                {sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc
            ? btcWalletText
            : usdWalletText}
              </themed_1.Text>
            </react_native_1.View>
            <react_native_1.View />
          </react_native_1.View>

          {persistentState.isAdvanceMode && (<react_native_1.View style={styles.pickWalletIcon}>
              <Ionicons_1.default name={"chevron-down"} size={24} color={colors.black}/>
            </react_native_1.View>)}
        </react_native_1.View>
      </react_native_1.TouchableWithoutFeedback>

      <react_native_modal_1.default style={styles.modal} animationIn="fadeInDown" animationOut="fadeOutUp" isVisible={isModalVisible} onBackButtonPress={toggleModal} onBackdropPress={toggleModal}>
        <react_native_1.View>
          {wallets.map((wallet) => {
            const CurrencyIcon = wallet.walletCurrency === generated_1.WalletCurrency.Btc ? bitcoin_svg_1.default : cash_svg_1.default;
            return (<react_native_1.TouchableWithoutFeedback key={wallet.id} onPress={() => {
                    chooseWallet(wallet);
                }}>
                <react_native_1.View style={styles.walletContainer}>
                  <react_native_1.View style={styles.walletSelectorTypeContainer}>
                    <CurrencyIcon />
                  </react_native_1.View>
                  <react_native_1.View style={styles.walletSelectorInfoContainer}>
                    <react_native_1.View style={styles.walletSelectorTypeTextContainer}>
                      {wallet.walletCurrency === generated_1.WalletCurrency.Btc ? (<themed_1.Text style={styles.walletCurrencyText}>{`${LL.common.btcAccount()}`}</themed_1.Text>) : (<themed_1.Text style={styles.walletCurrencyText}>{`${LL.common.usdAccount()}`}</themed_1.Text>)}
                    </react_native_1.View>
                    <react_native_1.View style={styles.walletSelectorBalanceContainer}>
                      {wallet.walletCurrency === generated_1.WalletCurrency.Btc ? (<themed_1.Text>{btcWalletText}</themed_1.Text>) : (<themed_1.Text>{usdWalletText}</themed_1.Text>)}
                    </react_native_1.View>
                    <react_native_1.View />
                  </react_native_1.View>
                </react_native_1.View>
              </react_native_1.TouchableWithoutFeedback>);
        })}
        </react_native_1.View>
      </react_native_modal_1.default>
    </react_native_1.View>);
};
exports.default = ChooseWallet;
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
    walletContainer: {
        flexDirection: "row",
        borderStyle: "solid",
        overflow: "hidden",
        backgroundColor: colors.grey5,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignItems: "center",
        marginBottom: 10,
        height: 60,
    },
    walletSelectorTypeContainer: {
        marginRight: 20,
    },
    walletSelectorInfoContainer: {
        flex: 1,
        flexDirection: "column",
    },
    walletCurrencyText: {
        fontWeight: "bold",
        fontSize: 18,
    },
    walletSelectorTypeTextContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    walletSelectorBalanceContainer: {
        flex: 1,
        flexDirection: "row",
    },
    fieldTitleText: {
        fontWeight: "bold",
        marginBottom: 4,
    },
    fieldContainer: {
        marginBottom: 12,
    },
    modal: {
        marginBottom: "90%",
    },
    pickWalletIcon: {
        marginRight: 12,
    },
}));
//# sourceMappingURL=ChooseWallet.js.map