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
exports.AmountInput = void 0;
const React = __importStar(require("react"));
const generated_1 = require("@app/graphql/generated");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const i18n_react_1 = require("@app/i18n/i18n-react");
const amounts_1 = require("@app/types/amounts");
const testProps_1 = require("@app/utils/testProps");
const amount_input_modal_1 = require("./amount-input-modal");
const amount_input_button_1 = require("./amount-input-button");
const native_1 = require("@react-navigation/native");
const AmountInput = ({ request, unitOfAccountAmount, walletCurrency, setAmount, maxAmount, minAmount, convertMoneyAmount, canSetAmount = true, isSendingMax = false, showValuesIfDisabled = true, big = true, newDesign = false, title = "Receive", }) => {
    const navigation = (0, native_1.useNavigation)();
    const [isSettingAmount, setIsSettingAmount] = React.useState(false);
    const { formatMoneyAmount, getSecondaryAmountIfCurrencyIsDifferent } = (0, use_display_currency_1.useDisplayCurrency)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    React.useEffect(() => {
        if ((request === null || request === void 0 ? void 0 : request.receivingWalletDescriptor.currency) === "BTC") {
            if (!(request === null || request === void 0 ? void 0 : request.settlementAmount) ||
                !((!minAmount ||
                    (minAmount && (minAmount === null || minAmount === void 0 ? void 0 : minAmount.amount) <= request.settlementAmount.amount)) &&
                    (!maxAmount ||
                        (maxAmount && maxAmount.amount >= request.settlementAmount.amount)))) {
                setIsSettingAmount(true);
            }
        }
    }, [
        request === null || request === void 0 ? void 0 : request.type,
        request === null || request === void 0 ? void 0 : request.receivingWalletDescriptor.currency,
        request === null || request === void 0 ? void 0 : request.settlementAmount,
        minAmount,
        maxAmount,
    ]);
    const onSetAmount = (amount) => {
        if ((request === null || request === void 0 ? void 0 : request.receivingWalletDescriptor.currency) === "BTC" &&
            request.type === "Lightning" &&
            amount.amount === 0) {
            alert(LL.AmountInputButton.enterAmount());
        }
        else {
            setAmount && setAmount(amount);
            setIsSettingAmount(false);
        }
    };
    const closeHandler = () => {
        var _a;
        if ((request === null || request === void 0 ? void 0 : request.receivingWalletDescriptor.currency) === "BTC" &&
            request.type === "Lightning" &&
            !((_a = request === null || request === void 0 ? void 0 : request.settlementAmount) === null || _a === void 0 ? void 0 : _a.amount)) {
            navigation.goBack();
        }
        else {
            setIsSettingAmount(false);
        }
    };
    let formattedPrimaryAmount = undefined;
    let formattedSecondaryAmount = undefined;
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
    if (isSendingMax && formattedPrimaryAmount)
        formattedPrimaryAmount = `~ ${formattedPrimaryAmount} (${LL.SendBitcoinScreen.max()})`;
    const onPressInputButton = () => {
        setIsSettingAmount(true);
    };
    return (<>
      <amount_input_button_1.AmountInputButton placeholder={LL.AmountInputButton.tapToSetAmount()} onPress={onPressInputButton} value={formattedPrimaryAmount} iconName="pencil" secondaryValue={formattedSecondaryAmount} disabled={!canSetAmount} primaryTextTestProps={"Amount Input Button Amount"} showValuesIfDisabled={showValuesIfDisabled} big={big} newDesign={newDesign} {...(0, testProps_1.testProps)("Amount Input Button")}/>
      <amount_input_modal_1.AmountInputModal moneyAmount={unitOfAccountAmount} isOpen={isSettingAmount} walletCurrency={walletCurrency} convertMoneyAmount={convertMoneyAmount} onSetAmount={onSetAmount} maxAmount={maxAmount} minAmount={minAmount} close={closeHandler} title={title}/>
    </>);
};
exports.AmountInput = AmountInput;
//# sourceMappingURL=amount-input.js.map