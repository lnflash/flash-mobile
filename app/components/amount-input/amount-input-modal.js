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
exports.AmountInputModal = void 0;
const React = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
// components
const amount_input_screen_1 = require("../amount-input-screen");
const AmountInputModal = ({ moneyAmount, walletCurrency, onSetAmount, maxAmount, minAmount, convertMoneyAmount, isOpen, close, title, }) => {
    const styles = useStyles();
    return (<react_native_1.Modal visible={isOpen} style={styles.modal} animationType="slide">
      <react_native_1.SafeAreaView style={styles.amountInputScreenContainer}>
        <amount_input_screen_1.AmountInputScreen initialAmount={moneyAmount} convertMoneyAmount={convertMoneyAmount} walletCurrency={walletCurrency} setAmount={onSetAmount} maxAmount={maxAmount} minAmount={minAmount} goBack={close} title={title}/>
      </react_native_1.SafeAreaView>
    </react_native_1.Modal>);
};
exports.AmountInputModal = AmountInputModal;
const useStyles = (0, themed_1.makeStyles)(({ colors, mode }) => ({
    amountInputScreenContainer: {
        flex: 1,
        backgroundColor: mode === "light" ? colors.white : "#007856",
    },
    modal: {
        margin: 0,
    },
}));
//# sourceMappingURL=amount-input-modal.js.map