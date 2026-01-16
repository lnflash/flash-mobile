"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// components
const amount_input_1 = require("@app/components/amount-input");
const payment_destination_display_1 = require("@app/components/payment-destination-display");
// assets
const destination_svg_1 = __importDefault(require("@app/assets/icons/destination.svg"));
const note_svg_1 = __importDefault(require("@app/assets/icons/note.svg"));
const ConfirmationDestinationAmountNote = ({ paymentDetail, invoiceAmount, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const { destination, paymentType, sendingWalletDescriptor, memo: note, unitOfAccountAmount, convertMoneyAmount, isSendingMax, } = paymentDetail;
    return (<>
      {(paymentType === "intraledger" || paymentType === "lnurl") && (<react_native_1.View style={styles.fieldContainer}>
          <themed_1.Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.destination()}</themed_1.Text>
          <react_native_1.View style={styles.fieldBackground}>
            <react_native_1.View style={styles.destinationIconContainer}>
              <destination_svg_1.default fill={colors.black}/>
            </react_native_1.View>
            <payment_destination_display_1.PaymentDestinationDisplay destination={destination} paymentType={paymentType}/>
          </react_native_1.View>
        </react_native_1.View>)}
      <react_native_1.View style={styles.fieldContainer}>
        <themed_1.Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.amount()}</themed_1.Text>
        <amount_input_1.AmountInput unitOfAccountAmount={sendingWalletDescriptor.currency === "USD" && invoiceAmount
            ? invoiceAmount
            : unitOfAccountAmount} canSetAmount={false} isSendingMax={isSendingMax} convertMoneyAmount={convertMoneyAmount} walletCurrency={sendingWalletDescriptor.currency}/>
      </react_native_1.View>
      {note ? (<react_native_1.View style={styles.fieldContainer}>
          <themed_1.Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.note()}</themed_1.Text>
          <react_native_1.View style={styles.fieldBackground}>
            <react_native_1.View style={styles.noteIconContainer}>
              <note_svg_1.default style={styles.noteIcon} color={colors.accent02}/>
            </react_native_1.View>
            <themed_1.Text>{note}</themed_1.Text>
          </react_native_1.View>
        </react_native_1.View>) : null}
    </>);
};
exports.default = ConfirmationDestinationAmountNote;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
    fieldTitleText: {
        fontWeight: "bold",
        marginBottom: 4,
    },
    destinationIconContainer: {
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    noteIconContainer: {
        marginRight: 12,
        justifyContent: "center",
        alignItems: "flex-start",
    },
    noteIcon: {
        justifyContent: "center",
        alignItems: "center",
    },
}));
//# sourceMappingURL=ConfirmationDestinationAmountNote.js.map