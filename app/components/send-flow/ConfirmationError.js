"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const ConfirmationError = ({ paymentError, invalidAmountErrorMessage, }) => {
    const styles = useStyles();
    const errorMessage = paymentError || invalidAmountErrorMessage;
    if (!!errorMessage) {
        return (<react_native_1.View style={styles.errorContainer}>
        <themed_1.Text style={styles.errorText}>{errorMessage}</themed_1.Text>
      </react_native_1.View>);
    }
    else {
        return null;
    }
};
exports.default = ConfirmationError;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    errorContainer: {
        marginVertical: 20,
        flex: 1,
    },
    errorText: {
        color: colors.error,
        textAlign: "center",
    },
}));
//# sourceMappingURL=ConfirmationError.js.map