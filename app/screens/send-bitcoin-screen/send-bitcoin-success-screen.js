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
// hooks
const client_1 = require("@apollo/client");
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const hooks_1 = require("@app/hooks");
const generated_1 = require("@app/graphql/generated");
// components
const success_animation_1 = require("@app/components/success-animation");
const screen_1 = require("@app/components/screen");
const buttons_1 = require("@app/components/buttons");
const suggestion_modal_1 = require("./suggestion-modal");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
// utils
const testProps_1 = require("../../utils/testProps");
const amounts_1 = require("@app/types/amounts");
const SendBitcoinSuccessScreen = ({ navigation, route }) => {
    var _a;
    const client = (0, client_1.useApolloClient)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { bottom } = (0, react_native_safe_area_context_1.useSafeAreaInsets)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { convertMoneyAmount } = (0, hooks_1.usePriceConversion)();
    const { formatMoneyAmount, getSecondaryAmountIfCurrencyIsDifferent } = (0, hooks_1.useDisplayCurrency)();
    const [showSuggestionModal, setShowSuggestionModal] = (0, react_1.useState)(false);
    const feedbackShownData = (0, generated_1.useFeedbackModalShownQuery)();
    const feedbackModalShown = (_a = feedbackShownData === null || feedbackShownData === void 0 ? void 0 : feedbackShownData.data) === null || _a === void 0 ? void 0 : _a.feedbackModalShown;
    if (!convertMoneyAmount)
        return;
    // useEffect(() => {
    // if (!feedbackModalShown) {
    //   const feedbackTimeout = setTimeout(() => {
    //     requestFeedback()
    //   }, 3000)
    //   return () => {
    //     clearTimeout(feedbackTimeout)
    //   }
    // }
    // }, [client, feedbackModalShown, LL])
    // const dismiss = () => {
    //   logAppFeedback({
    //     isEnjoingApp: false,
    //   })
    //   setShowSuggestionModal(true)
    // }
    // const rateUs = () => {
    //   logAppFeedback({
    //     isEnjoingApp: true,
    //   })
    //   Rate.rate(ratingOptions, (success, errorMessage) => {
    //     if (success) {
    //       getCrashlytics().log("User went to the review page")
    //     }
    //     if (errorMessage) {
    //       getCrashlytics().recordError(new Error(errorMessage))
    //     }
    //   })
    // }
    // const requestFeedback = useCallback(() => {
    //   Alert.alert(
    //     "",
    //     LL.support.enjoyingApp(),
    //     [
    //       {
    //         text: LL.common.No(),
    //         onPress: () => dismiss(),
    //       },
    //       {
    //         text: LL.common.yes(),
    //         onPress: () => rateUs(),
    //       },
    //     ],
    //     {
    //       cancelable: true,
    //       onDismiss: () => dismiss(),
    //     },
    //   )
    //   setFeedbackModalShown(client, true)
    // }, [LL, client])
    let formattedPrimaryAmount = undefined;
    let formattedSecondaryAmount = undefined;
    const { walletCurrency, unitOfAccountAmount, onSuccessAddContact } = route.params;
    (0, react_1.useEffect)(() => {
        const task = react_native_1.InteractionManager.runAfterInteractions(() => {
            onSuccessAddContact === null || onSuccessAddContact === void 0 ? void 0 : onSuccessAddContact();
        });
        return () => task.cancel();
    }, []);
    if ((0, amounts_1.isNonZeroMoneyAmount)(unitOfAccountAmount)) {
        const isBtcDenominatedUsdWalletAmount = walletCurrency === generated_1.WalletCurrency.Usd &&
            unitOfAccountAmount.currency === generated_1.WalletCurrency.Btc;
        const primaryAmount = convertMoneyAmount(unitOfAccountAmount, amounts_1.DisplayCurrency);
        formattedPrimaryAmount = formatMoneyAmount({
            moneyAmount: primaryAmount,
        });
        const secondaryAmount = getSecondaryAmountIfCurrencyIsDifferent({
            primaryAmount,
            walletAmount: convertMoneyAmount(unitOfAccountAmount, walletCurrency),
            displayAmount: convertMoneyAmount(unitOfAccountAmount, amounts_1.DisplayCurrency),
        });
        formattedPrimaryAmount = formatMoneyAmount({
            moneyAmount: primaryAmount,
            isApproximate: isBtcDenominatedUsdWalletAmount && !secondaryAmount,
        });
        formattedSecondaryAmount =
            secondaryAmount &&
                formatMoneyAmount({
                    moneyAmount: secondaryAmount,
                    isApproximate: isBtcDenominatedUsdWalletAmount &&
                        secondaryAmount.currency === generated_1.WalletCurrency.Usd,
                });
    }
    const onPressDone = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: "Primary" }],
        });
    };
    return (<screen_1.Screen unsafe backgroundColor={colors.accent02}>
      <react_native_1.View style={styles.container}>
        <success_animation_1.SuccessIconAnimation>
          <galoy_icon_1.GaloyIcon name={"send-success"} size={128}/>
        </success_animation_1.SuccessIconAnimation>
        <success_animation_1.SuccessTextAnimation>
          <themed_1.Text {...(0, testProps_1.testProps)("Success Text")} type="h01" style={[styles.successText, { marginTop: 32 }]}>
            {LL.SendBitcoinScreen.success()}
          </themed_1.Text>
          <themed_1.Text {...(0, testProps_1.testProps)("Success Text")} type="h03" style={styles.successText}>
            {formattedPrimaryAmount}
          </themed_1.Text>
          <themed_1.Text {...(0, testProps_1.testProps)("Success Text")} type="h01" style={[styles.successText, { color: "rgba(255,255,255,.7)" }]}>
            {formattedSecondaryAmount}
          </themed_1.Text>
        </success_animation_1.SuccessTextAnimation>
      </react_native_1.View>
      <buttons_1.PrimaryBtn label="Done" onPress={onPressDone} btnStyle={{
            backgroundColor: "#fff",
            marginHorizontal: 20,
            marginBottom: bottom || 20,
        }} txtStyle={{ color: "#002118" }}/>
      <suggestion_modal_1.SuggestionModal navigation={navigation} showSuggestionModal={showSuggestionModal} setShowSuggestionModal={setShowSuggestionModal}/>
    </screen_1.Screen>);
};
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    successText: {
        textAlign: "center",
        color: "#fff",
        marginBottom: 8,
    },
}));
exports.default = SendBitcoinSuccessScreen;
//# sourceMappingURL=send-bitcoin-success-screen.js.map